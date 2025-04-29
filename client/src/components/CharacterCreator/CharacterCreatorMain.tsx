
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacter } from '../../lib/stores/useCharacter';
import { CharacterCreationSteps } from './CharacterCreationSteps';
import { CharacterPreview } from './CharacterPreview';
import { CharacterSheet } from '../CharacterManagement/CharacterSheet';
import { StepNavigation } from './StepNavigation';
import { toast } from 'sonner';

export const CharacterCreatorMain: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { character, resetCharacter, calculateDerivedStats, validateCharacter } = useCharacter();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    resetCharacter();
  }, [resetCharacter]);

  useEffect(() => {
    calculateDerivedStats();
  }, [character, calculateDerivedStats]);

  const handleStepChange = (step: number) => {
    const validationErrors = validateCharacter(currentStep);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setCurrentStep(step);
  };

  const handleSubmit = async () => {
    let allErrors = {};
    for (let i = 0; i < 8; i++) {
      const stepErrors = validateCharacter(i);
      allErrors = { ...allErrors, ...stepErrors };
    }

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      toast.error('Please fix all errors before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(character),
      });

      if (!response.ok) throw new Error('Failed to save character');

      const savedCharacter = await response.json();
      queryClient.invalidateQueries(['characters']);
      toast.success('Character created successfully!');
      navigate(`/character/manage/${savedCharacter.id}`);
    } catch (error) {
      console.error('Error creating character:', error);
      toast.error('Failed to create character');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold text-yellow-400 mb-6">Star Wars Character Creator</h1>
        
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1">
            <CharacterCreationSteps 
              currentStep={currentStep} 
              errors={errors}
            />
            
            <StepNavigation
              currentStep={currentStep}
              onPrev={() => handleStepChange(currentStep - 1)}
              onNext={() => handleStepChange(currentStep + 1)}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              isFirstStep={currentStep === 0}
              isLastStep={currentStep === 7}
              togglePreview={() => setShowPreview(!showPreview)}
            />
          </div>
          
          <div className="w-full lg:w-1/3 sticky top-0">
            {showPreview ? (
              <CharacterSheet character={character} />
            ) : (
              <CharacterPreview character={character} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
