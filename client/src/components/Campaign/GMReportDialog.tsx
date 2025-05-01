
// Assuming necessary imports are already present
import React, { useState, useEffect } from 'react';
import { processGameMasterResponse } from '@/lib/llm/reportHandler';

interface GMReportDialogProps {
  open?: boolean;
  reportId?: string;
  reportContent?: string;
  onOpenChange: (open: boolean) => void;
}

const GMReportDialog: React.FC<GMReportDialogProps> = ({
  open,
  reportId,
  reportContent,
  onOpenChange
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processSuccess, setProcessSuccess] = useState(false);

  const handleProcess = async () => {
    if (!reportId || !reportContent) return;

    setIsProcessing(true);
    try {
      // Process the entire response - the processing function will split narrative/system parts
      await processGameMasterResponse(reportContent);
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

  useEffect(() => {
    if (open && reportId && reportContent) {
      // Optionally auto-process when dialog opens with content
      // Remove this if you prefer manual processing
      // handleProcess();
    }
  }, [open, reportId, reportContent]);

  return (
    <div>
      {/* Dialog content */}
      {isProcessing && <div>Processing report...</div>}
      {processSuccess && <div>Report processed successfully!</div>}
      {!isProcessing && !processSuccess && reportContent && (
        <div>
          <h3>Game Master Report</h3>
          <div>{reportContent}</div>
          <button onClick={handleProcess}>
            Process Report
          </button>
        </div>
      )}
    </div>
  );
};

export default GMReportDialog;
