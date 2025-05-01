import { create, StateCreator } from 'zustand';
import { persist, createJSONStorage, PersistOptions } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import { z } from 'zod';

/**
 * Creates a validation middleware that ensures state changes conform to a Zod schema
 */
  export const withValidation = <T extends object, CustomState extends T = CustomState, CustomActions = {}>(
  schema: z.ZodType<T>,
  config?: {
    onError?: (error: z.ZodError, newState: T, prevState: T) => void;
  }
) => 
  (initializer: StateCreator<CustomState & CustomActions>) => 
  (set: any, get: any, store: any) => {
    return initializer(
      (partial: any, replace?: boolean) => {
        const nextState = typeof partial === 'function' 
          ? partial(get())
          : partial;

        const mergedState = replace 
          ? nextState 
          : { ...get(), ...nextState };

        try {
          // Validate against schema
          schema.parse(mergedState);
          return set(partial, replace);
        } catch (error) {
          if (error instanceof z.ZodError) {
            console.error('State validation failed:', error.errors);
            config?.onError?.(error, mergedState, get());

            // In development, throw; in production, fallback to previous valid state
            if (process.env.NODE_ENV === 'development') {
              throw error;
            }
          }
          return false;
        }
      },
      get,
      store
    );
  };

/**
 * Creates a history tracking middleware for undo/redo capability
 */
export const withHistory = <T extends object>(
  config: {
    limit?: number;
    ignoredKeys?: (keyof T)[];
  } = {}
) =>
  (initializer: StateCreator<T & { 
    history: { past: T[], future: T[] },
    actions: { 
      undo: () => void;
      redo: () => void;
      clearHistory: () => void;
      addHistoryEntry: () => void;
    }
  }>) =>
  (set: any, get: any, store: any) => {
    const { limit = 100, ignoredKeys = [] } = config;

    const initialState = {
      history: {
        past: [],
        future: []
      },
      actions: {
        undo: () => {
          const { history } = get();
          if (history.past.length === 0) return;

          const previous = history.past[history.past.length - 1];
          const newPast = history.past.slice(0, history.past.length - 1);

          const currentState = { ...get() };
          // Remove history and actions from currentState
          delete (currentState as any).history;
          delete (currentState as any).actions;

          set({
            ...previous,
            history: {
              past: newPast,
              future: [currentState, ...history.future]
            }
          });
        },

        redo: () => {
          const { history } = get();
          if (history.future.length === 0) return;

          const next = history.future[0];
          const newFuture = history.future.slice(1);

          const currentState = { ...get() };
          // Remove history and actions from currentState
          delete (currentState as any).history;
          delete (currentState as any).actions;

          set({
            ...next,
            history: {
              past: [...history.past, currentState],
              future: newFuture
            }
          });
        },

        clearHistory: () => {
          set({
            history: {
              past: [],
              future: []
            }
          });
        },

        addHistoryEntry: () => {
          const state = { ...get() };
          // Remove history and actions from saved state
          delete (state as any).history;
          delete (state as any).actions;

          // Filter out ignored keys
          const filteredState = { ...state };
          for (const key of ignoredKeys) {
            delete (filteredState as any)[key];
          }

          set((prev: any) => ({
            history: {
              past: [...prev.history.past, filteredState].slice(-limit),
              future: []
            }
          }));
        }
      }
    };

    // Initialize with a custom setter that tracks history
    const initializer2 = initializer(
      (partial: any, replace?: boolean) => {
        // Only track history for object updates, not function updates
        if (typeof partial === 'object' && !replace) {
          const currentState = get();

          // Don't track history updates
          if (!partial.history) {
            currentState.actions.addHistoryEntry();
          }
        }

        set(partial, replace);
      },
      get,
      store
    );

    return {
      ...initializer2,
      ...initialState
    };
  };



/**
 * Helper to create a store with common middleware stack
 */
export function createStore<T extends object, A, P extends string = 'persist'>(
  initialState: T,
  storeCreator: StateCreator<T & A, [['zustand/immer', never]], []>,
  persistOptions?: PersistOptions<T & A, P>
) {
  if (persistOptions) {
    return create<T & A>()(
      devtools(
        immer(
          persist(storeCreator, persistOptions)
        )
      )
    );
  }

  return create<T & A>()(
    devtools(
      immer(storeCreator)
    )
  );
}

// Default middlewares combined
export const withDefaultMiddleware = <T extends object, P extends string = 'persist'>(
  schema: z.ZodType<T>,
  persistOptions?: PersistOptions<T, P>
) => {
  return (
    initializer: StateCreator<T>
  ) => {
    let creator = immer(initializer);
    creator = withValidation(schema)(creator);
    creator = withHistory<T>()(creator) as any;

    if (persistOptions) {
      creator = persist(creator, persistOptions);
    }

    return devtools(creator);
  };
};