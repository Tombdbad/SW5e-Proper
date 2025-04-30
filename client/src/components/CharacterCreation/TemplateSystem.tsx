
import { FC, useState, useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useCharacterStore } from '../../lib/stores/useCharacterStore';
import TranslucentPane from '../ui/TranslucentPane';
import { ScrollArea } from '../ui/scroll-area';

interface Template {
  id: string;
  name: string;
  description: string;
  characterData: any;
  createdAt: string;
}

const BUILT_IN_TEMPLATES = [
  {
    id: 'template-jedi-knight',
    name: 'Jedi Knight',
    description: 'A Light Side Guardian focused on lightsaber combat and Force powers.',
    characterData: {
      class: 'guardian',
      species: 'human',
      alignment: 'Light Side',
      abilityScores: {
        strength: 14,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 16,
        charisma: 10
      },
      // Add more pre-filled data as needed
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'template-smuggler',
    name: 'Smuggler',
    description: 'A quick-thinking Scoundrel with a knack for getting out of trouble.',
    characterData: {
      class: 'scoundrel',
      species: 'twi\'lek',
      alignment: 'Balanced',
      abilityScores: {
        strength: 10,
        dexterity: 16,
        constitution: 12,
        intelligence: 14,
        wisdom: 10,
        charisma: 14
      }
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'template-bounty-hunter',
    name: 'Bounty Hunter',
    description: 'A deadly Fighter specialized in hunting down targets.',
    characterData: {
      class: 'fighter',
      species: 'mandalorian',
      alignment: 'Neutral',
      abilityScores: {
        strength: 14,
        dexterity: 16,
        constitution: 14,
        intelligence: 12,
        wisdom: 10,
        charisma: 8
      }
    },
    createdAt: new Date().toISOString(),
  }
];

export const TemplateSystem: FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  
  const { character, setCharacter } = useCharacterStore();
  
  // Load templates from localStorage on component mount
  useEffect(() => {
    const savedTemplates = localStorage.getItem('character-templates');
    if (savedTemplates) {
      try {
        const parsedTemplates = JSON.parse(savedTemplates);
        setTemplates(parsedTemplates);
      } catch (e) {
        console.error('Failed to parse saved templates', e);
      }
    }
    
    // Add built-in templates if none exist
    if (!savedTemplates || JSON.parse(savedTemplates).length === 0) {
      setTemplates(BUILT_IN_TEMPLATES);
      localStorage.setItem('character-templates', JSON.stringify(BUILT_IN_TEMPLATES));
    }
  }, []);
  
  const saveTemplate = () => {
    if (!templateName.trim()) return;
    
    const newTemplate: Template = {
      id: `template-${Date.now()}`,
      name: templateName,
      description: templateDescription,
      characterData: character,
      createdAt: new Date().toISOString()
    };
    
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    localStorage.setItem('character-templates', JSON.stringify(updatedTemplates));
    
    setTemplateName('');
    setTemplateDescription('');
    setSaveDialogOpen(false);
  };
  
  const loadTemplate = (template: Template) => {
    if (window.confirm(`Load the "${template.name}" template? This will replace your current character.`)) {
      setCharacter(template.characterData);
      setIsOpen(false);
    }
  };
  
  const deleteTemplate = (templateId: string) => {
    if (window.confirm('Are you sure you want to delete this template?')) {
      const updatedTemplates = templates.filter(t => t.id !== templateId);
      setTemplates(updatedTemplates);
      localStorage.setItem('character-templates', JSON.stringify(updatedTemplates));
    }
  };
  
  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            Templates
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Character Templates</DialogTitle>
          </DialogHeader>
          
          <div className="flex justify-end mb-4">
            <Button variant="outline" onClick={() => {
              setIsOpen(false);
              setSaveDialogOpen(true);
            }}>
              Save Current as Template
            </Button>
          </div>
          
          <ScrollArea className="h-[400px] pr-4">
            <div className="grid grid-cols-1 gap-4">
              {templates.map(template => (
                <TranslucentPane key={template.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg text-yellow-400">{template.name}</h3>
                      <p className="text-sm text-gray-300 mb-2">{template.description}</p>
                      
                      <div className="text-xs text-gray-400 mt-2">
                        {template.characterData.species && (
                          <span className="mr-2">Species: {template.characterData.species}</span>
                        )}
                        {template.characterData.class && (
                          <span className="mr-2">Class: {template.characterData.class}</span>
                        )}
                        {template.characterData.alignment && (
                          <span>Alignment: {template.characterData.alignment}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => loadTemplate(template)}>
                        Load
                      </Button>
                      
                      {!BUILT_IN_TEMPLATES.some(t => t.id === template.id) && (
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => deleteTemplate(template.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </TranslucentPane>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name</Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="My Character Template"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="templateDescription">Description</Label>
              <Input
                id="templateDescription"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Describe your character template..."
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTemplate}>
              Save Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TemplateSystem;
