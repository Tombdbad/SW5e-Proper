
import { FC } from 'react';

interface Step {
  id: number;
  name: string;
  component: FC;
}

interface ValidationProgressProps {
  steps: Step[];
  currentStep: number;
  completedSteps: Record<number, boolean>;
}

const ValidationProgress: FC<ValidationProgressProps> = ({ 
  steps, 
  currentStep, 
  completedSteps 
}) => {
  // Calculate overall progress percentage
  const totalSteps = steps.length;
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const progressPercentage = totalSteps > 0 
    ? Math.round((completedCount / totalSteps) * 100) 
    : 0;

  return (
    <div className="validation-progress">
      <div className="flex justify-between items-center mb-1">
        <div className="text-sm font-medium">Character Creation Progress</div>
        <div className="text-sm text-gray-500">{progressPercentage}% Complete</div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className="bg-blue-600 h-2.5 rounded-full" 
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>

      {currentStep < totalSteps && (
        <div className="mt-2 text-sm text-gray-600">
          {completedSteps[currentStep] ? (
            <span className="text-green-600">✓ Current step is complete</span>
          ) : (
            <span>Complete current step to proceed</span>
          )}
        </div>
      )}
    </div>
  );
};

export default ValidationProgress;
