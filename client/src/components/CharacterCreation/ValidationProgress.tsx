
import React from 'react';
import { Progress } from "../ui/progress";
import { Tooltip } from "../ui/tooltip";
import { TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { CheckCircle, XCircle } from "lucide-react";

interface ValidationItem {
  name: string;
  valid: boolean;
  required: boolean;
}

interface ValidationProgressProps {
  character: any;
}

export function ValidationProgress({ character }: ValidationProgressProps) {
  const validationItems: ValidationItem[] = [
    { name: "Character Name", valid: !!character.name, required: true },
    { name: "Species", valid: !!character.species, required: true },
    { name: "Class", valid: !!character.class, required: true },
    { name: "Ability Scores", valid: Object.values(character.abilityScores || {}).every(v => v >= 3), required: true },
    { name: "Background", valid: !!character.background, required: false },
    { name: "Equipment", valid: true, required: false }, // Equipment shouldn't block creation
    { name: "Feats", valid: true, required: false },     // Feats shouldn't block creation at level 1
    { name: "Powers", valid: true, required: false },    // Powers shouldn't block creation at level 1
  ];
  
  const requiredItems = validationItems.filter(item => item.required);
  const optionalItems = validationItems.filter(item => !item.required);
  
  const requiredCompletedCount = requiredItems.filter(item => item.valid).length;
  const optionalCompletedCount = optionalItems.filter(item => item.valid).length;
  
  const requiredProgress = requiredItems.length > 0 ? (requiredCompletedCount / requiredItems.length) * 100 : 100;
  const totalProgress = validationItems.length > 0 ? 
    ((requiredCompletedCount + optionalCompletedCount) / validationItems.length) * 100 : 0;
  
  const isCharacterReadyToSave = requiredItems.every(item => item.valid);
  
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Character Progress</h3>
      
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Required Fields</span>
          <span>{requiredCompletedCount}/{requiredItems.length}</span>
        </div>
        <Progress value={requiredProgress} className="h-2" />
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Overall Completion</span>
          <span>{requiredCompletedCount + optionalCompletedCount}/{validationItems.length}</span>
        </div>
        <Progress value={totalProgress} className="h-2" />
      </div>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-xs flex items-center mt-2">
              <span className="mr-2">Validation status:</span>
              {isCharacterReadyToSave ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 p-2">
              <p className="font-medium text-sm">Completion Status:</p>
              <ul className="text-xs space-y-1">
                {validationItems.map((item, index) => (
                  <li key={index} className="flex items-center">
                    {item.valid ? (
                      <CheckCircle className="h-3 w-3 text-green-500 mr-2" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 mr-2" />
                    )}
                    <span>{item.name}</span>
                    {item.required && <span className="text-red-400 ml-1">*</span>}
                  </li>
                ))}
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
