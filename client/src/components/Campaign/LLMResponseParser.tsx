
import React, { useState, useEffect } from 'react';
import { SYSTEM_MARKER } from '@/lib/llm/reportHandler';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle, CheckCircle2, Copy, ClipboardCheck } from 'lucide-react';

interface LLMResponseParserProps {
  // A reply pasted elsewhere (the clipboard tools), to start with
  initialResponse?: string;
  // Applies the reply to the game and says what changed
  onProcess: (response: string) => Promise<{ applied: string[]; problem?: string }>;
  disabled?: boolean;
}

const LLMResponseParser: React.FC<LLMResponseParserProps> = ({ initialResponse = '', onProcess, disabled }) => {
  const [response, setResponse] = useState(initialResponse);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrativePreview, setNarrativePreview] = useState<string>('');
  const [systemPreview, setSystemPreview] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialResponse) setResponse(initialResponse);
  }, [initialResponse]);

  // Parse response when it changes to show preview
  useEffect(() => {
    if (!response.trim()) {
      setNarrativePreview('');
      setSystemPreview('');
      return;
    }

    try {
      // Split the response to show previews
      const parts = response.split(SYSTEM_MARKER);

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

    try {
      setResult(await onProcess(response));
      setResponse('');
    } catch (err) {
      console.error('Error processing LLM response:', err);
      setError(err instanceof Error && err.message ? err.message : 'Failed to process the response. Please check the format and try again.');
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
            disabled={isProcessing || disabled || !response.trim()}
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
          <div className="text-green-600 dark:text-green-400 text-sm p-3 bg-green-50 dark:bg-green-950 dark:bg-opacity-30 rounded" data-testid="gm-applied">
            <div className="flex items-start mb-2">
              <CheckCircle2 className="mr-2 h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>The story has been added.</span>
            </div>
            {result.problem && <p className="pl-7 text-yellow-600 dark:text-yellow-300">{result.problem}</p>}
            {result.applied.length > 0 ? (
              <ul className="list-disc pl-12 space-y-1">
                {result.applied.map((line: string) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="pl-7">Nothing in the game changed.</p>
            )}
          </div>
        )}

        <div className="text-xs text-gray-400 mt-4 p-3 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900">
          <p>The reply should end with a line reading <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">{SYSTEM_MARKER}</code> and the changes as JSON. A reply without it is kept as story only.</p>
        </div>
      </Card>
    );
  };

  export default LLMResponseParser;
