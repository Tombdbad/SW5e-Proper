import { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { ZodSchema } from 'zod';

// Define custom middleware type
export type CustomMiddlewareImpl = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>,
  options?: unknown
) => StateCreator<T, Mps, Mcs>;

// Middleware to validate state changes using Zod
export const validateSchema = <T>(schema: ZodSchema<T>): CustomMiddlewareImpl =>
  (set, get) => (setState, getState, store) => {
    const validateSet: typeof set = (updates, replace) => {
      // Create the updated state
      const updatedState = typeof updates === 'function'
        ? updates(getState())
        : updates;

      // Validate the updated state
      try {
        schema.parse(updatedState);
      } catch (error) {
        console.error('State validation error:', error);
        throw error;
      }

      // Apply the updates if validation passed
      return set(updates, replace);
    };

    return store(validateSet, get, store);
  };

// Middleware for selective state updates to prevent unnecessary renders
export const selectiveUpdates = <T extends Object>(): CustomMiddlewareImpl =>
  (set, get) => (setState, getState, store) => {
    const selectiveSet: typeof set = (updates, replace) => {
      // If we're replacing the whole state, just do it
      if (replace) {
        return set(updates, replace);
      }

      // If updates is a function, get its result first
      const updatedState = typeof updates === 'function'
        ? updates(getState())
        : updates;

      // Compare with current state to find actual changes
      const currentState = getState();
      const changedKeys = Object.keys(updatedState).filter(key => {
        // Deep comparison for objects, simple comparison for primitives
        const currentValue = currentState[key as keyof T];
        const newValue = updatedState[key as keyof T];

        if (typeof newValue === 'object' && newValue !== null) {
          return JSON.stringify(currentValue) !== JSON.stringify(newValue);
        }

        return currentValue !== newValue;
      });

      // If nothing changed, don't update
      if (changedKeys.length === 0) {
        return getState();
      }

      // Create a filtered update with only changed values
      const filteredUpdates = changedKeys.reduce((acc, key) => {
        acc[key as keyof T] = updatedState[key as keyof T];
        return acc;
      }, {} as Partial<T>);

      // Apply the filtered updates
      return set(filteredUpdates as Partial<T>, false);
    };

    return store(selectiveSet, get, store);
  };

// Middleware for memoization of expensive calculations
export const memoize = <T>(): CustomMiddlewareImpl =>
  (set, get) => (setState, getState, store) => {
    // Cache for memoized values
    const cache = new Map<string, any>();

    // Proxy for the store to intercept get operations
    const memoizedGet: typeof get = () => {
      const state = getState();

      // Return a proxied state that memoizes derived values
      return new Proxy(state, {
        get: (target, prop) => {
          const value = target[prop as keyof T];

          // If this is a function and property starts with "calculate", memoize it
          if (typeof value === 'function' && typeof prop === 'string' && prop.startsWith('calculate')) {
            return (...args: any[]) => {
              // Create a cache key from the function name and arguments
              const cacheKey = `${String(prop)}(${args.map(arg => JSON.stringify(arg)).join(',')})`;

              // Return cached value if we have it
              if (cache.has(cacheKey)) {
                return cache.get(cacheKey);
              }

              // Calculate and cache the result
              const result = value.apply(target, args);
              cache.set(cacheKey, result);
              return result;
            };
          }

          return value;
        }
      });
    };

    // Clear cache when state is updated
    const memoizedSet: typeof set = (updates, replace) => {
      // Clear cache
      cache.clear();

      // Apply updates
      return set(updates, replace);
    };

    return store(memoizedSet, memoizedGet, store);
  };

// Middleware for debug logging
export const debugMiddleware = <T>(): CustomMiddlewareImpl =>
  (set, get) => (setState, getState, store) => {
    const wrappedSet: typeof set = (updates, replace) => {
      console.group('State update');
      console.log('Prev state:', getState());
      console.log('Updates:', updates);

      const newState = set(updates, replace);

      console.log('Next state:', getState());
      console.groupEnd();

      return newState;
    };

    return store(wrappedSet, get, store);
  };

// Middleware for performance monitoring
export const performanceMonitoring = <T>(): CustomMiddlewareImpl =>
  (set, get) => (setState, getState, store) => {
    const wrappedSet: typeof set = (updates, replace) => {
      const startTime = performance.now();

      // Track what kind of update this is
      const updateType = typeof updates === 'function'
        ? 'function'
        : replace ? 'replace' : 'partial';

      const result = set(updates, replace);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Log or track slow updates (over 16ms which is roughly 60fps threshold)
      if (duration > 16) {
        console.warn(`Slow state update (${duration.toFixed(2)}ms) of type ${updateType}`);

        // Could send to monitoring service
        // reportPerformanceIssue({ type: 'slowStateUpdate', duration, updateType });
      }

      return result;
    };

    return store(wrappedSet, get, store);
  };

