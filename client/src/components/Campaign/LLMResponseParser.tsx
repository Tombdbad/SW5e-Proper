
import React, { useState, useEffect } from 'react';
import { processGameMasterResponse } from '@/lib/llm/reportHandler';
import { extractCoordinatesFromAsciiMap } from '@/lib/coordinates';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useCampaign } from '@/lib/stores/useCampaign';
import { useMap } from '@/lib/stores/useMap';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle, CheckCircle2, Copy, ClipboardCheck } from 'lucide-react';

interface LLMResponseParserProps {
  onProcessed?: (result: any) => void;
}

interface UpdatedEntity {
  type: string;
  count: number;
  isNew: boolean;
}

const LLMResponseParser: React.FC<LLMResponseParserProps> = ({ onProcessed }) => {
  const [response, setResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrativePreview, setNarrativePreview] = useState<string>('');
  const [systemPreview, setSystemPreview] = useState<string>('');
  const [updatedEntities, setUpdatedEntities] = useState<UpdatedEntity[]>([]);
  const [copied, setCopied] = useState(false);
  const { campaign } = useCampaign();
  const { currentLocation } = useMap();

  // Parse response when it changes to show preview
  useEffect(() => {
    if (!response.trim()) {
      setNarrativePreview('');
      setSystemPreview('');
      return;
    }

    try {
      // Split the response to show previews
      const parts = response.split('---SYSTEM_DATA_FOLLOWS---');

      if (parts.length > 0) {
        // First part is narrative
        const narrative = parts[0].trim();
        setNarrativePreview(narrative.length > 300 ? 
          narrative.substring(0, 300) + '...' : 
          narrative);

        // Second part may contain JSON
        if (parts.length > 1) {
          const systemData = parts[1].trim();
          // Try to find and format JSON
          try {
            // Look for JSON-like structure
            const match = systemData.match(/(\{[\s\S]*\})/);
            if (match) {
              const jsonStr = match[0];
              // Format JSON for display
              const formattedJson = JSON.stringify(JSON.parse(jsonStr), null, 2);
              setSystemPreview(formattedJson.length > 300 ? 
                formattedJson.substring(0, 300) + '...' : 
                formattedJson);
            } else {
              setSystemPreview(systemData.length > 300 ? 
                systemData.substring(0, 300) + '...' : 
                systemData);
            }
          } catch (e) {
            setSystemPreview(systemData.length > 300 ? 
              systemData.substring(0, 300) + '...' : 
              systemData);
          }
        }
      }
    } catch (err) {
      console.error('Error parsing response preview:', err);
    }
  }, [response]);

  const handleProcess = async () => {
    if (!response.trim()) {
      setError('Please paste an LLM response to process');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setUpdatedEntities([]);

    try {
        // Record existing entities before update for comparison
        const existingFeatures = currentLocation?.mapData?.features || [];
        const existingEntities = currentLocation?.mapData?.entities || [];
        const existingEntityMap = new Map();

        [...existingFeatures, ...existingEntities].forEach(entity => {
          const type = entity.type;
          existingEntityMap.set(type, (existingEntityMap.get(type) || 0) + 1);
        });

        // Process the GM response to update game state and map data
        await processGameMasterResponse(response);

        // Extract any ASCII map data for visualization
        const mapEntities = extractCoordinatesFromAsciiMap(response);

        // Process map visualization details for UI feedback
        const entityTypes = new Map<string, {count: number, isNew: boolean}>();

        mapEntities.forEach(entity => {
          console.log(`Found entity: ${entity.type} at coordinates (${entity.coords.x}, ${entity.coords.y}, ${entity.coords.z})`);

          // Check if this entity type existed before
          const existingCount = existingEntityMap.get(entity.type) || 0;
          const isNew = existingCount === 0;

          // Count entity types for summary
          const current = entityTypes.get(entity.type) || {count: 0, isNew};
          entityTypes.set(entity.type, {
            count: current.count + 1,
            isNew: current.isNew || isNew
          });
        });

        // Check for JSON entities too
        if (response.includes('"locations":') || response.includes('"features":')) {
          // This will be shown in the summary too
          entityTypes.set('map_update', {count: 1, isNew: false});
        }

        // Generate updated entities array for display
        const updatedEntitiesArray = Array.from(entityTypes.entries())
          .map(([type, {count, isNew}]) => ({
            type,
            count, 
            isNew
          }));

        setUpdatedEntities(updatedEntitiesArray);

        // Set success result
        const processResult = {
          success: true,
          message: 'Response processed successfully',
          entitiesFound: mapEntities.length,
          updatedEntities: updatedEntitiesArray
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

    const handleCopyToClipboard = async () => {
      try {
        await navigator.clipboard.writeText(response);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    };

    return (
      <Card className="p-4 space-y-4">
        <h2 className="text-xl font-bold">Game Master Response</h2>

        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            Paste the complete response from your external LLM below. 
            The system will process both narrative content and structured data.
          </p>

          <div className="relative">
            <Textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Paste LLM response here..."
              rows={10}
              className="font-mono text-sm w-full pr-10"
            />
            <button 
              onClick={handleCopyToClipboard}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-md"
              aria-label="Copy to clipboard"
            >
              {copied ? <ClipboardCheck size={18} className="text-green-500" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        {(narrativePreview || systemPreview) && (
          <Tabs defaultValue="narrative" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="narrative">Narrative Preview</TabsTrigger>
              <TabsTrigger value="system">System Data Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="narrative" className="max-h-40 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm">
              {narrativePreview}
            </TabsContent>
            <TabsContent value="system" className="max-h-40 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm font-mono">
              {systemPreview}
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-between items-center">
          <Button
            onClick={handleProcess}
            disabled={isProcessing || !response.trim()}
            className="w-full"
            variant="default"
          >
            {isProcessing ? (
              <span className="flex items-center">
                <Spinner className="mr-2" /> Processing...
              </span>
            ) : 'Process Response'}
          </Button>
        </div>

        {error && (
          <div className="text-red-500 text-sm p-3 bg-red-50 dark:bg-red-950 dark:bg-opacity-30 rounded flex items-start">
            <AlertCircle className="mr-2 h-5 w-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="text-green-600 dark:text-green-400 text-sm p-3 bg-green-50 dark:bg-green-950 dark:bg-opacity-30 rounded">
            <div className="flex items-start mb-2">
              <CheckCircle2 className="mr-2 h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>Successfully processed GM response!</span>
            </div>

            {updatedEntities.length > 0 && (
              <div className="pl-7 space-y-1">
                <h4 className="font-semibold text-green-700 dark:text-green-300">Updates Applied:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {updatedEntities.map((entity, index) => (
                    <li key={index} className="flex items-center">
                      <span>{entity.count} {entity.type}{entity.count > 1 ? 's' : ''}</span>
                      {entity.isNew && (
                        <span className="ml-2 px-1 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">New</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-gray-400 mt-4 p-3 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900">
          <h4 className="font-semibold mb-1">Response Format Guidelines:</h4>
          <p className="mb-1">• Make sure the LLM response includes the <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">---SYSTEM_DATA_FOLLOWS---</code> marker followed by JSON data.</p>
          <p>• For map entities, format should be: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">[TYPE:Name](x:0,y:0,z:0)</code></p>
        </div>
      </Card>
    );
  };

  export default LLMResponseParser;
