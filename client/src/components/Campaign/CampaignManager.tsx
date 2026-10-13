import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiRequest } from "@/lib/queryClient";
import TranslucentPane from "@/components/ui/TranslucentPane";
import {
  AREA_KINDS,
  PATH_KIND,
  addArea,
  childrenOf,
  connectAreas,
  disconnectAreas,
  exitsOf,
  findPath,
  removeArea,
  setGateway,
  setStart,
  trailOf,
  updateArea,
  validateWorld,
  type Area,
  type EditResult,
  type LootCache,
  type Occupant,
  type World,
} from "@shared/logic";

interface CampaignManagerProps {
  campaign: any;
  character?: any;
  // Saves the changed fields; resolves when the server has them
  onSave: (changes: Record<string, any>) => Promise<unknown>;
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

export default function CampaignManager({ campaign, character, onSave }: CampaignManagerProps) {
  // Edits are kept here until Save Campaign sends them
  const [draft, setDraft] = useState({
    name: campaign.name as string,
    description: campaign.description as string,
    npcs: (campaign.npcs ?? []) as any[],
    locations: (campaign.locations ?? []) as any[],
    quests: (campaign.quests ?? []) as any[],
    galaxyMap: (campaign.galaxyMap ?? null) as World | null,
    currentLocation: campaign.currentLocation as string | undefined,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const change = (changes: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...draft, galaxyMap: draft.galaxyMap ?? undefined });
      setDirty(false);
      toast.success("Campaign saved");
    } catch (error) {
      toast.error(`Save failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setSaving(false);
    }
  };

  const [newNpc, setNewNpc] = useState({
    name: "",
    species: "",
    role: "",
    description: "",
  });
  const [newLocation, setNewLocation] = useState({
    name: "",
    type: "",
    description: "",
  });
  const [newQuest, setNewQuest] = useState({
    title: "",
    description: "",
    objectives: [{ description: "", completed: false }],
  });

  // Add new NPC
  const handleAddNpc = () => {
    if (!newNpc.name || !newNpc.species || !newNpc.role) return;
    change({ npcs: [...draft.npcs, { id: newId("npc"), ...newNpc }] });
    setNewNpc({ name: "", species: "", role: "", description: "" });
  };

  // Add new location (campaigns without a generated world keep a plain list of places)
  const handleAddLocation = () => {
    if (!newLocation.name || !newLocation.type || !newLocation.description) return;
    change({ locations: [...draft.locations, { id: newId("location"), ...newLocation }] });
    setNewLocation({ name: "", type: "", description: "" });
  };

  // Add new quest
  const handleAddQuest = () => {
    if (!newQuest.title || !newQuest.description || !newQuest.objectives[0].description) return;
    change({ quests: [...draft.quests, { id: newId("quest"), ...newQuest, status: "inactive" }] });
    setNewQuest({ title: "", description: "", objectives: [{ description: "", completed: false }] });
  };

  // Add objective to new quest
  const handleAddObjective = () => {
    setNewQuest({
      ...newQuest,
      objectives: [
        ...newQuest.objectives,
        { description: "", completed: false },
      ],
    });
  };

  // Update objective
  const handleObjectiveChange = (index: number, value: string) => {
    const updatedObjectives = [...newQuest.objectives];
    updatedObjectives[index].description = value;

    setNewQuest({
      ...newQuest,
      objectives: updatedObjectives,
    });
  };

  // Remove objective
  const handleRemoveObjective = (index: number) => {
    if (newQuest.objectives.length <= 1) return;

    const updatedObjectives = newQuest.objectives.filter((_, i) => i !== index);
    setNewQuest({
      ...newQuest,
      objectives: updatedObjectives,
    });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <Label htmlFor="campaignName">Campaign Name</Label>
          <Input
            id="campaignName"
            value={draft.name}
            onChange={(e) => change({ name: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="campaignDescription">Description</Label>
          <Textarea
            id="campaignDescription"
            value={draft.description}
            onChange={(e) => change({ description: e.target.value })}
            className="mt-1 h-24"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save Campaign"}
          </Button>
          <span className="text-sm text-gray-400">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        </div>
      </div>

      <Separator />

      <WorldEditor
        world={draft.galaxyMap}
        partyLevel={Number(character?.level) || 1}
        onChange={(world, startChanged) =>
          change({ galaxyMap: world, ...(startChanged && world ? { currentLocation: world.startId } : {}) })
        }
      />

      <Separator />

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">NPCs</h3>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Add NPC</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New NPC</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="npcName">Name</Label>
                  <Input
                    id="npcName"
                    value={newNpc.name}
                    onChange={(e) =>
                      setNewNpc({ ...newNpc, name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="npcSpecies">Species</Label>
                  <Input
                    id="npcSpecies"
                    value={newNpc.species}
                    onChange={(e) =>
                      setNewNpc({ ...newNpc, species: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="npcRole">Role</Label>
                  <Input
                    id="npcRole"
                    value={newNpc.role}
                    onChange={(e) =>
                      setNewNpc({ ...newNpc, role: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="npcDescription">Description</Label>
                  <Textarea
                    id="npcDescription"
                    value={newNpc.description}
                    onChange={(e) =>
                      setNewNpc({ ...newNpc, description: e.target.value })
                    }
                    className="h-20"
                  />
                </div>

                <Button onClick={handleAddNpc} className="w-full">
                  Add NPC
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {draft.npcs.map((npc: any, index: number) => (
            <Card key={index} className="bg-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-base">{npc.name}</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p>
                  <strong>Species:</strong> {npc.species}
                </p>
                <p>
                  <strong>Role:</strong> {npc.role}
                </p>
                <p className="mt-2 text-sm text-gray-300">{npc.description}</p>
              </CardContent>
            </Card>
          ))}

          {draft.npcs.length === 0 && (
            <div className="col-span-2 text-center py-6 text-gray-400">
              No NPCs added yet
            </div>
          )}
        </div>
      </div>

      <Separator />

      <div className={draft.galaxyMap ? "hidden" : "space-y-4"}>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Locations</h3>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Add Location</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Location</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="locationName">Name</Label>
                  <Input
                    id="locationName"
                    value={newLocation.name}
                    onChange={(e) =>
                      setNewLocation({ ...newLocation, name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="locationType">Type</Label>
                  <select
                    id="locationType"
                    value={newLocation.type}
                    onChange={(e) =>
                      setNewLocation({ ...newLocation, type: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select Type</option>
                    <option value="Planet">Planet</option>
                    <option value="City">City</option>
                    <option value="Spaceport">Spaceport</option>
                    <option value="Space Station">Space Station</option>
                    <option value="Outpost">Outpost</option>
                    <option value="Ruins">Ruins</option>
                    <option value="Wilderness">Wilderness</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="locationDescription">Description</Label>
                  <Textarea
                    id="locationDescription"
                    value={newLocation.description}
                    onChange={(e) =>
                      setNewLocation({
                        ...newLocation,
                        description: e.target.value,
                      })
                    }
                    className="h-20"
                    placeholder="Describe the location."
                  />
                </div>

                <Button onClick={handleAddLocation} className="w-full">
                  Add Location
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {draft.locations.map((location: any, index: number) => (
            <Card key={index} className="bg-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-base">{location.name}</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p>
                  <strong>Type:</strong> {location.type}
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  {location.description}
                </p>
              </CardContent>
            </Card>
          ))}

          {draft.locations.length === 0 && (
            <div className="col-span-2 text-center py-6 text-gray-400">
              No locations added yet
            </div>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Quests</h3>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Add Quest</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Quest</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="questTitle">Title</Label>
                  <Input
                    id="questTitle"
                    value={newQuest.title}
                    onChange={(e) =>
                      setNewQuest({ ...newQuest, title: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="questDescription">Description</Label>
                  <Textarea
                    id="questDescription"
                    value={newQuest.description}
                    onChange={(e) =>
                      setNewQuest({ ...newQuest, description: e.target.value })
                    }
                    className="h-20"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Objectives</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddObjective}
                    >
                      Add Objective
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {newQuest.objectives.map((objective, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={objective.description}
                          onChange={(e) =>
                            handleObjectiveChange(index, e.target.value)
                          }
                          placeholder="Objective description"
                        />
                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() => handleRemoveObjective(index)}
                          disabled={newQuest.objectives.length <= 1}
                        >
                          &times;
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button onClick={handleAddQuest} className="w-full">
                  Add Quest
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {draft.quests.map((quest: any, index: number) => (
            <Card key={index} className="bg-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-base flex justify-between">
                  <span>{quest.title}</span>
                  <span className="text-sm font-normal text-gray-400">
                    {quest.status === "active"
                      ? "Active"
                      : quest.status === "completed"
                        ? "Completed"
                        : "Inactive"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-sm text-gray-300 mb-3">
                  {quest.description}
                </p>

                <div>
                  <h4 className="font-semibold text-sm mb-1">Objectives:</h4>
                  <ul className="list-disc list-inside text-sm">
                    {quest.objectives.map((objective: any, idx: number) => (
                      <li
                        key={idx}
                        className={
                          objective.completed
                            ? "text-gray-500 line-through"
                            : ""
                        }
                      >
                        {objective.description}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}

          {draft.quests.length === 0 && (
            <div className="text-center py-6 text-gray-400">
              No quests added yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// World: generate, browse and edit the campaign's map. The rules live in shared/logic; whatever
// needs the rules data (generating, re-rolling, stat blocks) is asked of the server.
// ---------------------------------------------------------------------------------------------

const DANGER = ["Safe", "Easy", "Medium", "Hard", "Deadly"];
const ANTAGONISTS = ["Galactic Empire", "Hutt Cartel", "Trade Federation", "Black Sun", "Sith Empire"];
const fieldClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

interface WorldEditorProps {
  world: World | null;
  partyLevel: number;
  onChange: (world: World | null, startChanged?: boolean) => void;
}

function WorldEditor({ world, partyLevel, onChange }: WorldEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState({ seed: "", systemsPerRegion: "1", antagonist: "", startPlanet: "" });
  const [rulesProblems, setRulesProblems] = useState<string[] | null>(null);
  const [newChild, setNewChild] = useState({ name: "", type: "" });
  const [newPath, setNewPath] = useState({ to: "", label: "" });
  const [newPerson, setNewPerson] = useState({ name: "", role: "" });
  const [search, setSearch] = useState<{ dataset: "monsters" | "equipment" | "enhancedItems"; text: string; results: any[] }>({
    dataset: "monsters",
    text: "",
    results: [],
  });

  const post = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      return await (await apiRequest("POST", path, body)).json();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    const result = await post("/api/world/generate", {
      options: {
        partyLevel,
        seed: options.seed ? Number(options.seed) : undefined,
        systemsPerRegion: Number(options.systemsPerRegion),
        antagonist: options.antagonist || undefined,
        startPlanet: options.startPlanet || undefined,
      },
    });
    if (!result) return;
    onChange(result.world, true);
    setSelectedId(result.world.startId);
    setRulesProblems(result.problems);
  };

  if (!world) {
    return (
      <div className="space-y-4" data-testid="world-editor">
        <h3 className="text-lg font-semibold">World</h3>
        <p className="text-sm text-gray-300">
          This campaign has no map yet. Generate one: galactic regions, star systems and planets, with the starting
          planet built out into settlements, buildings and rooms, and people, creatures, ships and loot placed in them.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="worldSeed">Seed (blank for random)</Label>
            <Input id="worldSeed" value={options.seed} onChange={(e) => setOptions({ ...options, seed: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div>
            <Label htmlFor="worldPlanet">Starting planet (blank for random)</Label>
            <Input id="worldPlanet" value={options.startPlanet} onChange={(e) => setOptions({ ...options, startPlanet: e.target.value })} placeholder="Tatooine, Naboo, Coruscant ..." />
          </div>
          <div>
            <Label htmlFor="worldEnemy">Hostile faction</Label>
            <select id="worldEnemy" className={fieldClass} value={options.antagonist} onChange={(e) => setOptions({ ...options, antagonist: e.target.value })}>
              <option value="">Random</option>
              {ANTAGONISTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="worldSize">Star systems per region, at least</Label>
            <select id="worldSize" className={fieldClass} value={options.systemsPerRegion} onChange={(e) => setOptions({ ...options, systemsPerRegion: e.target.value })}>
              <option value="1">1 (small)</option>
              <option value="2">2 (medium)</option>
              <option value="3">3 (large)</option>
            </select>
          </div>
        </div>
        <Button onClick={generate} disabled={busy}>
          {busy ? "Generating..." : "Generate World"}
        </Button>
      </div>
    );
  }

  const area: Area = world.areas[selectedId ?? ""] ?? world.areas[world.startId];
  const trail = trailOf(world, area.id);
  const children = childrenOf(world, area.id);
  const exits = exitsOf(world, area.id);
  const childKind = AREA_KINDS[AREA_KINDS.indexOf(area.kind) + 1];
  const problems = validateWorld(world);
  const route = findPath(world, world.startId, area.id);
  const counts = AREA_KINDS.slice(2).map((kind) => `${Object.values(world.areas).filter((a) => a.kind === kind).length} ${kind}s`);
  // Areas this one could be joined to: the same kind, in the same place (any system for systems)
  const joinable = PATH_KIND[area.kind]
    ? Object.values(world.areas).filter(
        (a) =>
          a.kind === area.kind &&
          a.id !== area.id &&
          (area.kind === "system" || a.parentId === area.parentId) &&
          !exits.some((e) => e.via === "path" && e.to === a.id),
      )
    : [];

  const apply = (result: EditResult, startChanged = false) => {
    if (result.error) toast.error(result.error);
    else onChange(result.world, startChanged);
  };
  const edit = (changes: Partial<Area>) => apply(updateArea(world, area.id, changes));
  const rework = async (path: string) => {
    const result = await post(path, { world, areaId: area.id });
    if (!result) return;
    onChange(result.world);
    setRulesProblems(result.problems);
  };
  const runSearch = async (dataset: typeof search.dataset, text: string) => {
    setSearch({ dataset, text, results: [] });
    if (text.trim().length < 2) return;
    const res = await fetch(`/api/sw5e/${dataset}?limit=8&search=${encodeURIComponent(text.trim())}&fields=id,name,challengeRating,searchableRarity,cost`);
    if (res.ok) setSearch({ dataset, text, results: await res.json() });
  };
  const addStatBlock = async (id: string) => {
    const occupant = await post("/api/world/occupant", { statBlock: id });
    if (occupant) edit({ occupants: [...area.occupants, { ...occupant, id: newId("o") }] });
    setSearch({ ...search, text: "", results: [] });
  };
  const addItem = (cache: LootCache, row: any) => {
    const item = { name: row.name, quantity: 1, source: search.dataset as "equipment" | "enhancedItems", rarity: row.searchableRarity };
    edit({ loot: area.loot.map((c) => (c.id === cache.id ? { ...c, items: [...c.items, item] } : c)) });
    setSearch({ ...search, text: "", results: [] });
  };

  return (
    <div className="space-y-4" data-testid="world-editor">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg font-semibold">World</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            const result = await post("/api/world/validate", { world });
            if (result) setRulesProblems(result.problems);
          }}>
            Check Against Rules Data
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => { onChange(null); setSelectedId(null); setRulesProblems(null); }}>
            Discard World
          </Button>
        </div>
      </div>
      <p className="text-sm text-gray-300">
        Seed {world.seed} · party level {world.partyLevel} · hostile faction: {world.antagonist} · {counts.join(", ")}, {world.paths.length} paths
      </p>
      <p className={`text-sm ${problems.length ? "text-red-400" : "text-green-400"}`} data-testid="world-status">
        {problems.length ? `Map problems: ${problems.join(" ")}` : "Map is sound: every area can be reached from the start."}
        {rulesProblems && (rulesProblems.length ? ` Rules data: ${rulesProblems.join(" ")}` : " Every stat block and item is in the rules data.")}
      </p>

      <TranslucentPane className="p-4 space-y-4">
        {/* Where we are: galaxy > region > system > planet > settlement > building > room */}
        <div className="flex flex-wrap gap-1 text-sm" data-testid="world-trail">
          {trail.map((a, i) => (
            <span key={a.id}>
              {i > 0 && <span className="text-gray-500 mx-1">&rsaquo;</span>}
              <button type="button" className={a.id === area.id ? "text-yellow-400 font-semibold" : "text-blue-300 underline"} onClick={() => setSelectedId(a.id)}>
                {a.name}
              </button>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="areaName">Name ({area.kind})</Label>
            <Input id="areaName" key={area.id} defaultValue={area.name} onBlur={(e) => e.target.value !== area.name && edit({ name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="areaType">Type</Label>
            <Input id="areaType" key={area.id} defaultValue={area.type} onBlur={(e) => e.target.value !== area.type && edit({ type: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="areaDescription">Description</Label>
            <Textarea id="areaDescription" key={area.id} defaultValue={area.description} className="h-16" onBlur={(e) => e.target.value !== area.description && edit({ description: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="areaDanger">Danger (sets the size of fights when contents are re-rolled)</Label>
            <select id="areaDanger" className={fieldClass} value={area.danger} onChange={(e) => edit({ danger: Number(e.target.value) })}>
              {DANGER.map((label, value) => (
                <option key={label} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {area.parentId && !["region", "system"].includes(area.kind) && (
              <Button size="sm" variant={area.gateway ? "default" : "outline"} onClick={() => apply(setGateway(world, area.id, !area.gateway))}>
                {area.gateway ? "Is a way in and out" : "Make a way in and out"}
              </Button>
            )}
            {!["galaxy", "region"].includes(area.kind) && (
              <Button size="sm" variant={world.startId === area.id ? "default" : "outline"} onClick={() => apply(setStart(world, area.id), true)}>
                {world.startId === area.id ? "Party starts here" : "Start the party here"}
              </Button>
            )}
            {!["galaxy", "region"].includes(area.kind) && (
              <Button size="sm" variant="destructive" onClick={() => {
                const result = removeArea(world, area.id);
                if (!result.error) setSelectedId(area.parentId);
                apply(result);
              }}>
                Delete
              </Button>
            )}
          </div>
        </div>
        {route && route.length > 1 && (
          <p className="text-xs text-gray-400" data-testid="world-route">
            From the start ({route.length - 1} moves): {route.map((id) => world.areas[id].name).join(" → ")}
          </p>
        )}

        {/* Ways out */}
        <div>
          <h4 className="font-semibold mb-1">Paths from here</h4>
          <ul className="space-y-1 text-sm" data-testid="world-exits">
            {exits.map((exit) => (
              <li key={`${exit.via}-${exit.to}`} className="flex flex-wrap items-center gap-2">
                <button type="button" className="text-blue-300 underline" onClick={() => setSelectedId(exit.to)}>
                  {exit.label}{exit.via === "path" ? " to" : ""} {world.areas[exit.to].name}
                </button>
                <span className="text-gray-400">
                  {[exit.travel, exit.locked && `locked, DC ${exit.locked}`, exit.hidden && "hidden", exit.needsShip && "needs a ship"].filter(Boolean).join(" · ")}
                </span>
                {exit.pathId && (
                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => apply(disconnectAreas(world, exit.pathId!))}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
            {exits.length === 0 && <li className="text-gray-400">None.</li>}
          </ul>
          {joinable.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <select aria-label="Join to" className={`${fieldClass} md:w-64`} value={newPath.to} onChange={(e) => setNewPath({ ...newPath, to: e.target.value })}>
                <option value="">Join to ...</option>
                {joinable.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <Input aria-label="Path name" className="md:w-48" placeholder={`Name (${PATH_KIND[area.kind]})`} value={newPath.label} onChange={(e) => setNewPath({ ...newPath, label: e.target.value })} />
              <Button size="sm" disabled={!newPath.to} onClick={() => {
                apply(connectAreas(world, area.id, newPath.to, { label: newPath.label || undefined }));
                setNewPath({ to: "", label: "" });
              }}>
                Add Path
              </Button>
            </div>
          )}
        </div>

        {/* What is inside */}
        {childKind && (
          <div>
            <h4 className="font-semibold mb-1 capitalize">{childKind}s inside</h4>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm" data-testid="world-children">
              {children.map((child) => (
                <li key={child.id}>
                  <button type="button" className="text-blue-300 underline" onClick={() => setSelectedId(child.id)}>
                    {child.name}
                  </button>
                  <span className="text-gray-400">
                    {" "}{child.type}{child.gateway ? " · way in" : ""}{child.danger ? ` · ${DANGER[child.danger].toLowerCase()}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {children.length === 0 && ["system", "planet", "settlement", "building"].includes(area.kind) && (
              <Button size="sm" className="mt-2" disabled={busy} onClick={() => rework("/api/world/expand")}>
                {busy ? "Generating..." : "Generate What Is Inside"}
              </Button>
            )}
            {childKind !== "region" && (
              <div className="flex flex-wrap gap-2 mt-2">
                <Input aria-label={`New ${childKind} name`} className="md:w-56" placeholder={`New ${childKind} name`} value={newChild.name} onChange={(e) => setNewChild({ ...newChild, name: e.target.value })} />
                <Input aria-label={`New ${childKind} type`} className="md:w-40" placeholder="Type" value={newChild.type} onChange={(e) => setNewChild({ ...newChild, type: e.target.value })} />
                <Button size="sm" disabled={!newChild.name.trim()} onClick={() => {
                  apply(addArea(world, area.id, newChild));
                  setNewChild({ name: "", type: "" });
                }}>
                  Add {childKind}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Who and what is here */}
        <div>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
            <h4 className="font-semibold">Who and what is here</h4>
            {["planet", "settlement", "building", "room"].includes(area.kind) && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => rework("/api/world/populate")}>
                Re-roll {area.kind === "room" ? "Contents" : "Everything Inside"}
              </Button>
            )}
          </div>
          <ul className="space-y-1 text-sm" data-testid="world-occupants">
            {area.occupants.map((o: Occupant) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {o.count > 1 ? `${o.count} x ` : ""}{o.name}
                  <span className="text-gray-400">
                    {" "}{[o.species, o.role, o.cr && `CR ${o.cr}`, o.armorClass && `AC ${o.armorClass}`, o.hitPoints && `${o.hitPoints} HP`].filter(Boolean).join(", ")}
                    {o.loadout.length ? ` · ${o.loadout.join(", ")}` : ""}
                  </span>
                </span>
                <select aria-label="Disposition" className="bg-gray-800 rounded px-1 text-xs" value={o.disposition} onChange={(e) => edit({ occupants: area.occupants.map((x) => (x.id === o.id ? { ...x, disposition: e.target.value as Occupant["disposition"] } : x)) })}>
                  <option value="friendly">friendly</option>
                  <option value="neutral">neutral</option>
                  <option value="hostile">hostile</option>
                </select>
                <Input aria-label="Count" type="number" min={1} className="h-6 w-14 px-1" value={o.count} onChange={(e) => edit({ occupants: area.occupants.map((x) => (x.id === o.id ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => edit({ occupants: area.occupants.filter((x) => x.id !== o.id) })}>
                  Remove
                </Button>
              </li>
            ))}
            {area.ships.map((ship) => (
              <li key={ship.id} className="flex flex-wrap items-center gap-2">
                <span>
                  Ship: {ship.name}
                  <span className="text-gray-400">
                    {" "}{ship.size} {ship.role.toLowerCase()}, {ship.status}, {ship.owner}, hyperdrive {ship.hyperdriveClass ? `class ${ship.hyperdriveClass}` : "none"} · {ship.equipment.join(", ")}
                  </span>
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => edit({ ships: area.ships.filter((x) => x.id !== ship.id) })}>
                  Remove
                </Button>
              </li>
            ))}
            {area.loot.map((cache) => (
              <li key={cache.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {cache.name}
                  <span className="text-gray-400">
                    {" "}{[cache.locked && `locked, DC ${cache.locked}`, cache.hidden && "hidden", cache.looted && "emptied"].filter(Boolean).join(", ")}
                    {" "}{cache.items.map((i) => `${i.quantity > 1 ? `${i.quantity} x ` : ""}${i.name}${i.rarity ? ` (${i.rarity.toLowerCase()})` : ""}`).join(", ")}
                  </span>
                </span>
                <Input aria-label="Credits" type="number" min={0} className="h-6 w-24 px-1" value={cache.credits} onChange={(e) => edit({ loot: area.loot.map((c) => (c.id === cache.id ? { ...c, credits: Math.max(0, Number(e.target.value) || 0) } : c)) })} />
                <span className="text-gray-400">cr</span>
                {search.dataset !== "monsters" && search.results.map((row) => (
                  <Button key={row.id} size="sm" variant="outline" className="h-6 px-2" onClick={() => addItem(cache, row)}>
                    + {row.name}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => edit({ loot: area.loot.filter((c) => c.id !== cache.id) })}>
                  Remove
                </Button>
              </li>
            ))}
            {area.occupants.length + area.ships.length + area.loot.length === 0 && <li className="text-gray-400">Nothing and no one.</li>}
          </ul>

          <div className="flex flex-wrap gap-2 mt-2">
            <select aria-label="Search in" className={`${fieldClass} md:w-44`} value={search.dataset} onChange={(e) => runSearch(e.target.value as typeof search.dataset, search.text)}>
              <option value="monsters">Stat blocks</option>
              <option value="equipment">Equipment</option>
              <option value="enhancedItems">Enhanced items</option>
            </select>
            <Input aria-label="Search the rules data" className="md:w-64" placeholder="Search the rules data by name" value={search.text} onChange={(e) => runSearch(search.dataset, e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => edit({ loot: [...area.loot, { id: newId("l"), name: "Cache", kind: "custom", credits: 0, items: [] }] })}>
              Add Loot Cache
            </Button>
          </div>
          {search.dataset === "monsters" && search.results.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2" data-testid="world-search-results">
              {search.results.map((row) => (
                <Button key={row.id} size="sm" variant="outline" disabled={busy} onClick={() => addStatBlock(row.id)}>
                  + {row.name} (CR {row.challengeRating})
                </Button>
              ))}
            </div>
          )}
          {search.dataset !== "monsters" && search.results.length > 0 && area.loot.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Add a loot cache first, then pick an item to put in it.</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <Input aria-label="Person's name" className="md:w-48" placeholder="Person's name" value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} />
            <Input aria-label="Person's role" className="md:w-40" placeholder="Role" value={newPerson.role} onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })} />
            <Button size="sm" variant="outline" disabled={!newPerson.name.trim()} onClick={() => {
              edit({ occupants: [...area.occupants, { id: newId("o"), name: newPerson.name.trim(), role: newPerson.role.trim() || "resident", disposition: "neutral", count: 1, loadout: [] }] });
              setNewPerson({ name: "", role: "" });
            }}>
              Add Person
            </Button>
          </div>
        </div>
      </TranslucentPane>
    </div>
  );
}
