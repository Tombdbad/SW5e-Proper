
import React from 'react';
import { Button } from '@/components/ui/button';
import { ViewMode, useGame } from '@/lib/stores/useGame';

const viewModes: { id: ViewMode; label: string }[] = [
  { id: 'galaxy', label: 'Galaxy View' },
  { id: 'system', label: 'System View' },
  { id: 'planet', label: 'Planet View' },
  { id: 'local', label: 'Local View' }
];

export default function MapNavigation() {
  const { viewMode, setViewMode } = useGame();

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 p-2 rounded-lg backdrop-blur-sm">
      <div className="flex gap-2">
        {viewModes.map(mode => (
          <Button
            key={mode.id}
            variant={viewMode === mode.id ? "default" : "secondary"}
            onClick={() => setViewMode(mode.id)}
            className="min-w-[100px]"
          >
            {mode.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
