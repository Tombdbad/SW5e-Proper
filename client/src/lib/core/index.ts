
/**
 * Core library for client-side helpers
 * This file serves as a re-export point for the new structure
 */

// Re-export from stores
export { default as useCharacter } from '../stores/useCharacter';
export { default as useCampaign } from '../stores/useCampaign';
export { default as useCombat } from '../stores/useCombat';

// Re-export from middleware
export { 
  withValidation, 
  withHistory, 
  withPerformanceMonitoring,
  createStore 
} from '../stores/middleware';

// Re-export from persistence
export { 
  createHybridStorage, 
  createPersistOptions 
} from '../stores/persistence';

// Re-export from selectors
export { 
  createSelectors, 
  createStoreHooks, 
  createStoreWithSelectors 
} from '../stores/selectors';

// Re-export performance monitoring
export { 
  PerformanceMonitor,
  usePerformance,
  withPerformanceTracking,
  PerformanceMetricsDisplay,
  useComponentPerformance
} from '../performance/monitor';

// This file will be expanded as more core functionality is moved
// from other parts of the codebase into the new structure
