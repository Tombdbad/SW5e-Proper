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
