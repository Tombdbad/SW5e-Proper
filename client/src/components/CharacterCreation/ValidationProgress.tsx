
import React, { useEffect, useState } from 'react';
import { Progress } from "../ui/progress";
import { Tooltip } from "../ui/tooltip";
import { TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { CheckCircle, XCircle, AlertCircle, InfoIcon } from "lucide-react";
import { CharacterAPI, ValidationResult } from "@/lib/api/character";

interface ValidationItem {
  name: string;
  valid: boolean;
  required: boolean;
  message?: string;
}

interface ValidationProgressProps {
  character: any;
}

export function ValidationProgress({ character }: ValidationProgressProps) {
  const [validationItems, setValidationItems] = useState<ValidationItem[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [fullValidationResult, setFullValidationResult] = useState<ValidationResult | null>(null);

  // Perform validation when character changes
  useEffect(() => {
    const validateCharacter = async () => {
      setIsValidating(true);
      try {
        // Basic validation checks - these are always done
        const basicItems: ValidationItem[] = [
          { name: "Character Name", valid: !!character.name, required: true },
          { name: "Species", valid: !!character.species, required: true },
          { name: "Class", valid: !!character.class, required: true },
          { name: "Ability Scores", valid: character.abilities ? Object.values(character.abilities).length > 0 : false, required: true },
          { name: "Background", valid: !!character.background, required: false },
          { name: "Equipment", valid: true, required: false },
          { name: "Feats", valid: true, required: false },
          { name: "Powers", valid: true, required: false },
          { name: "Skills", valid: character.skillProficiencies?.length > 0, required: true },
        ];
        
        setValidationItems(basicItems);
        
        // Only run full validation if we have the basic required fields
        if (character.name && character.species && character.class && character.abilities) {
          const validationResult = await CharacterAPI.validateCharacter(character);
          setFullValidationResult(validationResult);
          
          // If there are class-specific or build-specific validation issues,
          // add them to our validation items
          if (!validationResult.valid) {
            const additionalValidationItems = validationResult.errors.map(error => ({
              name: `${error.field.charAt(0).toUpperCase() + error.field.slice(1)}`,
              valid: false,
              required: true,
              message: error.message
            }));
            
            setValidationItems([...basicItems, ...additionalValidationItems]);
          }
        }
      } catch (error) {
        console.error("Validation error:", error);
      } finally {
        setIsValidating(false);
      }
    };
    
    validateCharacter();
  }, [character]);
  
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
      <h3 className="text-sm font-medium flex items-center justify-between">
        <span>Character Progress</span>
        {isValidating && <span className="text-xs text-muted-foreground">Validating...</span>}
      </h3>
      
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
          <TooltipContent className="w-80">
            <div className="space-y-1 p-2">
              <p className="font-medium text-sm">Completion Status:</p>
              <ul className="text-xs space-y-1">
                {validationItems.map((item, index) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-2 mt-0.5">
                      {item.valid ? (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      ) : (
                        item.message ? 
                        <AlertCircle className="h-3 w-3 text-amber-500" /> :
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                    </span>
                    <div>
                      <span>{item.name}</span>
                      {item.required && <span className="text-red-400 ml-1">*</span>}
                      {item.message && (
                        <div className="text-amber-500 mt-0.5">{item.message}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              
              {fullValidationResult && !fullValidationResult.valid && (
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="flex items-center text-amber-500">
                    <InfoIcon className="h-3 w-3 mr-1" />
                    <span className="text-xs font-medium">Build Recommendations:</span>
                  </div>
                  <ul className="text-xs mt-1 space-y-1">
                    {fullValidationResult.errors.map((error, index) => (
                      <li key={index} className="text-muted-foreground">
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
