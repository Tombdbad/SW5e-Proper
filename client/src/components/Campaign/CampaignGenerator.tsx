
import React, { useState } from 'react';
import { CampaignElementGenerator, CampaignData } from '../../lib/sw5e/campaignGenerator';
import { CharacterProfile } from '../../lib/sw5e/characterProfileParser';
import TranslucentPane from '../ui/TranslucentPane';
import { Character } from '../../shared/schema';

interface CampaignGeneratorProps {
  character: Character;
  onSave: (campaignData: any) => void;
}

export default function CampaignGenerator({ character, onSave }: CampaignGeneratorProps) {
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [generating, setGenerating] = useState(false);
  
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
  
  const generateCampaign = () => {
    setGenerating(true);
    
    // Convert character data to the format expected by the generator
    const profile = convertCharacterToProfile(character);
    
    // Use setTimeout to avoid blocking the UI
    setTimeout(() => {
      try {
        const generator = new CampaignElementGenerator();
        const newCampaign = generator.generateFullCampaign(profile);
        setCampaign(newCampaign);
      } catch (error) {
        console.error("Error generating campaign:", error);
      } finally {
        setGenerating(false);
      }
    }, 100);
  };
  
  const handleSave = () => {
    if (!campaign) return;
    
    // Convert to format expected by API
    const campaignData = {
      name: `${character.name}'s Campaign`,
      description: campaign.primaryObjective.title,
      characterId: character.id,
      setting: {
        era: "Galactic Civil War",
        backstory: `Adventure in ${campaign.location.name}`,
        themes: [campaign.primaryObjective.combatStyle, campaign.primaryObjective.forceAlignment],
        tone: campaign.primaryObjective.combatStyle === "aggressive" ? "Gritty" : "Space Opera"
      },
      npcs: campaign.npcs.map((npc, index) => ({
        id: `npc-${index}`,
        name: `${npc.type} ${index + 1}`,
        species: "Unknown",
        role: npc.type,
        description: `A ${npc.type} affiliated with ${npc.faction}`,
      })),
      locations: [
        {
          id: "location-main",
          name: campaign.location.name,
          type: campaign.location.environment,
          description: `A ${campaign.location.environment} with ${campaign.location.securityLevel} security`,
          coordinates: { x: 0, y: 0, z: 0 }
        },
        ...campaign.location.pointsOfInterest.map((poi, index) => ({
          id: `location-${index}`,
          name: poi,
          type: "Point of Interest",
          description: `A notable location within ${campaign.location.name}`,
          coordinates: { x: index * 10, y: 0, z: 0 }
        }))
      ],
      quests: [
        {
          id: "quest-main",
          title: campaign.primaryObjective.title,
          description: `Main objective: ${campaign.primaryObjective.title}`,
          status: "active",
          objectives: [
            { description: campaign.primaryObjective.title, completed: false }
          ],
          reward: {
            credits: 1000,
            items: campaign.items.map(item => item.name),
            experience: 100 * character.level
          }
        },
        ...campaign.secondaryObjectives.map((objective, index) => ({
          id: `quest-${index}`,
          title: objective.title,
          description: objective.title,
          status: "inactive",
          objectives: [
            { description: objective.title, completed: false }
          ],
          reward: {
            credits: 500,
            items: [],
            experience: 50 * character.level
          }
        }))
      ],
      startingLocation: campaign.location.name,
      currentLocation: campaign.location.name
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
          Generate a personalized campaign based on your character's traits, abilities, and background.
          The campaign will include objectives, locations, NPCs, and rewards tailored to your character.
        </p>
        
        {campaign && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">Primary Objective</h3>
              <TranslucentPane className="p-4">
                <p className="text-lg">{campaign.primaryObjective.title}</p>
              </TranslucentPane>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">Location</h3>
              <TranslucentPane className="p-4">
                <p className="text-lg mb-1">{campaign.location.name}</p>
                <p className="text-sm text-gray-400">Security Level: {campaign.location.securityLevel}</p>
                <div className="mt-2">
                  <h4 className="font-medium mb-1">Points of Interest:</h4>
                  <ul className="list-disc list-inside">
                    {campaign.location.pointsOfInterest.map((poi, index) => (
                      <li key={index} className="text-gray-300">{poi}</li>
                    ))}
                  </ul>
                </div>
              </TranslucentPane>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">Secondary Objectives</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaign.secondaryObjectives.map((objective, index) => (
                  <TranslucentPane key={index} className="p-4">
                    <p>{objective.title}</p>
                  </TranslucentPane>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">NPCs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaign.npcs.map((npc, index) => (
                  <TranslucentPane key={index} className="p-4">
                    <p className="font-medium">{npc.type}</p>
                    <p className="text-sm text-gray-400">Faction: {npc.faction}</p>
                    <p className="text-sm text-gray-400">Location: {npc.location}</p>
                  </TranslucentPane>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">Rewards</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaign.items.map((item, index) => (
                  <TranslucentPane key={index} className="p-4">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-400">Rarity: {item.rarity}</p>
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
