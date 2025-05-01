
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateGameReport } from "@/lib/llm/reportHandler";
import { useCharacter } from "@/lib/stores/useCharacter";
import { useCampaign } from "@/lib/stores/useCampaign";
import GMReportDialog from "./GMReportDialog";
import TranslucentPane from "@/components/ui/TranslucentPane";

export const GMReportManager: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentReport, setCurrentReport] = useState<{id?: string, content?: string}>({});
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
      const reportContent = await generateGameReport(character, campaign);
      setCurrentReport({ content: reportContent });
      setDialogOpen(true);
    } catch (error) {
      console.error("Error generating game report:", error);
    }
  };

  return (
    <TranslucentPane className="px-5 py-4">
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-yellow-400">Game Master Interface</h3>

        <p className="text-sm text-gray-300">
          Generate reports for your GM and process their responses to advance your campaign.
        </p>

        <Button 
          onClick={handleGenerateReport}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
          disabled={!character || !campaign}
        >
          Generate GM Report
        </Button>

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
