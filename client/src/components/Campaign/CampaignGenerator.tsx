
import React, { useState } from 'react';
import { CampaignElementGenerator } from '../../lib/sw5e/campaignGenerator';
import { CharacterProfile } from '../../lib/sw5e/characterProfileParser';
import TranslucentPane from '../ui/TranslucentPane';
import { Character } from '../../shared/schema';
import { trailOf, isLocal, ERAS, DEFAULT_ERA, eraById, START_TIME, type Quest, type World } from '@shared/logic';

interface CampaignGeneratorProps {
  character: Character;
  onSave: (campaignData: any) => void;
}

// What is shown and saved comes from the generated world: its places, the people and enemies
// placed in it from the rules data, and the quests read off it. The era decides which enemies
// there can be; the older text generator's pick (the faction opposed to the character's
// alignment) is used when the era has it, else the world picks one of the era's.
export default function CampaignGenerator({ character, onSave }: CampaignGeneratorProps) {
  const [draft, setDraft] = useState<{ world: World; quests: Quest[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eraId, setEraId] = useState(DEFAULT_ERA);
  const era = eraById(eraId);

  const convertCharacterToProfile = (character: Character): CharacterProfile => {
    return {
      name: character.name,
      species: character.species,
      class: character.class,
      level: character.level,
      background: character.background,
      alignment: character.alignment,
      forceAlignment: character.forceAlignment,
      abilities: character.abilityScores as any,
      skillProficiencies: Array.isArray(character.skillProficiencies)
        ? character.skillProficiencies
        : Object.keys(character.skillProficiencies || {})
    };
  };

  const generateCampaign = async () => {
    setGenerating(true);
    setError(null);
    try {
      const wanted = new CampaignElementGenerator().generatePrimaryObjective(convertCharacterToProfile(character)).target;
      const antagonist = era.antagonists.includes(wanted) ? wanted : undefined;
      const response = await fetch('/api/world/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: { antagonist, era: era.id, partyLevel: character.level } }),
      });
      if (!response.ok) throw new Error('The server could not generate a world');
      const generated = await response.json();
      setDraft({ world: generated.world, quests: generated.quests ?? [] });
    } catch (error) {
      console.error("Error generating campaign:", error);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  };

  // The starting planet: where the party begins, its sites, and who was placed on it
  const world = draft?.world;
  const start = world ? world.areas[world.startId] : null;
  const trail = world && start ? trailOf(world, start.id) : [];
  const planet = trail.find((area) => area.kind === 'planet');
  const onPlanet = world && planet ? Object.values(world.areas).filter((area) => trailOf(world, area.id).some((a) => a.id === planet.id)) : [];
  const sites = onPlanet.filter((area) => area.kind === 'settlement');
  const people = onPlanet.flatMap((area) => area.occupants.filter((o) => !o.statBlock && o.count === 1 && !isLocal(o)).map((o) => ({ ...o, where: area.name })));
  const enemies = Array.from(new Set(onPlanet.flatMap((area) => area.occupants.filter((o) => o.disposition === 'hostile').map((o) => o.name))));

  const handleSave = () => {
    if (!draft || !world || !start) return;

    const campaignData = {
      name: `${character.name}'s Campaign`,
      description: draft.quests[0]?.title ?? `Adventure on ${planet?.name ?? start.name}`,
      characterId: character.id,
      npcs: people.slice(0, 20).map((person) => ({
        id: person.id,
        name: person.name,
        species: person.species ?? "Unknown",
        role: person.role,
        description: `${person.role} at ${person.where}`,
      })),
      locations: sites.map((site) => ({
        id: site.id,
        name: site.name,
        type: site.type,
        description: site.description,
        coordinates: site.position,
      })),
      quests: draft.quests,
      setting: { era: eraById(world.era).name, backstory: eraById(world.era).summary, themes: [], tone: "Space Opera" },
      timeElapsed: { total: START_TIME, days: 0, hours: 8, minutes: 0 },
      startingLocation: start.name,
      currentLocation: world.startId,
      galaxyMap: world,
    };

    onSave(campaignData);
  };

  return (
    <div className="space-y-6">
      <TranslucentPane className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-yellow-400">Campaign Generator</h2>
          <button
            onClick={generateCampaign}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600"
          >
            {generating ? 'Generating...' : 'Generate Campaign'}
          </button>
        </div>

        <p className="text-gray-300 mb-6">
          Generate a galaxy to play in: places joined by paths, with people, enemies, ships and loot
          placed from the rules data, and quests that the world keeps score of. Generate again for a different one.
        </p>
        <label className="block text-sm text-gray-300 mb-4">
          Era
          <select data-testid="era" className="ml-2 rounded bg-gray-800 border border-gray-600 px-2 py-1 text-white" value={eraId} onChange={(e) => setEraId(e.target.value)}>
            {ERAS.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.span})</option>
            ))}
          </select>
          <span className="block text-xs text-gray-400 mt-1">{era.summary} Enemies: {era.antagonists.join(", ")}.</span>
        </label>
        {error && <p className="text-red-400 mb-4">{error}</p>}

        {draft && world && start && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">Primary Objective</h3>
              <TranslucentPane className="p-4">
                <p className="text-lg">{draft.quests[0]?.title ?? `Explore ${planet?.name ?? start.name}`}</p>
                {draft.quests[0] && (
                  <ul className="list-disc list-inside text-sm text-gray-300 mt-1">
                    {draft.quests[0].objectives.map((objective, index) => (
                      <li key={index}>{objective.description}</li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-gray-400 mt-2">Era: {eraById(world.era).name} · Enemy: {world.antagonist}</p>
              </TranslucentPane>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">Location</h3>
              <TranslucentPane className="p-4">
                <p className="text-lg mb-1">{trail.slice(2).map((area) => area.name).join(' › ')}</p>
                {planet && <p className="text-sm text-gray-400">{planet.name}: {planet.type}{planet.description ? `. ${planet.description}` : ''}</p>}
                <div className="mt-2">
                  <h4 className="font-medium mb-1">Places on {planet?.name}:</h4>
                  <ul className="list-disc list-inside">
                    {sites.map((site) => (
                      <li key={site.id} className="text-gray-300">{site.name} <span className="text-gray-400">({site.type})</span></li>
                    ))}
                  </ul>
                </div>
              </TranslucentPane>
            </div>

            {draft.quests.length > 1 && (
              <div>
                <h3 className="text-xl font-semibold text-yellow-400 mb-2">Secondary Objectives</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {draft.quests.slice(1).map((quest) => (
                    <TranslucentPane key={quest.id} className="p-4">
                      <p>{quest.title}</p>
                      <p className="text-sm text-gray-400">{quest.description}</p>
                    </TranslucentPane>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">NPCs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {people.slice(0, 9).map((person) => (
                  <TranslucentPane key={person.id} className="p-4">
                    <p className="font-medium">{person.name}</p>
                    <p className="text-sm text-gray-400">{[person.species, person.role].filter(Boolean).join(', ')}</p>
                    <p className="text-sm text-gray-400">Location: {person.where}</p>
                  </TranslucentPane>
                ))}
              </div>
              {enemies.length > 0 && <p className="text-sm text-gray-300 mt-2">Hostile on {planet?.name}: {enemies.join(', ')}</p>}
            </div>

            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">Rewards</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {draft.quests.map((quest) => (
                  <TranslucentPane key={quest.id} className="p-4">
                    <p className="font-medium">{quest.reward?.credits ?? 0} credits</p>
                    <p className="text-sm text-gray-400">{quest.title}</p>
                  </TranslucentPane>
                ))}
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Create Campaign
              </button>
            </div>
          </div>
        )}
      </TranslucentPane>
    </div>
  );
}
