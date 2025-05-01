import React from 'react';

// Simple no-op implementation
export const PerformanceMonitor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const usePerformance = () => ({
  isDebugEnabled: false,
  setDebugEnabled: () => {},
  recordMetric: () => {},
  recordRender: () => {},
  getMetrics: () => ({}),
  getRenderCounts: () => ({}),
  clearMetrics: () => {}
});

export const withPerformanceTracking = (Component: React.ComponentType<any>) => Component;

export const useComponentPerformance = () => ({
  recordRender: () => {},
  timeOperation: async <T,>(operationName: string, operation: () => Promise<T> | T): Promise<T> => {
    return await operation();
  }
});

export const PerformanceMetricsDisplay = () => null;