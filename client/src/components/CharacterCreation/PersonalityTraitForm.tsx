
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import useCharacterStore from '../../lib/stores/useCharacterStore';

const personalitySchema = z.object({
  traits: z.array(z.string()).optional(),
  ideals: z.array(z.string()).optional(),
  bonds: z.array(z.string()).optional(),
  flaws: z.array(z.string()).optional(),
  appearance: z.string().optional(),
  backstory: z.string().optional(),
});

type PersonalityFormData = z.infer<typeof personalitySchema>;

// Example personality traits for guidance
const exampleTraits = [
  "I'm always optimistic, even in the face of overwhelming odds.",
  "I quote (or misquote) the tenets of the Jedi Code at every opportunity.",
  "I'm suspicious of strangers and expect the worst of them.",
  "I speak bluntly and without tact.",
  "I never back down from a challenge.",
  "I find it hard to trust anyone but myself."
];

const exampleIdeals = [
  "Peace. There is no emotion, there is peace. (Lawful)",
  "Justice. I will use my power to bring criminals to justice. (Lawful)",
  "Freedom. Everyone should be free to pursue their own livelihood. (Chaotic)",
  "Balance. The Force must remain in balance. (Neutral)",
  "Power. Knowledge and power are the path to greatness. (Dark Side)",
  "Honor. If I dishonor myself, I dishonor my entire clan. (Any)"
];

const exampleBonds = [
  "I have an ancient text that holds terrible secrets that must not fall into the wrong hands.",
  "My ship is my home, and the crew are my family.",
  "I owe a life debt to the one who saved me from certain death.",
  "I seek to avenge the destruction of my homeworld.",
  "I will someday get revenge on the corrupt organization that ruined my reputation.",
  "I fight for those who cannot fight for themselves."
];

const exampleFlaws = [
  "I have a weakness for the vices of the city, especially gambling.",
  "I'm confident in my abilities to the point of rashness.",
  "I secretly believe that everyone is beneath me.",
  "I have little respect for anyone who isn't a proven warrior.",
  "Once I pick a goal, I become obsessed with it to the detriment of everything else in my life.",
  "The Sith/Empire/criminals who murdered my family still hunt me, and I still run from them."
];

interface PersonalityTraitFormProps {
  characterId: string;
  onClose: () => void;
  initialData?: Partial<PersonalityFormData>;
}

// Helper component for trait inputs with examples
const TraitInputSection: FC<{
  label: string;
  name: keyof PersonalityFormData;
  register: any;
  examples: string[];
  setValue: any;
  values: string[] | undefined;
  max?: number;
}> = ({ label, name, register, examples, setValue, values = [], max = 3 }) => {
  const [inputValue, setInputValue] = React.useState('');

  const addTrait = () => {
    if (inputValue.trim() && values.length < max) {
      setValue(name, [...values, inputValue.trim()]);
      setInputValue('');
    }
  };

  const removeTrait = (index: number) => {
    setValue(name, values.filter((_, i) => i !== index));
  };

  const useExample = (example: string) => {
    if (values.length < max) {
      setValue(name, [...values, example]);
    }
  };

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-300 mb-1">
        {label} <span className="text-gray-500 text-xs">({values.length}/{max})</span>
      </label>

      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
          placeholder={`Add a ${name}`}
          disabled={values.length >= max}
        />
        <button
          type="button"
          onClick={addTrait}
          disabled={!inputValue.trim() || values.length >= max}
          className={`px-3 py-1 bg-blue-600 text-white rounded ${
            !inputValue.trim() || values.length >= max ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
          }`}
        >
          Add
        </button>
      </div>

      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((trait, index) => (
            <div key={index} className="bg-gray-800 px-3 py-1 rounded-full flex items-center text-sm">
              <span className="mr-2">{trait}</span>
              <button
                type="button"
                onClick={() => removeTrait(index)}
                className="text-gray-400 hover:text-red-400"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2">
        <p className="text-xs text-gray-500 mb-1">Examples (click to add):</p>
        <div className="flex flex-wrap gap-1">
          {examples.map((example, i) => (
            <button
              key={i}
              type="button"
              disabled={values.length >= max}
              onClick={() => useExample(example)}
              className={`text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded ${
                values.length >= max ? 'opacity-50 cursor-not-allowed' : 'hover:text-white'
              }`}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const PersonalityTraitForm: FC<PersonalityTraitFormProps> = ({
  characterId,
  onClose,
  initialData = {}
}) => {
  const updatePersonality = useCharacterStore(state => state.actions.updatePersonality);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<PersonalityFormData>({
    resolver: zodResolver(personalitySchema),
    defaultValues: {
      traits: initialData.traits || [],
      ideals: initialData.ideals || [],
      bonds: initialData.bonds || [],
      flaws: initialData.flaws || [],
      appearance: initialData.appearance || '',
      backstory: initialData.backstory || '',
    }
  });

  const traits = watch('traits') || [];
  const ideals = watch('ideals') || [];
  const bonds = watch('bonds') || [];
  const flaws = watch('flaws') || [];

  const onSubmit = (data: PersonalityFormData) => {
    updatePersonality(characterId, data);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-yellow-400">Character Personality</h2>
          <button 
            className="text-gray-400 hover:text-white"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-6">
          {/* Personality Traits */}
          <TraitInputSection
            label="Personality Traits"
            name="traits"
            register={register}
            examples={exampleTraits}
            setValue={setValue}
            values={traits}
          />

          {/* Ideals */}
          <TraitInputSection
            label="Ideals"
            name="ideals"
            register={register}
            examples={exampleIdeals}
            setValue={setValue}
            values={ideals}
            max={2}
          />

          {/* Bonds */}
          <TraitInputSection
            label="Bonds"
            name="bonds"
            register={register}
            examples={exampleBonds}
            setValue={setValue}
            values={bonds}
            max={2}
          />

          {/* Flaws */}
          <TraitInputSection
            label="Flaws"
            name="flaws"
            register={register}
            examples={exampleFlaws}
            setValue={setValue}
            values={flaws}
            max={2}
          />

          {/* Appearance */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Character Appearance
            </label>
            <textarea
              {...register('appearance')}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              placeholder="Describe what your character looks like..."
            />
          </div>

          {/* Backstory */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Character Backstory
            </label>
            <textarea
              {...register('backstory')}
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              placeholder="Tell your character's story..."
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-2 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              disabled={false} // Add loading state if needed
            >
              Save Character
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PersonalityTraitForm;
