
import React from 'react';

// No-op components and hooks to maintain API compatibility
export const PerformanceMonitor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const PerformanceMetricsDisplay = () => null;

interface PerformanceContextValue {
  isDebugEnabled: boolean;
  setDebugEnabled: (value: boolean) => void;
  recordMetric: (metricName: string, value: number) => void;
  recordRender: (componentName: string) => void;
  getMetrics: () => Record<string, number[]>;
  getRenderCounts: () => Record<string, number>;
  clearMetrics: () => void;
}

const noopContext: PerformanceContextValue = {
  isDebugEnabled: false,
  setDebugEnabled: () => {},
  recordMetric: () => {},
  recordRender: () => {},
  getMetrics: () => ({}),
  getRenderCounts: () => ({}),
  clearMetrics: () => {}
};

export const usePerformance = () => noopContext;

// Higher-order component for performance tracking (no-op)
export const withPerformanceTracking = (Component: React.ComponentType<any>, displayName?: string) => {
  return Component;
};

// Hook for component performance monitoring (no-op)
export const useComponentPerformance = (componentName: string) => {
  return {
    recordRender: () => {},
    timeOperation: async <T,>(operationName: string, operation: () => Promise<T> | T): Promise<T> => {
      return await operation();
    }
  };
};

// Export components individually for better Fast Refresh compatibility
export {
  PerformanceMonitor,
  usePerformance,
  withPerformanceTracking,
  PerformanceMetricsDisplay,
  useComponentPerformance
};

// Export a default object for backward compatibility
const performanceTools = {
  PerformanceMonitor,
  usePerformance,
  withPerformanceTracking,
  PerformanceMetricsDisplay,
  useComponentPerformance
};

export default performanceTools;