// Combine multiple middleware
export const combineMiddleware = (...middlewares: CustomMiddlewareImpl[]): CustomMiddlewareImpl =>
  (set, get) => (setState, getState, store) => {
    // Apply middlewares in reverse order (like compose)
    let result = store;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      result = middlewares[i](setState, getState, result);
    }
    return result;
  };


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
 * Enhanced performance monitoring middleware with detailed metrics and tracking
 */
export const performanceMonitor = <T extends object>(
  f: StateCreator<T>,
  options?: {
    enabled?: boolean;
    thresholdMs?: number;
    trackHistory?: boolean;
    maxHistorySize?: number;
    consoleOutput?: boolean;
  }
) => {
  const config = {
    enabled: process.env.NODE_ENV === 'development',
    thresholdMs: 10, // Log operations that take longer than this threshold
    trackHistory: true, // Keep a history of update metrics
    maxHistorySize: 50, // Maximum number of updates to keep in history
    consoleOutput: true, // Whether to output to console
    ...options,
  };

  // Keep track of update metrics
  const updateMetrics: {
    timestamp: number;
    action: string;
    duration: number;
    stateSize: number;
  }[] = [];

  // Expose metrics API globally for debugging
  if (typeof window !== 'undefined' && config.enabled) {
    (window as any).__SW5E_PERFORMANCE__ = {
      getMetrics: () => updateMetrics,
      clearMetrics: () => updateMetrics.splice(0, updateMetrics.length),
      setThreshold: (ms: number) => { config.thresholdMs = ms; }
    };
    console.info('Performance monitoring enabled. Access with window.__SW5E_PERFORMANCE__');
  }

  return (set: any, get: any, store: any) => {
    const monitoredSet = (...args: any) => {
      if (!config.enabled) return set(...args);

      // Get action name if available
      const action = typeof args[0] === 'function'
        ? args[0].name || 'anonymous'
        : 'setState';

      const label = `State update ${store.name || ''}: ${action}`;
      const startTime = performance.now();

      // Execute the state update
      const result = set(...args);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Estimate state size
      const currentState = get();
      const stateSize = JSON.stringify(currentState).length;

      // Track metrics if history tracking is enabled
      if (config.trackHistory) {
        updateMetrics.push({
          timestamp: Date.now(),
          action,
          duration,
          stateSize
        });

        // Keep history within size limit
        if (updateMetrics.length > config.maxHistorySize) {
          updateMetrics.shift();
        }
      }

      // Output to console if threshold exceeded
      if (duration > config.thresholdMs && config.consoleOutput) {
        console.warn(`⚠️ Slow state update detected in ${store.name || 'store'}: ${duration.toFixed(2)}ms`);
        console.log(`Action: ${action}, State size: ${(stateSize / 1024).toFixed(2)} KB`);
        console.groupCollapsed('Update Details');
        console.log('Arguments:', ...args);
        console.log('Current state:', currentState);
        console.groupEnd();
      }

      return result;
    };

    return f(monitoredSet, get, store);
  };
};

/**
 * Component rendering performance tracker
 * Usage: wrap your component with withPerformanceTracking(YourComponent)
 */
export const withPerformanceTracking = <P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    name?: string;
    enabled?: boolean;
    trackProps?: boolean;
    trackRenders?: boolean;
  }
) => {
  const config = {
    name: Component.displayName || Component.name || 'UnnamedComponent',
    enabled: process.env.NODE_ENV === 'development',
    trackProps: true,
    trackRenders: true,
    ...options
  };

  if (!config.enabled) {
    return Component;
  }

  return React.memo((props: P) => {
    const renderCount = React.useRef(0);
    const lastRenderTime = React.useRef(performance.now());

    React.useEffect(() => {
      renderCount.current++;
      const renderTime = performance.now() - lastRenderTime.current;

      if (config.trackRenders) {
        console.log(
          `[Performance] ${config.name} rendered (#${renderCount.current}) in ${renderTime.toFixed(2)}ms`
        );
      }

      return () => {
        lastRenderTime.current = performance.now();
      };
    });

    if (config.trackProps) {
      console.log(`[Performance] ${config.name} props:`, props);
    }

    return <Component {...props} />;
  });
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

export * from './characterStore';