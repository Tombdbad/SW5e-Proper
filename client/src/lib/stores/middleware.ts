
import { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand';

// Types for middleware
type Logger = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>,
  name?: string
) => StateCreator<T, Mps, Mcs>;

type LogOptions = {
  enabled?: boolean;
  filter?: {
    actions?: string[];
    exclude?: string[];
  };
  verbose?: boolean;
  colors?: {
    prev?: string;
    action?: string;
    next?: string;
  };
};

/**
 * Middleware that logs all state changes to the console
 * Useful for debugging during development
 */
export const logger: Logger = (f, name) => (set, get, store) => {
  const options: LogOptions = {
    enabled: process.env.NODE_ENV === 'development',
    verbose: false,
    colors: {
      prev: '#9E9E9E',
      action: '#03A9F4',
      next: '#4CAF50',
    },
  };

  const loggedSet: typeof set = (...args) => {
    if (!options.enabled) return set(...args);
    
    const storeName = name || store.name || 'unnamed store';
    
    // Get previous state
    const prevState = get();
    
    // Apply the changes
    set(...args);
    
    // Get next state
    const nextState = get();
    
    // Log the state changes
    const actionType = typeof args[0] === 'function' 
      ? args[0].name || 'anonymous' 
      : 'setState';
    
    // Filter logging if specified
    if (options.filter) {
      if (options.filter.actions && !options.filter.actions.includes(actionType)) {
        return;
      }
      if (options.filter.exclude && options.filter.exclude.includes(actionType)) {
        return;
      }
    }
    
    // Create a pretty log
    console.groupCollapsed(
      `%c${storeName}: %c${actionType}`,
      'color: gray; font-weight: lighter;',
      'color: inherit; font-weight: bold;'
    );
    
    console.log(
      '%cPrev State:',
      `color: ${options.colors?.prev}; font-weight: bold;`,
      options.verbose ? prevState : findDifferences(prevState, nextState, true)
    );
    
    console.log(
      '%cAction:',
      `color: ${options.colors?.action}; font-weight: bold;`,
      ...args
    );
    
    console.log(
      '%cNext State:',
      `color: ${options.colors?.next}; font-weight: bold;`,
      options.verbose ? nextState : findDifferences(prevState, nextState, false)
    );
    
    console.groupEnd();
  };
  
  return f(loggedSet, get, store);
};

/**
 * Helper function to find differences between previous and next state
 */
function findDifferences(prev: any, next: any, isPrev: boolean): any {
  if (prev === next) return isPrev ? prev : next;
  
  if (
    typeof prev !== 'object' || 
    typeof next !== 'object' || 
    prev === null || 
    next === null
  ) {
    return isPrev ? prev : next;
  }
  
  // Handle arrays
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) {
      return isPrev ? prev : next;
    }
    
    const diffArray = isPrev ? [...prev] : [...next];
    let hasDiff = false;
    
    for (let i = 0; i < Math.max(prev.length, next.length); i++) {
      if (i >= prev.length || i >= next.length || prev[i] !== next[i]) {
        hasDiff = true;
        break;
      }
    }
    
    return hasDiff ? diffArray : undefined;
  }
  
  // Handle objects
  const result: any = {};
  let hasDiff = false;
  
  // Check all keys in both objects
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  
  for (const key of allKeys) {
    if (!(key in prev) || !(key in next) || prev[key] !== next[key]) {
      if (
        typeof prev[key] === 'object' && 
        prev[key] !== null && 
        typeof next[key] === 'object' && 
        next[key] !== null
      ) {
        const nestedDiff = findDifferences(prev[key], next[key], isPrev);
        if (nestedDiff !== undefined) {
          result[key] = nestedDiff;
          hasDiff = true;
        }
      } else {
        result[key] = isPrev ? prev[key] : next[key];
        hasDiff = true;
      }
    }
  }
  
  return hasDiff ? result : undefined;
}

/**
 * Middleware that tracks performance metrics for state updates
 */
export const performanceMonitor = <T extends object>(
  f: StateCreator<T>,
  options?: { 
    enabled?: boolean; 
    thresholdMs?: number;
  }
) => {
  const config = {
    enabled: process.env.NODE_ENV === 'development',
    thresholdMs: 10, // Log operations that take longer than this threshold
    ...options,
  };
  
  return (set: any, get: any, store: any) => {
    const monitoredSet = (...args: any) => {
      if (!config.enabled) return set(...args);
      
      const label = `State update ${store.name || ''}`;
      const startTime = performance.now();
      
      const result = set(...args);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (duration > config.thresholdMs) {
        console.warn(`⚠️ Slow state update detected in ${store.name || 'store'}: ${duration.toFixed(2)}ms`);
        console.log('Arguments:', ...args);
      }
      
      return result;
    };
    
    return f(monitoredSet, get, store);
  };
};

/**
 * Middleware that adds validation to state updates
 */
export const validator = <T extends object>(
  f: StateCreator<T>,
  validate: (state: T) => boolean | { valid: boolean; errors?: string[] }
) => {
  return (set: any, get: any, store: any) => {
    const validatedSet = (...args: any) => {
      // Apply the update
      const result = set(...args);
      
      // Validate the new state
      const state = get();
      const validation = validate(state);
      
      // Handle validation result
      if (validation === false || (typeof validation === 'object' && !validation.valid)) {
        console.error('State validation failed:', 
          typeof validation === 'object' ? validation.errors : 'Invalid state'
        );
        
        // Could revert the state or dispatch an error action here
      }
      
      return result;
    };
    
    return f(validatedSet, get, store);
  };
};

/**
 * Middleware for persistence with custom storage
 */
export const createPersistMiddleware = <T extends object>(
  options: {
    name: string;
    storage?: Storage;
    serialize?: (state: T) => string;
    deserialize?: (str: string) => T;
    partialize?: (state: T) => Partial<T>;
    version?: number;
    migrate?: (persistedState: any, version: number) => T;
  }
) => {
  const config = {
    storage: typeof window !== 'undefined' ? window.localStorage : null,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    partialize: (state: T) => state,
    version: 0,
    ...options,
  };
  
  return (f: StateCreator<T>) => (set: any, get: any, store: StoreApi<T>) => {
    // Load persisted state on initialization
    let persistedState: any;
    try {
      if (config.storage) {
        const storedData = config.storage.getItem(config.name);
        
        if (storedData) {
          const { state, version } = config.deserialize(storedData);
          
          persistedState = config.migrate 
            ? config.migrate(state, version || 0) 
            : state;
        }
      }
    } catch (e) {
      console.error('Error loading persisted state:', e);
    }
    
    // Initialize store with persisted state if available
    const initialState = persistedState || get();
    set(initialState, true);
    
    // Subscribe to state changes and persist
    const unsubscribe = store.subscribe((state) => {
      try {
        if (config.storage) {
          const persistData = {
            state: config.partialize(state),
            version: config.version,
          };
          
          config.storage.setItem(
            config.name, 
            config.serialize(persistData)
          );
        }
      } catch (e) {
        console.error('Error persisting state:', e);
      }
    });
    
    return f(set, get, {
      ...store,
      persistHelper: {
        clearStorage: () => {
          if (config.storage) {
            config.storage.removeItem(config.name);
          }
        },
        hasPersistedState: () => {
          return config.storage ? !!config.storage.getItem(config.name) : false;
        },
      },
    });
  };
};
