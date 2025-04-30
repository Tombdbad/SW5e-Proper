import { QueryClient } from "@tanstack/react-query";
import { Character } from "./sw5eApi";

/**
 * Utilities for optimistic updates in React Query
 * These functions help improve user experience by updating the UI before server response
 */

/**
 * Optimistically update a character
 */
export const optimisticUpdateCharacter = (
  queryClient: QueryClient,
  characterId: string,
  updatedFields: Partial<Character>,
) => {
  // Get the current query key for this character
  const queryKey = ["character", characterId];

  // Get the current character data from cache
  const currentCharacter = queryClient.getQueryData<Character>(queryKey);

  if (!currentCharacter) {
    return; // Cannot perform optimistic update without current data
  }

  // Create the optimistically updated character
  const optimisticCharacter: Character = {
    ...currentCharacter,
    ...updatedFields,
    // Always update the updatedAt timestamp
    updatedAt: new Date().toISOString(),
  };

  // Return the context needed for rollback
  return {
    previousCharacter: currentCharacter,
    queryKey,

    // Update the cache immediately
    updateCache: () => {
      queryClient.setQueryData<Character>(queryKey, optimisticCharacter);
    },

    // Rollback function in case of error
    rollback: () => {
      queryClient.setQueryData<Character>(queryKey, currentCharacter);
    },
  };
};

/**
 * Optimistically add a new character
 */
export const optimisticAddCharacter = (
  queryClient: QueryClient,
  newCharacter: Omit<Character, "id" | "createdAt" | "updatedAt">,
) => {
  // Get the current query key for all characters
  const charactersQueryKey = ["characters"];

  // Get current characters list from cache
  const currentCharacters =
    queryClient.getQueryData<Character[]>(charactersQueryKey) || [];

  // Create a temporary ID for optimistic update
  const tempId = `temp-${Date.now()}`;

  // Create optimistic character
  const optimisticCharacter: Character = {
    ...newCharacter,
    id: tempId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Return the context needed for updates
  return {
    tempId,
    optimisticCharacter,
    currentCharacters,

    // Update the cache immediately
    updateCache: () => {
      // Add to characters list
      queryClient.setQueryData<Character[]>(charactersQueryKey, [
        ...currentCharacters,
        optimisticCharacter,
      ]);
    },

    // Rollback function in case of error
    rollback: () => {
      queryClient.setQueryData<Character[]>(
        charactersQueryKey,
        currentCharacters,
      );
    },

    // Update with real data after successful creation
    updateWithRealData: (createdCharacter: Character) => {
      // Update characters list with real data
      queryClient.setQueryData<Character[]>(
        charactersQueryKey,
        currentCharacters.concat(createdCharacter),
      );

      // Set the individual character data
      queryClient.setQueryData(
        ["character", createdCharacter.id],
        createdCharacter,
      );
    },
  };
};

/**
 * Optimistically delete a character
 */
export const optimisticDeleteCharacter = (
  queryClient: QueryClient,
  characterId: string,
) => {
  // Get the query keys
  const characterQueryKey = ["character", characterId];
  const charactersQueryKey = ["characters"];

  // Get current data from cache
  const currentCharacter =
    queryClient.getQueryData<Character>(characterQueryKey);
  const currentCharacters =
    queryClient.getQueryData<Character[]>(charactersQueryKey) || [];

  // Return context for updates
  return {
    currentCharacter,
    currentCharacters,

    // Update the cache immediately
    updateCache: () => {
      // Remove from characters list
      queryClient.setQueryData<Character[]>(
        charactersQueryKey,
        currentCharacters.filter((char) => char.id !== characterId),
      );

      // Remove individual character data
      queryClient.removeQueries(characterQueryKey);
    },

    // Rollback function in case of error
    rollback: () => {
      // Restore character to list
      if (currentCharacter) {
        queryClient.setQueryData<Character[]>(charactersQueryKey, [
          ...currentCharacters.filter((char) => char.id !== characterId),
          currentCharacter,
        ]);

        // Restore individual character data
        queryClient.setQueryData(characterQueryKey, currentCharacter);
      }
    },
  };
};

/**
 * Example usage:
 *
 * const updateCharacterMutation = useMutation(
 *   (data: { id: string, updates: Partial<Character> }) =>
 *     api.put(`/character/${data.id}`, data.updates),
 *   {
 *     onMutate: async (data) => {
 *       // Cancel any outgoing queries
 *       await queryClient.cancelQueries(['character', data.id]);
 *
 *       // Perform optimistic update
 *       const optimistic = optimisticUpdateCharacter(
 *         queryClient,
 *         data.id,
 *         data.updates
 *       );
 *
 *       optimistic.updateCache();
 *
 *       return optimistic;
 *     },
 *     onError: (err, variables, context) => {
 *       // Rollback on error
 *       context?.rollback();
 *     },
 *   }
 * );
 */
