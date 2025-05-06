
import { create } from 'zustand';
import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  componentRenders: Record<string, number>;
  operationTimes: Record<string, number[]>;
  memoryUsage?: Record<string, number>;
}

interface PerformanceStore {
  metrics: PerformanceMetrics;
  isDebugEnabled: boolean;
  setDebugEnabled: (enabled: boolean) => void;
  recordRender: (componentName: string) => void;
  recordMetric: (name: string, duration: number) => void;
  clearMetrics: () => void;
}

export const usePerformanceStore = create<PerformanceStore>((set) => ({
  metrics: {
    componentRenders: {},
    operationTimes: {},
  },
  isDebugEnabled: false,
  setDebugEnabled: (enabled) => set({ isDebugEnabled: enabled }),
  recordRender: (componentName) =>
    set((state) => ({
      metrics: {
        ...state.metrics,
        componentRenders: {
          ...state.metrics.componentRenders,
          [componentName]: (state.metrics.componentRenders[componentName] || 0) + 1,
        },
      },
    })),
  recordMetric: (name, duration) =>
    set((state) => ({
      metrics: {
        ...state.metrics,
        operationTimes: {
          ...state.metrics.operationTimes,
          [name]: [...(state.metrics.operationTimes[name] || []), duration],
        },
      },
    })),
  clearMetrics: () =>
    set({
      metrics: {
        componentRenders: {},
        operationTimes: {},
      },
    }),
}));

export const useComponentPerformance = (componentName: string) => {
  const { recordRender, isDebugEnabled } = usePerformanceStore();
  const renderCount = useRef(0);

  useEffect(() => {
    if (isDebugEnabled) {
      renderCount.current += 1;
      recordRender(componentName);
    }
  });

  return {
    renderCount: renderCount.current,
  };
};

export async function withPerformanceTracking<T>(
  operationName: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await operation();
  } finally {
    const duration = performance.now() - start;
    usePerformanceStore.getState().recordMetric(operationName, duration);
  }
}
