
import React, { useState } from 'react';
import { processGameMasterResponse } from '@/lib/llm/reportHandler';
import { extractCoordinatesFromAsciiMap } from '../../../shared/coordinates';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useCampaign } from '@/lib/stores/useCampaign';
import { useMap } from '@/lib/stores/useMap';

interface LLMResponseParserProps {
  onProcessed?: (result: any) => void;
}

const LLMResponseParser: React.FC<LLMResponseParserProps> = ({ onProcessed }) => {
  const [response, setResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { updateLocation } = useMap();
  const { campaign } = useCampaign();

  const handleProcess = async () => {
    if (!response.trim()) {
      setError('Please paste an LLM response to process');
      return;
    }

    setIsProcessing(true);
    setError(null);
    
    try {
        // Process the GM response to update game state and map data
        await processGameMasterResponse(response);

        // Extract any ASCII map data for visualization
        const mapEntities = extractCoordinatesFromAsciiMap(response);

        // Process map visualization details for UI feedback
        let mapUpdateDetails = '';
        if (mapEntities.length > 0) {
          const entityTypes = new Map<string, number>();

          mapEntities.forEach(entity => {
            console.log(`Found entity: ${entity.type} at coordinates (${entity.coords.x}, ${entity.coords.y}, ${entity.coords.z})`);

            // Count entity types for summary
            const count = entityTypes.get(entity.type) || 0;
            entityTypes.set(entity.type, count + 1);
          });

          // Generate summary text for UI
          mapUpdateDetails = Array.from(entityTypes.entries())
            .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
            .join(', ');
        }

        // Set success result
        const processResult = {
          success: true,
          message: 'Response processed successfully',
          entitiesFound: mapEntities.length,
          mapUpdateDetails
        };

        setResult(processResult);

        if (onProcessed) {
          onProcessed(processResult);
        }

        // If this update includes map data, trigger a re-render of the map component
        if (mapEntities.length > 0 || response.includes('"locations":') || response.includes('"features":')) {
          // Force map update via store
          const currentLocationId = useMap.getState().currentLocation?.id;
          if (currentLocationId) {
            // Small trick to force React to re-render the map component
            setTimeout(() => {
              useMap.getState().setCurrentLocation(currentLocationId);
            }, 100);
          }
        }
      } catch (err) {
        console.error('Error processing LLM response:', err);
        setError('Failed to process the response. Please check the format and try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Process LLM Response</h2>
      
      <div className="space-y-2">
        <p className="text-sm text-gray-500">
          Paste the complete response from your external LLM below. 
          The system will process both narrative content and structured data.
        </p>
        
        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Paste LLM response here..."
          rows={10}
          className="font-mono text-sm w-full"
        />
      </div>
      
      <div className="flex justify-between items-center">
        <Button
          onClick={handleProcess}
          disabled={isProcessing || !response.trim()}
          className="w-full"
        >
          {isProcessing ? 'Processing...' : 'Process Response'}
        </Button>
      </div>
      
      {error && (
        <div className="text-red-500 text-sm p-2 bg-red-50 rounded">
          {error}
        </div>
      )}
      
      {result && (
        <div className="text-green-600 text-sm p-2 bg-green-50 rounded">
          <p>Successfully processed GM response!</p>
          {result.entitiesFound > 0 && (
            <p>{result.entitiesFound} map entities were found and processed.</p>
          )}
        </div>
      )}
      
      <div className="text-xs text-gray-400 mt-4">
        <p>Tip: Make sure the LLM response includes the "---SYSTEM_DATA_FOLLOWS---" marker followed by JSON data.</p>
        <p>For map entities, format should be: [TYPE:Name](x:0,y:0,z:0)</p>
      </div>
    </Card>
  );
};

export default LLMResponseParser;
