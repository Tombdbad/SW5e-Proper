import React from "react";
import { Button } from "../ui/button";
import { Eye, EyeOff } from "lucide-react";

interface StepNavigationProps {
  currentStep: number;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  togglePreview: () => void;
}

export const StepNavigation: React.FC<StepNavigationProps> = ({
  currentStep,
  onPrev,
  onNext,
  onSubmit,
  isSubmitting,
  isFirstStep,
  isLastStep,
  togglePreview,
}) => {
  return (
    <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-700">
      <Button
        variant="outline"
        onClick={onPrev}
        disabled={isFirstStep}
        className="w-24"
      >
        Previous
      </Button>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={togglePreview} className="gap-2">
          <Eye className="h-4 w-4" />
          Toggle Preview
        </Button>
      </div>

      {isLastStep ? (
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="w-24 bg-green-600 hover:bg-green-700"
        >
          {isSubmitting ? "Creating..." : "Create"}
        </Button>
      ) : (
        <Button onClick={onNext} className="w-24">
          Next
        </Button>
      )}
    </div>
  );
};
import { FC } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface Step {
  id: number;
  name: string;
  component: FC;
}

interface StepNavigationProps {
  steps: Step[];
  currentStep: number;
  completedSteps: Record<number, boolean>;
  onStepChange: (step: number) => void;
}

const StepNavigation: FC<StepNavigationProps> = ({ 
  steps, 
  currentStep, 
  completedSteps, 
  onStepChange 
}) => {
  return (
    <nav className="step-navigation">
      <ul className="space-y-1">
        {steps.map((step) => {
          const isComplete = completedSteps[step.id] === true;
          const isActive = currentStep === step.id;

          return (
            <li key={step.id}>
              <button
                className={`w-full flex items-center px-3 py-2 text-left rounded-md transition-colors
                  ${isActive 
                    ? 'bg-blue-100 text-blue-700' 
                    : isComplete 
                      ? 'text-green-700 hover:bg-gray-100' 
                      : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => onStepChange(step.id)}
              >
                <span className="mr-2 flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  {isComplete ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : (
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs
                      ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                      {step.id + 1}
                    </span>
                  )}
                </span>
                <span className="flex-grow">{step.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default StepNavigation;

