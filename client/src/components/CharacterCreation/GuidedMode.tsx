
import { FC, useState } from 'react';
import { useCharacterStore } from '../../lib/stores/useCharacterStore';
import { AlertCircle, Check, HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';

const GUIDED_TIPS = {
  basicInfo: [
    { 
      title: "Character Name", 
      content: "Choose a name that fits the Star Wars universe. Many alien species have naming conventions you might want to follow." 
    },
    { 
      title: "Character Level", 
      content: "New characters typically start at level 1, but your Game Master might start the campaign at a higher level." 
    },
    { 
      title: "Alignment", 
      content: "Your character's moral compass. In Star Wars, this often relates to your affinity with the Light or Dark side of the Force." 
    }
  ],
  species: [
    { 
      title: "Species Selection", 
      content: "Each species has unique traits and ability score modifiers. Choose one that complements your intended playstyle." 
    },
    { 
      title: "Size", 
      content: "Your character's size can affect various game mechanics like carrying capacity and certain combat maneuvers." 
    },
    { 
      title: "Speed", 
      content: "Base walking speed determines how far your character can move in combat each turn." 
    }
  ],
  class: [
    { 
      title: "Class Selection", 
      content: "Your class defines your character's primary abilities and role in the group. Consider what style of play you enjoy most." 
    },
    { 
      title: "Hit Dice", 
      content: "Each class has a hit die type that determines how many hit points you gain per level." 
    },
    { 
      title: "Primary Abilities", 
      content: "Most classes rely heavily on specific ability scores. Make sure to prioritize these when assigning your ability scores." 
    },
    { 
      title: "Force Powers", 
      content: "Some classes are Force users and can cast Force powers. Others are tech casters and use technology-based powers." 
    }
  ],
  abilities: [
    { 
      title: "Ability Scores", 
      content: "These six scores define your character's basic attributes. Higher scores mean better chances of success at related tasks." 
    },
    { 
      title: "Strength", 
      content: "Governs physical power, melee attacks, and carrying capacity." 
    },
    { 
      title: "Dexterity", 
      content: "Affects agility, reflexes, ranged attacks, and armor class." 
    },
    { 
      title: "Constitution", 
      content: "Determines health, endurance, and fortitude saves." 
    },
    { 
      title: "Intelligence", 
      content: "Represents knowledge, reasoning, and tech casting for some classes." 
    },
    { 
      title: "Wisdom", 
      content: "Covers perception, insight, and is important for Force users." 
    },
    { 
      title: "Charisma", 
      content: "Influences social interactions and is key for some Force powers." 
    }
  ]
};

export const GuidedMode: FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { currentStep } = useCharacterStore();
  
  // Determine which tips to show based on current step
  const getTipsForCurrentStep = () => {
    switch (currentStep) {
      case 0: return GUIDED_TIPS.basicInfo;
      case 1: return GUIDED_TIPS.species;
      case 2: return GUIDED_TIPS.class;
      case 3: return GUIDED_TIPS.abilities;
      default: return [];
    }
  };
  
  const currentTips = getTipsForCurrentStep();
  
  if (!isEnabled) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        className="flex items-center gap-2"
        onClick={() => setIsEnabled(true)}
      >
        <HelpCircle size={16} />
        Enable Guided Mode
      </Button>
    );
  }
  
  return (
    <div className="guided-mode">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Check size={16} className="text-green-500 mr-2" />
          <span className="text-sm font-medium">Guided Mode Active</span>
        </div>
        
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setIsEnabled(false)}
        >
          Turn Off
        </Button>
      </div>
      
      <div className="bg-blue-900/40 border border-blue-700/50 rounded-md p-4 mb-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-blue-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-300 mb-1">Guided Tips</h3>
            <ul className="space-y-2 mt-2">
              {currentTips.map((tip, index) => (
                <li key={index} className="text-sm flex items-start gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help flex items-center gap-1 text-white">
                          <span className="font-medium">{tip.title}</span>
                          <HelpCircle size={14} className="text-blue-400" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[250px] p-3">
                        <p>{tip.content}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            SW5E Rules Reference
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[600px] max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>SW5E Quick Reference</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <h3 className="text-lg font-bold mb-2">Ability Scores</h3>
              <p className="text-sm mb-2">Ability scores range from 3 to 18 for most characters, with 10-11 being the average for humanoids.</p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li><strong>Strength (STR):</strong> Physical power and melee attacks</li>
                <li><strong>Dexterity (DEX):</strong> Agility, reflexes, and ranged attacks</li>
                <li><strong>Constitution (CON):</strong> Endurance and hit points</li>
                <li><strong>Intelligence (INT):</strong> Knowledge, reasoning, and tech powers</li>
                <li><strong>Wisdom (WIS):</strong> Perception, insight, and force powers</li>
                <li><strong>Charisma (CHA):</strong> Force of personality and leadership</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-2">Character Advancement</h3>
              <p className="text-sm mb-2">Characters gain levels by earning experience points (XP).</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Level</th>
                    <th className="text-left py-1">XP Required</th>
                    <th className="text-left py-1">Prof. Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b"><td>1</td><td>0</td><td>+2</td></tr>
                  <tr className="border-b"><td>2</td><td>300</td><td>+2</td></tr>
                  <tr className="border-b"><td>3</td><td>900</td><td>+2</td></tr>
                  <tr className="border-b"><td>4</td><td>2,700</td><td>+2</td></tr>
                  <tr className="border-b"><td>5</td><td>6,500</td><td>+3</td></tr>
                  <tr><td>...</td><td>...</td><td>...</td></tr>
                </tbody>
              </table>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-2">Force & Tech Powers</h3>
              <p className="text-sm">Force and tech powers use power points. Your maximum power points equals your level + your casting ability modifier.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GuidedMode;
