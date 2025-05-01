
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

// New function to process the LLM's response, separating narrative and system updates
const processGameMasterResponse = async (llmResponse) => {
  // Basic implementation - replace with actual logic to parse and handle response
  const responseParts = parseLLMResponse(llmResponse);
  const narrativeReport = responseParts.narrative;
  const systemReport = responseParts.system;

  // Example: Update NPC state based on system report (requires further implementation details)
  updateNPCState(systemReport);
  // Update UI/game state with narrativeReport
};

// Helper function to parse the LLM response into narrative and system parts.
const parseLLMResponse = (llmResponse) => {
  // This function needs to be implemented based on the LLM's response format.
  // It should split the response into two parts: narrative and system updates.
  //  A simple example (replace with actual parsing logic):
  const narrative = llmResponse.substring(0, llmResponse.indexOf("SYSTEM_UPDATE:"));
  const system = llmResponse.substring(llmResponse.indexOf("SYSTEM_UPDATE:") + "SYSTEM_UPDATE:".length);
  return {narrative, system};
};

const updateNPCState = (systemReport) => {
  //  This is a placeholder; replace with actual logic to update NPC state based on the system report.
  //  Example:
  try{
    const updates = JSON.parse(systemReport);
    updates.forEach(update => {
        if(update.action === 'updateNPC'){
            const npc = findNPC(update.npcId);
            npc.state = update.newState;
        }
    });
  } catch (error) {
    console.error("Error updating NPC state:", error);
  }
};

const findNPC = (npcId) =>{
    //Implementation to find the NPC based on ID
    //Example:
    return {id: npcId, state: 'minor'};
};

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
