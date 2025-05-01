import { useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";

interface ValidationProgressProps {
  // Support both direct character data and step-based validation
  character?: any;
  steps?: any[];
  currentStep?: number;
  completedSteps?: Record<number, boolean>;
}

export function ValidationProgress({ 
  character, 
  steps, 
  currentStep, 
  completedSteps 
}: ValidationProgressProps) {
  // Character-based validation logic
  const { completionPercentage, validationSteps } = useMemo(() => {
    // If using character-based validation
    if (character) {
      const steps = [
        {
          name: "Basic Info",
          isComplete: !!character.name,
          isRequired: true,
          message: character.name ? "Character has a name" : "Name is required"
        },
        {
          name: "Species",
          isComplete: !!character.species,
          isRequired: true,
          message: character.species ? "Species selected" : "Species selection required"
        },
        {
          name: "Class",
          isComplete: !!character.class,
          isRequired: true,
          message: character.class ? "Class selected" : "Class selection required"
        },
        {
          name: "Ability Scores",
          isComplete: character.abilityScores && 
            Object.values(character.abilityScores).every((score: any) => score > 0),
          isRequired: true,
          message: character.abilityScores && 
            Object.values(character.abilityScores).every((score: any) => score > 0) ? 
            "Ability scores assigned" : "Ability scores need to be assigned"
        },
        {
          name: "Background",
          isComplete: !!character.background,
          isRequired: false,
          message: character.background ? "Background selected" : "Background is optional but recommended"
        },
        {
          name: "Character Details",
          isComplete: !!(character.bonds || character.motivations),
          isRequired: false,
          message: character.bonds || character.motivations ? 
            "Character details provided" : "Adding personal details enhances your character"
        }
      ];

      // Calculate percentage based on required steps
      const requiredSteps = steps.filter(step => step.isRequired);
      const completedRequiredSteps = requiredSteps.filter(step => step.isComplete);
      const percentage = Math.round((completedRequiredSteps.length / requiredSteps.length) * 100);

      return {
        completionPercentage: percentage,
        validationSteps: steps
      };
    } 
    // If using step-based validation
    else if (steps && completedSteps) {
      const totalSteps = steps.length;
      const completedCount = Object.values(completedSteps).filter(Boolean).length;
      const percentage = totalSteps > 0 
        ? Math.round((completedCount / totalSteps) * 100) 
        : 0;

      const stepValidations = steps.map((step, index) => ({
        name: step.name,
        isComplete: !!completedSteps[index],
        isRequired: true,
        message: completedSteps[index] 
          ? `${step.name} is complete` 
          : `${step.name} needs to be completed`
      }));

      return {
        completionPercentage: percentage,
        validationSteps: stepValidations
      };
    }

    // Default empty state
    return {
      completionPercentage: 0,
      validationSteps: []
    };
  }, [character, steps, completedSteps]);

  // Display appropriate UI based on validation mode
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-yellow-400">Character Completion</h3>

      <div className="space-y-2">
        <Progress value={completionPercentage} className="h-2" />
        <p className="text-sm text-center">
          {completionPercentage}% Complete
          {completionPercentage === 100 && " - Ready to save!"}
        </p>
      </div>

      {/* Current step indicator for step-based validation */}
      {steps && currentStep !== undefined && (
        <div className="mt-2 text-sm text-gray-600">
          {completedSteps && completedSteps[currentStep] ? (
            <span className="text-green-600">✓ Current step is complete</span>
          ) : (
            <span>Complete current step to proceed</span>
          )}
        </div>
      )}

      {/* Detailed validation steps for character-based validation */}
      {validationSteps.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
          {validationSteps.map((step, index) => (
            <Alert key={index} variant={step.isComplete ? "default" : step.isRequired ? "destructive" : "warning"} 
                  className="py-2 text-sm">
              <div className="flex items-center">
                {step.isComplete ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : step.isRequired ? (
                  <AlertCircle className="h-4 w-4 mr-2" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-2" />
                )}
                <div>
                  <AlertTitle className="text-xs">{step.name}</AlertTitle>
                  <AlertDescription className="text-xs">{step.message}</AlertDescription>
                </div>
              </div>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}
