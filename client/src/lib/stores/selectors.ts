
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { StoreApi, UseBoundStore } from 'zustand';
import { createSelectorHooks } from 'auto-zustand-selectors-hook';

/**
 * Creates memoized selectors for any store
 * This improves performance by preventing unnecessary rerenders
 */
export function createSelectors<T extends object>() {
  // Create a generic selector creator
  const createSelector = <U>(selector: (state: T) => U) => selector;
  
  // Collection of commonly-needed selectors
  const getProperty = <K extends keyof T>(key: K) => createSelector((state: T) => state[key]);
  
  const getProperties = <K extends keyof T>(...keys: K[]) => 
    createSelector((state: T) => {
      const result = {} as Pick<T, K>;
      for (const key of keys) {
        result[key] = state[key];
      }
      return result;
    });
  
  // Selector that extracts a nested property
  const getNestedProperty = <K extends keyof T, SK extends keyof T[K]>(key: K, subKey: SK) => 
    createSelector((state: T) => state[key][subKey]);
    
  // Computes a derived value from state
  const compute = <U>(fn: (state: T) => U) => createSelector(fn);
  
  return {
    createSelector,
    getProperty,
    getProperties,
    getNestedProperty,
    compute
  };
}

/**
 * Type-safe hook creator for selecting store slices
 */
export function createStoreHooks<T extends object, A = unknown>(
  useStore: UseBoundStore<StoreApi<T & A>>
) {
  // Use shallow comparison by default to prevent unnecessary rerenders
  const useSlice = <U>(selector: (state: T) => U) => useStore(useShallow(selector));
  
  // For simple property access
  const useProperty = <K extends keyof T>(key: K) => useSlice(state => state[key]);
  
  // For multiple properties
  const useProperties = <K extends keyof T>(...keys: K[]) => 
    useSlice(state => {
      const result = {} as Pick<T, K>;
      for (const key of keys) {
        result[key] = state[key];
      }
      return result;
    });
  
  // For derived/computed values with memoization
  const useComputed = <U>(compute: (state: T) => U, deps: any[] = []) => {
    // Get the raw data from store
    const data = useStore(state => compute(state));
    
    // Memoize the computed result
    return useMemo(() => data, [data, ...deps]);
  };
  
  // For actions
  const useActions = () => useStore(state => (state as unknown as A));
  
  return {
    useStore,     // Original store hook
    useSlice,     // Select and subscribe to a slice
    useProperty,  // Select and subscribe to a single property
    useProperties, // Select multiple properties
    useComputed,  // Computed values with memoization
    useActions    // Get just the actions
  };
}

/**
 * Factory function to create a fully typed store API with selectors
 */
export function createStoreWithSelectors<T extends object, A = unknown>(
  useStore: UseBoundStore<StoreApi<T & A>>
) {
  // Create the enhanced hooks
  const hooks = createStoreHooks(useStore);
  
  // Create selectors for use in those hooks
  const selectors = createSelectors<T>();
  
  // Create auto-selectors for more ergonomic usage
  const autoSelectors = createSelectorHooks(useStore);
  
  return {
    ...hooks,
    selectors,
    ...autoSelectors
  };
}

/**
 * Helper for detecting and subscribing to specific state changes
 */
export function createChangeDetector<T extends object, K extends keyof T = keyof T>(
  useStore: UseBoundStore<StoreApi<T>>,
  options: {
    keys?: K[];
    onlyChanged?: boolean;
    debounce?: number;
  } = {}
) {
  const { keys, onlyChanged = true, debounce = 0 } = options;
  
  return (callback: (current: T, previous: T) => void) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let previousState: T | null = null;
    
    // Subscribe to store
    useStore.subscribe((state) => {
      // Skip first call
      if (previousState === null) {
        previousState = { ...state };
        return;
      }
      
      // If keys specified, check if any changed
      if (keys && onlyChanged) {
        const anyKeysChanged = keys.some(key => state[key] !== previousState![key]);
        if (!anyKeysChanged) return;
      }
      
      // Debounce if needed
      if (debounce > 0) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          callback(state, previousState!);
          previousState = { ...state };
        }, debounce);
      } else {
        callback(state, previousState);
        previousState = { ...state };
      }
    });
  };
}

export default {
  createSelectors,
  createStoreHooks,
  createStoreWithSelectors,
  createChangeDetector
};
