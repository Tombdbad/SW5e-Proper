
import { FC } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import TranslucentPane from '@/components/ui/TranslucentPane';

/**
 * CharacterCreatorMain serves as the entry point for character creation
 * It provides a choice between different creation flows:
 * 1. Form-based creation (CharacterCreation)
 * 2. Step-by-step guided creation (CharacterCreator)
 */
export const CharacterCreatorMain: FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <TranslucentPane className="max-w-xl p-8 space-y-6">
        <h1 className="text-2xl font-bold text-center text-yellow-400">SW5E Character Creator</h1>

        <p className="text-center">
          Choose your preferred character creation method:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => navigate('/character-creation')}
            className="h-24 flex flex-col"
          >
            <span className="text-lg">Form-Based</span>
            <span className="text-xs mt-1">Complete form sections in any order</span>
          </Button>

          <Button 
            variant="default" 
            size="lg"
            onClick={() => navigate('/character-creator')}
            className="h-24 flex flex-col"
          >
            <span className="text-lg">Step-by-Step</span>
            <span className="text-xs mt-1">Guided creation with validation</span>
          </Button>
        </div>

        <p className="text-sm text-center text-gray-400">
          Both methods create fully compatible character sheets.
        </p>
      </TranslucentPane>
    </div>
  );
};

export default CharacterCreatorMain;
