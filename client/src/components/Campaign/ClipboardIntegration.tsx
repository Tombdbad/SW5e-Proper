
import React, { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clipboard, ClipboardCheck, ArrowUp, ArrowDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ClipboardIntegrationProps {
  outboundData: string;
  onInboundData: (data: string) => void;
  title?: string;
}

const ClipboardIntegration: React.FC<ClipboardIntegrationProps> = ({
  outboundData,
  onInboundData,
  title = "LLM Data Transfer"
}) => {
  const [copiedOutbound, setCopiedOutbound] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(outboundData);
      setCopiedOutbound(true);
      setTimeout(() => setCopiedOutbound(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handlePaste = async () => {
    try {
      // Request clipboard permission and get text
      const text = await navigator.clipboard.readText();

      if (text && text.trim()) {
        onInboundData(text);
        setPasteSuccess(true);
        setTimeout(() => setPasteSuccess(false), 2000);
      }
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
    }
  };

  const handleManualPaste = () => {
    if (textAreaRef.current && textAreaRef.current.value.trim()) {
      onInboundData(textAreaRef.current.value);
      textAreaRef.current.value = '';
      setPasteSuccess(true);
      setTimeout(() => setPasteSuccess(false), 2000);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <h3 className="text-lg font-semibold text-center">{title}</h3>

      <Tabs defaultValue="outbound" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="outbound" className="flex items-center justify-center">
            <ArrowUp className="mr-2 h-4 w-4" /> 
            <span>Send to LLM</span>
          </TabsTrigger>
          <TabsTrigger value="inbound" className="flex items-center justify-center">
            <ArrowDown className="mr-2 h-4 w-4" /> 
            <span>Receive from LLM</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outbound" className="space-y-3 pt-2">
          <p className="text-sm text-gray-500">
            Copy this game data to paste into your external LLM:
          </p>

          <div className="relative">
            <textarea
              readOnly
              value={outboundData}
              className="w-full h-32 p-3 border rounded font-mono text-sm bg-gray-50 dark:bg-gray-900"
            />

            <Button 
              size="sm"
              variant="outline"
              onClick={copyToClipboard}
              className="absolute top-2 right-2 bg-white dark:bg-gray-800"
            >
              {copiedOutbound ? (
                <ClipboardCheck className="h-4 w-4 text-green-600" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
            </Button>
          </div>

          <Button 
            onClick={copyToClipboard} 
            className="w-full" 
            variant="default"
          >
            {copiedOutbound ? 'Copied!' : 'Copy to Clipboard'}
          </Button>

          <p className="text-xs text-gray-400">
            After copying, paste this into your external LLM and ask it to respond with the next game update.
          </p>
        </TabsContent>

        <TabsContent value="inbound" className="space-y-3 pt-2">
          <p className="text-sm text-gray-500">
            Paste the LLM's response below:
          </p>

          <textarea
            ref={textAreaRef}
            placeholder="Paste the LLM's response here..."
            className="w-full h-32 p-3 border rounded font-mono text-sm"
          />

          <div className="flex space-x-2">
            <Button 
              onClick={handlePaste} 
              className="flex-1" 
              variant="outline"
            >
              Auto-Paste from Clipboard
            </Button>

            <Button 
              onClick={handleManualPaste} 
              className="flex-1" 
              variant="default"
            >
              {pasteSuccess ? 'Received!' : 'Process Pasted Response'}
            </Button>
          </div>

          <p className="text-xs text-gray-400">
            Make sure the response contains the expected format with system data.
          </p>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default ClipboardIntegration;
