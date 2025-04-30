
import { FC, useState, useEffect } from 'react';
import { useCharacterStore } from '../../lib/stores/useCharacterStore';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { format } from 'date-fns';
import TranslucentPane from '../ui/TranslucentPane';
import { Clock, RotateCcw, Save } from 'lucide-react';

interface CharacterSnapshot {
  id: string;
  timestamp: string;
  description: string;
  characterData: any;
}

export const CharacterVersioning: FC = () => {
  const [snapshots, setSnapshots] = useState<CharacterSnapshot[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  
  const { character, setCharacter } = useCharacterStore();
  
  // Load snapshots from localStorage on component mount
  useEffect(() => {
    const savedSnapshots = localStorage.getItem(`character-snapshots-${character.id}`);
    if (savedSnapshots) {
      try {
        const parsedSnapshots = JSON.parse(savedSnapshots);
        setSnapshots(parsedSnapshots);
      } catch (e) {
        console.error('Failed to parse character snapshots', e);
      }
    }
  }, [character.id]);
  
  // Save current character state as a snapshot
  const createSnapshot = () => {
    const newSnapshot: CharacterSnapshot = {
      id: `snapshot-${Date.now()}`,
      timestamp: new Date().toISOString(),
      description: description || `Snapshot ${snapshots.length + 1}`,
      characterData: JSON.parse(JSON.stringify(character)) // Deep copy
    };
    
    const updatedSnapshots = [...snapshots, newSnapshot];
    setSnapshots(updatedSnapshots);
    localStorage.setItem(`character-snapshots-${character.id}`, JSON.stringify(updatedSnapshots));
    
    setDescription('');
  };
  
  // Restore character from a snapshot
  const restoreSnapshot = (snapshot: CharacterSnapshot) => {
    if (window.confirm('Are you sure you want to revert to this version? All current changes will be lost.')) {
      setCharacter(snapshot.characterData);
      setIsOpen(false);
    }
  };
  
  // Delete a snapshot
  const deleteSnapshot = (snapshotId: string) => {
    if (window.confirm('Are you sure you want to delete this snapshot?')) {
      const updatedSnapshots = snapshots.filter(s => s.id !== snapshotId);
      setSnapshots(updatedSnapshots);
      localStorage.setItem(`character-snapshots-${character.id}`, JSON.stringify(updatedSnapshots));
    }
  };
  
  // Helper to format date
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch (e) {
      return 'Invalid date';
    }
  };
  
  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <Clock size={16} />
            <span>Version History</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>Character Version History</DialogTitle>
          </DialogHeader>
          
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-400">
              {snapshots.length} {snapshots.length === 1 ? 'version' : 'versions'} saved
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Version description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="px-3 py-1 text-sm rounded border border-gray-600 bg-gray-800"
              />
              <Button size="sm" onClick={createSnapshot}>
                <Save size={14} className="mr-1" /> Save Current
              </Button>
            </div>
          </div>
          
          {snapshots.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No previous versions found</p>
              <p className="text-sm mt-2">Save a version to track changes over time</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {snapshots.slice().reverse().map((snapshot) => (
                  <TranslucentPane key={snapshot.id} className="p-3">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">{snapshot.description}</div>
                        <div className="text-sm text-gray-400 mt-1">
                          Saved on {formatDate(snapshot.timestamp)}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          {snapshot.characterData.level && `Level ${snapshot.characterData.level} `}
                          {snapshot.characterData.species && snapshot.characterData.species} 
                          {snapshot.characterData.class && ` ${snapshot.characterData.class}`}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex items-center gap-1"
                          onClick={() => restoreSnapshot(snapshot)}
                        >
                          <RotateCcw size={14} /> Restore
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => deleteSnapshot(snapshot.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </TranslucentPane>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CharacterVersioning;
