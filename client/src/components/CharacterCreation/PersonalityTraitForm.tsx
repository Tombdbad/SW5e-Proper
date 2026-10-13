
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Background } from '../../lib/sw5e/backgrounds';

const personalitySchema = z.object({
  traits: z.array(z.string()).optional(),
  ideals: z.array(z.string()).optional(),
  bonds: z.array(z.string()).optional(),
  flaws: z.array(z.string()).optional(),
  backstory: z.string().optional(),
});

export type PersonalityFormData = z.infer<typeof personalitySchema>;

interface PersonalityTraitFormProps {
  onClose: () => void;
  // Called with what was chosen; the opener keeps or saves it
  onSave: (data: PersonalityFormData) => void;
  initialData?: Partial<PersonalityFormData>;
  // The character's background: its tables are offered as suggestions
  background?: Background;
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
          placeholder="Or write your own"
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
        <p className="text-xs text-gray-500 mb-1">{examples.length ? 'Suggestions from your background (tap to add):' : 'Choose a background to see its suggestions.'}</p>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
          {examples.map((example, i) => (
            <button
              key={i}
              type="button"
              disabled={values.length >= max}
              onClick={() => useExample(example)}
              className={`text-xs text-left px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded ${
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
  onClose,
  onSave,
  initialData = {},
  background
}) => {

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<PersonalityFormData>({
    resolver: zodResolver(personalitySchema),
    defaultValues: {
      traits: initialData.traits || [],
      ideals: initialData.ideals || [],
      bonds: initialData.bonds || [],
      flaws: initialData.flaws || [],
      backstory: initialData.backstory || '',
    }
  });

  const traits = watch('traits') || [];
  const ideals = watch('ideals') || [];
  const bonds = watch('bonds') || [];
  const flaws = watch('flaws') || [];

  const onSubmit = (data: PersonalityFormData) => {
    onSave(data);
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

        {/* Not a form element: this opens inside the creation form, which must not be submitted from here */}
        <div className="p-4 space-y-6">
          {background && (
            <p className="text-sm text-gray-400">
              {background.name}: {background.suggestedCharacteristics[0] ?? ''}
            </p>
          )}
          {/* Personality Traits */}
          <TraitInputSection
            label="Personality Traits"
            name="traits"
            register={register}
            examples={background?.personalityTraits ?? []}
            setValue={setValue}
            values={traits}
          />

          {/* Ideals */}
          <TraitInputSection
            label="Ideals"
            name="ideals"
            register={register}
            examples={background?.ideals ?? []}
            setValue={setValue}
            values={ideals}
            max={2}
          />

          {/* Bonds */}
          <TraitInputSection
            label="Bonds"
            name="bonds"
            register={register}
            examples={background?.bonds ?? []}
            setValue={setValue}
            values={bonds}
            max={2}
          />

          {/* Flaws */}
          <TraitInputSection
            label="Flaws"
            name="flaws"
            register={register}
            examples={background?.flaws ?? []}
            setValue={setValue}
            values={flaws}
            max={2}
          />

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
              type="button"
              onClick={handleSubmit(onSubmit)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Save Personality
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalityTraitForm;
