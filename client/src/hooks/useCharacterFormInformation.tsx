import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCharacterStore } from "../lib/stores/useCharacterStore";

// Generic hook to integrate Zustand character store with react-hook-form
export function useCharacterFormIntegration<T extends z.ZodType<any, any>>(
  schema: T,
  defaultValues?: z.infer<T>,
) {
  const {
    character,
    updateCharacter,
    updateNestedCharacter,
    isDirty,
    isSaving,
    saveCharacter,
  } = useCharacterStore();

  // Set up form with validation
  const methods = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || (character as any),
  });

  // Update Zustand store when form fields change
  const onFieldChange = (path: string, value: any) => {
    if (path.includes(".")) {
      const pathArray = path.split(".");
      updateNestedCharacter(pathArray, value);
    } else {
      updateCharacter(path as any, value);
    }
  };

  // Submit handler
  const onSubmit = async (data: z.infer<T>) => {
    // Update the complete character in store
    useCharacterStore.getState().setCharacter(data as any);
    // Save to persistence
    return saveCharacter();
  };

  return {
    form: methods,
    onFieldChange,
    onSubmit,
    isDirty,
    isSaving,
  };
}
