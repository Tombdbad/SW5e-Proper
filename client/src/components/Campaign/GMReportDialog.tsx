
// Assuming necessary imports are already present
import React, { useState, useEffect } from 'react';
import { processGameMasterResponse } from '@/lib/llm/reportHandler';

const handleProcess = async (reportId, llmResponse, setIsProcessing, setProcessSuccess, onOpenChange) => {
    if (!reportId || !llmResponse) return;

    setIsProcessing(true);
    try {
      // Process the entire response - the processing function will split narrative/system parts
      await processGameMasterResponse(llmResponse);
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

  // The helper functions parseLLMResponse, updateNPCState, and findNPC are removed
  // as we now use the imported processGameMasterResponse from reportHandler


interface GMReportDialogProps {
  open?: boolean;
  reportId?: string;
  reportContent?: string;
  onOpenChange: (open: boolean) => void;
}

const GMReportDialog: React.FC<GMReportDialogProps> = ({
  open,
  reportId,
  reportContent: llmResponse,
  onOpenChange
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processSuccess, setProcessSuccess] = useState(false);

  useEffect(() => {
    if (reportId && llmResponse) {
      handleProcess(reportId, llmResponse, setIsProcessing, setProcessSuccess, onOpenChange);
    }
  }, [reportId, llmResponse, onOpenChange]);

  return (
    <div>
      {/* Dialog content */}
      {isProcessing && <div>Processing report...</div>}
      {processSuccess && <div>Report processed successfully!</div>}
      {!isProcessing && !processSuccess && llmResponse && (
        <div>
          <h3>Game Master Report</h3>
          <div>{llmResponse}</div>
          <button onClick={() => handleProcess(reportId, llmResponse, setIsProcessing, setProcessSuccess, onOpenChange)}>
            Process Report
          </button>
        </div>
      )}
    </div>
  );
};

export default GMReportDialog;
