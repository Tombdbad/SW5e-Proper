import React from "react";
import { CheckCircle, Circle, AlertCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import TranslucentPane from "@/components/ui/TranslucentPane";

export interface ValidationStep {
  id: string;
  label: string;
  isRequired: boolean;
  isComplete: boolean;
  isError?: boolean;
  errorMessage?: string;
}

interface ValidationProgressProps {
  steps: ValidationStep[];
  currentTabIndex: number;
  onTabChange: (index: number) => void;
}

export default function ValidationProgress({
  steps,
  currentTabIndex,
  onTabChange,
}: ValidationProgressProps) {
  // Calculate overall progress
  const requiredSteps = steps.filter(step => step.isRequired);
  const completedRequiredSteps = requiredSteps.filter(step => step.isComplete);
  const progressPercentage = requiredSteps.length > 0 
    ? Math.round((completedRequiredSteps.length / requiredSteps.length) * 100) 
    : 100;

  const isComplete = requiredSteps.length === completedRequiredSteps.length;
  const hasErrors = steps.some(step => step.isError);

  return (
    <TranslucentPane className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-yellow-400">Character Creation Progress</h3>
        <Badge 
          variant={isComplete ? "default" : "outline"}
          className={
            isComplete 
              ? "bg-green-900/40 text-green-100" 
              : hasErrors 
                ? "bg-red-900/40 text-red-100" 
                : "bg-blue-900/40 text-blue-100"
          }
        >
          {isComplete 
            ? "Complete" 
            : hasErrors 
              ? "Has Issues" 
              : `${progressPercentage}% Complete`}
        </Badge>
      </div>

      <div className="w-full bg-gray-800 h-2 rounded-full mb-4 overflow-hidden">
        <div 
          className={`h-full rounded-full ${
            isComplete 
              ? "bg-green-500" 
              : hasErrors 
                ? "bg-yellow-500" 
                : "bg-blue-500"
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => (
          <div 
            key={step.id}
            className={`
              flex items-center p-2 rounded-md cursor-pointer transition-colors
              ${index === currentTabIndex ? "bg-gray-700/50" : "hover:bg-gray-800/50"}
            `}
            onClick={() => onTabChange(index)}
          >
            <div className="mr-3">
              {step.isComplete ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : step.isError ? (
                <AlertCircle className="h-5 w-5 text-red-500" />
              ) : (
                <Circle className="h-5 w-5 text-gray-500" />
              )}
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-center">
                <span className={step.isComplete ? "text-white" : "text-gray-400"}>
                  {step.label}
                </span>
                {step.isRequired && (
                  <Badge variant="outline" className="text-xs bg-gray-800/50">
                    Required
                  </Badge>
                )}
              </div>

              {step.isError && step.errorMessage && (
                <p className="text-xs text-red-400 mt-1">{step.errorMessage}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </TranslucentPane>
  );
}