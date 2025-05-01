
  import React, { useState, useEffect } from "react";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { generateGameReport } from "@/lib/llm/reportHandler";
  import { useCharacter } from "@/lib/stores/useCharacter";
  import { useCampaign } from "@/lib/stores/useCampaign";
  import GMReportDialog from "./GMReportDialog";
  import TranslucentPane from "@/components/ui/TranslucentPane";
  import LLMResponseParser from './LLMResponseParser';
  import ClipboardIntegration from './ClipboardIntegration';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { Spinner } from '@/components/ui/spinner';
  import { processGameMasterResponse } from '@/lib/llm/reportHandler';

  export const GMReportManager: React.FC = () => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [currentReport, setCurrentReport] = useState<{id?: string, content?: string}>({});
    const [activeTab, setActiveTab] = useState<string>("generate");
    const [isGenerating, setIsGenerating] = useState(false);
    const [llmResponse, setLlmResponse] = useState<string>('');
    const [processingResult, setProcessingResult] = useState<any>(null);
  const character = useCharacter(state => state.character);
  const campaign = useCampaign(state => state.campaign);

  useEffect(() => {
    // Listen for custom events from the debrief compiler
    const handleShowReport = (event: CustomEvent) => {
      const { id, content } = event.detail;
      setCurrentReport({ id, content });
      setDialogOpen(true);
    };

    window.addEventListener('show-gm-report', handleShowReport as EventListener);

    return () => {
      window.removeEventListener('show-gm-report', handleShowReport as EventListener);
    };
  }, []);

  const handleGenerateReport = async () => {
    if (!character || !campaign) return;

    try {
              setIsGenerating(true);
              const reportContent = await generateGameReport(character, campaign);
              setCurrentReport({ content: reportContent });
              setDialogOpen(true);
            } catch (error) {
              console.error("Error generating game report:", error);
            } finally {
              setIsGenerating(false);
            }
          };

          const handleLlmResponseReceived = async (response: string) => {
            setLlmResponse(response);

            // Automatically switch to process tab
            setActiveTab("process");

            try {
              await processGameMasterResponse(response);
              setProcessingResult({
                success: true,
                message: "Response processed successfully"
              });
            } catch (error) {
              console.error("Error processing LLM response:", error);
              setProcessingResult({
                success: false,
                message: "Failed to process response. Please check format."
              });
            }
          };

          return (
            <TranslucentPane className="px-5 py-4">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-yellow-400">Game Master Interface</h3>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="generate">Generate Report</TabsTrigger>
                    <TabsTrigger value="clipboard">Clipboard Tools</TabsTrigger>
                    <TabsTrigger value="process">Process Response</TabsTrigger>
                  </TabsList>

                  <TabsContent value="generate" className="space-y-4 py-2">
                    <p className="text-sm text-gray-300">
                      Generate a new report for your GM to advance your campaign.
                    </p>

                    <Button 
                      onClick={handleGenerateReport}
                      className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                      disabled={!character || !campaign || isGenerating}
                    >
                      {isGenerating ? (
                        <span className="flex items-center">
                          <Spinner className="mr-2" /> Generating...
                        </span>
                      ) : 'Generate GM Report'}
                    </Button>

                    {currentReport.content && (
                      <p className="text-xs text-green-400">
                        Report generated! You can view it in the dialog or use the Clipboard Tools tab.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="clipboard" className="py-2">
                    <ClipboardIntegration 
                      outboundData={currentReport.content || ""}
                      onInboundData={handleLlmResponseReceived}
                      title="Transfer Data Between App & LLM"
                    />
                  </TabsContent>

                  <TabsContent value="process" className="py-2">
                    <LLMResponseParser 
                      onProcessed={(result) => setProcessingResult(result)}
                    />
                  </TabsContent>
                </Tabs>

                <GMReportDialog 
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          reportId={currentReport.id}
          reportContent={currentReport.content}
        />
      </div>
    </TranslucentPane>
  );
};

export default GMReportManager;
