import { StoreApi, UseBoundStore } from 'zustand';

// Helper to create typed selectors
export function createSelectors<T extends Object, F extends Object = T>(
  store: UseBoundStore<StoreApi<T>>
) {
  type WithSelectors = {
    use: {
      [K in keyof F]: () => F[K];
    };
  } & {
    use<U>(selector: (state: T) => U, equalityFn?: (a: U, b: U) => boolean): U;
  } & UseBoundStore<StoreApi<T>>;

  // Create the extended store
  const extensionObject = { use: {} } as any;

  // Create selectors for all keys
  const entries = Object.entries(store.getState()) as Array<[keyof F, any]>;
  for (const [key, value] of entries) {
    if (key === 'actions' || typeof value === 'object') {
      if (typeof value === 'object' && value !== null) {
        // For nested objects like 'actions' or 'derived'
        const nestedObj = extensionObject.use[key] = {};

        // Create a selector that gets the whole object
        extensionObject.use[`${key}$`] = () => store(state => state[key]);

        // Create selectors for all properties of the nested object
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (typeof nestedValue === 'function') {
            // For methods, we create a selector that returns the method bound to the state
            nestedObj[nestedKey] = (...args: any[]) => {
              const method = store(state => state[key][nestedKey]);
              if (typeof method === 'function') {
                return method(...args);
              }
              return undefined;
            };
          } else {
            // For non-function properties, create a regular selector
            nestedObj[nestedKey] = () => store(state => state[key][nestedKey]);
          }
        }
      } else {
        // For primitive values
        extensionObject.use[key] = () => store(state => state[key]);
      }
    } else {
      // For primitive values
      extensionObject.use[key] = () => store(state => state[key]);
    }
  }

  // Add the general selector function
  extensionObject.use = Object.assign(
    function useSelector<U>(selector: (state: T) => U, equalityFn?: (a: U, b: U) => boolean) {
      return store(selector, equalityFn);
    },
    extensionObject.use
  );

  return Object.assign(store, extensionObject) as WithSelectors;
}

// Create a memoized selector that recomputes only when dependencies change
export function createMemoizedSelector<T, R>(
  selector: (state: T) => R,
  dependencies: Array<keyof T>
): (state: T) => R {
  let lastState: Partial<T> = {};
  let lastResult: R;
  let initialized = false;

  return (state: T): R => {
    // Check if any dependencies changed
    const hasChanged = dependencies.some(
      (dep) => !initialized || state[dep] !== lastState[dep]
    );

    if (hasChanged) {
      // Update last state with current values of dependencies
      lastState = dependencies.reduce((acc, dep) => {
        acc[dep] = state[dep];
        return acc;
      }, {} as Partial<T>);

      // Recompute the result
      lastResult = selector(state);
      initialized = true;
    }

    return lastResult;
  };
}

// Create a selector that computes derived state
export function createDerivedSelector<T, K extends keyof T, R>(
  baseSelector: (state: T) => T[K],
  derivation: (baseValue: T[K]) => R
): (state: T) => R {
  return (state: T): R => {
    const baseValue = baseSelector(state);
    return derivation(baseValue);
  };
}

// Create a family of selectors that share computation logic but vary by parameter
export function createSelectorFamily<T, P, R>(
  selectorCreator: (param: P) => (state: T) => R
): (param: P) => (state: T) => R {
  const cache = new Map<string, (state: T) => R>();

  return (param: P): ((state: T) => R) => {
    const cacheKey = JSON.stringify(param);

    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, selectorCreator(param));
    }

    return cache.get(cacheKey)!;
  };
}

// Helper to create actions that update a store
export function createActions<T>(store: StoreApi<T>) {
  return <A extends Record<string, (state: T, ...args: any[]) => Partial<T> | void>>(
    actions: A
  ): { [K in keyof A]: (...args: Parameters<A[K]> extends [T, ...infer P] ? P : never) => void } => {
    return Object.entries(actions).reduce((acc, [name, fn]) => {
      acc[name as keyof A] = (...args: any[]) => {
        store.setState(state => {
          const result = fn(state, ...args);
          if (result === undefined) return {} as Partial<T>;
          return result;
        });
      };
      return acc;
    }, {} as any);
  };
}