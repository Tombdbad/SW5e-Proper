import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import TranslucentPane from "@/components/ui/TranslucentPane";
import LLMResponseParser from "./LLMResponseParser";
import ClipboardIntegration from "./ClipboardIntegration";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  generateGameMasterReport, parseGameMasterResponse, applyGameMasterResponse, recordGameMasterReport, recordGameMasterResponse,
  type GameState, type StoryEntry,
} from "@/lib/llm/reportHandler";

interface GMReportManagerProps extends GameState {
  // Save the changed fields, as Play does for everything else
  saveCharacter: (changes: Record<string, any>) => Promise<void> | void;
  saveCampaign: (changes: Record<string, any>) => Promise<void> | void;
  // No story turns in the middle of a fight
  disabled?: boolean;
}

// The game master by copy and paste: say what you do, copy the report to an LLM (or a person),
// paste the reply back. The story is kept with the campaign and its changes are applied to the game.
export const GMReportManager: React.FC<GMReportManagerProps> = ({ saveCharacter, saveCampaign, disabled, ...state }) => {
  const [activeTab, setActiveTab] = useState<string>("turn");
  const [action, setAction] = useState("");
  const [report, setReport] = useState("");
  const [debriefId, setDebriefId] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const story: StoryEntry[] = Array.isArray(state.campaign?.sessionLogs) ? state.campaign.sessionLogs : [];

  const buildReport = async () => {
    setReport(generateGameMasterReport(state, action));
    setDebriefId(await recordGameMasterReport(state, action));
  };

  // A pasted reply: its story goes into the log and its changes into the saved game
  const applyReply = async (response: string) => {
    const parsed = parseGameMasterResponse(response);
    if (!parsed.narrative && !parsed.data) throw new Error("The reply is empty.");
    const { characterChanges, campaignChanges, applied } = await applyGameMasterResponse(state, parsed, action);
    if (Object.keys(characterChanges).length) await saveCharacter(characterChanges);
    await saveCampaign(campaignChanges);
    recordGameMasterResponse(debriefId, parsed);
    setAction("");
    setReport("");
    setDebriefId(null);
    setPasted("");
    setActiveTab("story");
    return { applied, problem: parsed.problem };
  };

  return (
    <TranslucentPane className="px-3 py-3" data-testid="gm-interface">
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-yellow-400">Game Master</h3>
        <p className="text-xs text-gray-400">
          There is no built-in game master. Copy the report to an AI chat or a friend, and paste the reply back.
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="turn">Your turn</TabsTrigger>
            <TabsTrigger value="reply">Reply</TabsTrigger>
            <TabsTrigger value="story">Story</TabsTrigger>
          </TabsList>

          <TabsContent value="turn" className="space-y-3 py-2">
            <Textarea
              aria-label="What you do"
              placeholder="What do you do? (Ask around the cantina for work, follow the stranger...)"
              className="min-h-20 text-sm"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            />
            <Button onClick={buildReport} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black" disabled={disabled}>
              {report ? "Rebuild the report" : "Build the report"}
            </Button>
            {disabled && <p className="text-xs text-gray-400">Finish the fight first.</p>}
            {report && (
              <ClipboardIntegration
                outboundData={report}
                onInboundData={(text) => {
                  setPasted(text);
                  setActiveTab("reply");
                }}
                title="Copy to the game master, paste the reply"
              />
            )}
          </TabsContent>

          <TabsContent value="reply" className="py-2">
            <LLMResponseParser initialResponse={pasted} onProcess={applyReply} disabled={disabled} />
          </TabsContent>

          <TabsContent value="story" className="py-2 space-y-3" data-testid="gm-story">
            {story.length === 0 && <p className="text-sm text-gray-400">Nothing has been told yet.</p>}
            {story.slice(-10).reverse().map((entry) => (
              <div key={entry.date} className="bg-gray-700 p-2 rounded text-sm space-y-1">
                <div className="text-xs text-gray-400">
                  {entry.location ?? ""} {entry.action ? `· You: ${entry.action}` : ""}
                </div>
                <p className="whitespace-pre-line">{entry.narrative}</p>
                {entry.applied?.length > 0 && <p className="text-xs text-green-300">{entry.applied.join(" · ")}</p>}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </TranslucentPane>
  );
};

export default GMReportManager;
