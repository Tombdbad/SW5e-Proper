
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Download, Upload } from "lucide-react";

interface CharacterExportImportProps {
  character: any;
  onImport: (character: any) => void;
}

export function CharacterExportImport({ character, onImport }: CharacterExportImportProps) {
  const [exportedData, setExportedData] = useState("");
  const [importData, setImportData] = useState("");
  const [importError, setImportError] = useState("");
  
  const handleExport = () => {
    try {
      const exportData = JSON.stringify(character, null, 2);
      setExportedData(exportData);
    } catch (error) {
      console.error("Error exporting character:", error);
    }
  };
  
  const handleImport = () => {
    try {
      setImportError("");
      const parsedData = JSON.parse(importData);
      
      // Basic validation - you can add more checks here
      if (!parsedData.name || !parsedData.species || !parsedData.class) {
        setImportError("Invalid character data. Missing required fields.");
        return;
      }
      
      onImport(parsedData);
    } catch (error) {
      console.error("Error importing character:", error);
      setImportError("Invalid JSON format");
    }
  };
  
  const downloadCharacter = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(character, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${character.name || "character"}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Export/Import</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Export or Import Character</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="export" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
          
          <TabsContent value="export" className="space-y-4 pt-4">
            <p className="text-sm text-gray-400">
              Export your character as JSON to save or share with others.
            </p>
            
            <div className="flex justify-between">
              <Button onClick={handleExport} className="mr-2">
                Generate Export Data
              </Button>
              <Button onClick={downloadCharacter} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Download JSON
              </Button>
            </div>
            
            <Textarea 
              value={exportedData} 
              readOnly
              className="font-mono text-xs h-[200px]"
              placeholder="Click 'Generate Export Data' to view your character data"
            />
          </TabsContent>
          
          <TabsContent value="import" className="space-y-4 pt-4">
            <p className="text-sm text-gray-400">
              Paste character JSON data below to import.
            </p>
            
            {importError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
            
            <Textarea 
              value={importData} 
              onChange={(e) => setImportData(e.target.value)}
              className="font-mono text-xs h-[200px]"
              placeholder="Paste character JSON here"
            />
            
            <Button onClick={handleImport} className="w-full">
              <Upload className="mr-2 h-4 w-4" /> Import Character
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
