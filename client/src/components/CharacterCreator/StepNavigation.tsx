
import React, { FC, useState } from 'react';
import { Button } from '../ui/button';
import { CheckIcon, ArrowLeftIcon, ArrowRightIcon, EyeIcon, EyeOffIcon, SaveIcon } from 'lucide-react';
import { Tooltip } from '../ui/tooltip';

interface StepNavigationProps {
  currentStep: number;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  togglePreview: () => void;
  isStepValid: boolean;
  stepProgress?: number;
}

export const StepNavigation: FC<StepNavigationProps> = ({
  currentStep,
  onPrev,
  onNext,
  onSubmit,
  isSubmitting,
  isFirstStep,
  isLastStep,
  togglePreview,
  isStepValid,
  stepProgress = 100,
}) => {
  const [previewVisible, setPreviewVisible] = useState(false);

  const handleTogglePreview = () => {
    setPreviewVisible(!previewVisible);
    togglePreview();
  };

  return (
    <div className="flex flex-col space-y-4 mt-6 pt-6 border-t border-gray-700">
      {/* Step progress indicator */}
      <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden mb-2">
        <div 
          className="bg-yellow-500 h-full transition-all duration-300 ease-in-out"
          style={{ width: `${stepProgress}%` }}
        ></div>
      </div>

      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={onPrev}
          disabled={isFirstStep}
          className="w-24 flex items-center gap-1"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Previous
        </Button>

        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            onClick={handleTogglePreview} 
            className="gap-2"
            title={previewVisible ? "Hide character preview" : "Show character preview"}
          >
            {previewVisible ? (
              <>
                <EyeOffIcon className="h-4 w-4" />
                Hide Preview
              </>
            ) : (
              <>
                <EyeIcon className="h-4 w-4" />
                Preview
              </>
            )}
          </Button>
          
          <Button 
            variant="ghost"
            className="gap-2"
            onClick={() => {/* Save draft implementation */}}
          >
            <SaveIcon className="h-4 w-4" />
            Save Draft
          </Button>
        </div>

        {isLastStep ? (
          <Button
            onClick={onSubmit}
            disabled={isSubmitting || !isStepValid}
            className="w-24 bg-green-600 hover:bg-green-700 flex items-center gap-1"
          >
            {isSubmitting ? (
              "Creating..."
            ) : (
              <>
                Create
                <CheckIcon className="h-4 w-4" />
              </>
            )}
          </Button>
        ) : (
          <Tooltip content={!isStepValid ? "Complete this step to continue" : "Continue to next step"}>
            <Button 
              onClick={onNext} 
              disabled={!isStepValid}
              className="w-24 flex items-center gap-1"
            >
              Next
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>

      {!isStepValid && (
        <div className="text-amber-400 text-sm mt-2 flex items-center">
          <span className="mr-2">⚠️</span>
          Complete this step before continuing
        </div>
      )}
    </div>
  );
};

export default StepNavigation;
