
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { processLLMResponse } from "@/lib/llm/debriefCompiler";

interface GMReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId?: string;
  reportContent?: string;
}

export const GMReportDialog: React.FC<GMReportDialogProps> = ({
  open,
  onOpenChange,
  reportId,
  reportContent,
}) => {
  const [copied, setCopied] = useState(false);
  const [llmResponse, setLlmResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processSuccess, setProcessSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setLlmResponse("");
      setProcessSuccess(false);
    }
  }, [open]);

  const handleCopy = () => {
    if (reportContent) {
      navigator.clipboard.writeText(reportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleProcess = async () => {
    if (!reportId || !llmResponse) return;

    setIsProcessing(true);
    try {
      await processLLMResponse(reportId, llmResponse);
      setProcessSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (error) {
      console.error("Error processing response:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] text-white bg-gray-800 border-yellow-400">
        <DialogHeader>
          <DialogTitle className="text-yellow-400">Game Master Report</DialogTitle>
        </DialogHeader>

        {reportContent && (
          <>
            <div className="space-y-2">
              <label className="text-sm text-yellow-400 font-medium">
                Copy this text and paste it to your preferred LLM (ChatGPT, etc.):
              </label>
              <div className="relative">
                <Textarea
                  value={reportContent}
                  readOnly
                  className="h-60 font-mono text-sm bg-gray-900 border-gray-700"
                />
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="absolute top-2 right-2"
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <label className="text-sm text-yellow-400 font-medium">
                Paste the LLM's response below:
              </label>
              <Textarea
                value={llmResponse}
                onChange={(e) => setLlmResponse(e.target.value)}
                className="h-60 font-mono text-sm bg-gray-900 border-gray-700"
                placeholder="Paste the LLM's response here..."
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-gray-600"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleProcess} 
            disabled={!llmResponse || isProcessing || processSuccess}
            className="bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            {isProcessing ? "Processing..." : processSuccess ? "Success!" : "Process Response"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GMReportDialog;
