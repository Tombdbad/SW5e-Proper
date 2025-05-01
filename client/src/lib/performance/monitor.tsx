import React, { useEffect, useState, useRef, PropsWithChildren } from 'react';
import { useCharacter } from '../stores/useCharacter';

// Types of performance metrics we track
type PerformanceMetric = {
  componentName: string;
  renderTime: number;
  updateCount: number;
  lastUpdated: number;
};

// Global metrics store
const metrics: Record<string, PerformanceMetric> = {};

// Function to record metrics
export function recordMetric(componentName: string, renderTime: number) {
  if (!metrics[componentName]) {
    metrics[componentName] = {
      componentName,
      renderTime,
      updateCount: 1,
      lastUpdated: Date.now()
    };
  } else {
    metrics[componentName].renderTime = 
      (metrics[componentName].renderTime * metrics[componentName].updateCount + renderTime) / 
      (metrics[componentName].updateCount + 1);
    metrics[componentName].updateCount += 1;
    metrics[componentName].lastUpdated = Date.now();
  }
}

// Hook to measure component render time
export function useRenderMetrics(componentName: string) {
  const startTimeRef = useRef(performance.now());

  useEffect(() => {
    const renderTime = performance.now() - startTimeRef.current;
    recordMetric(componentName, renderTime);

    return () => {
      startTimeRef.current = performance.now();
    };
  });
}

// Higher-order component to measure performance
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string = Component.displayName || Component.name || 'UnknownComponent'
) {
  return function WithPerformanceTracking(props: P) {
    useRenderMetrics(componentName);
    return <Component {...props} />;
  };
}

// Component to display performance metrics in development
export function PerformanceDebugger() {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<PerformanceMetric[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        setShow(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (show) {
      const timer = setInterval(() => {
        setData(Object.values(metrics).sort((a, b) => b.renderTime - a.renderTime));
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [show]);

  if (!show) return null;

  return (
    <div 
      className="fixed bottom-0 right-0 bg-black/90 text-white p-4 z-50 max-h-96 overflow-auto" 
      style={{ maxWidth: '50vw' }}
    >
      <div className="flex justify-between mb-2">
        <h3 className="font-bold">Performance Metrics</h3>
        <button onClick={() => setShow(false)} className="text-gray-400 hover:text-white">
          Close
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-600">
            <th className="text-left py-1">Component</th>
            <th className="text-right py-1">Render Time (ms)</th>
            <th className="text-right py-1">Updates</th>
            <th className="text-right py-1">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {data.map((metric) => (
            <tr key={metric.componentName} className="border-b border-gray-800">
              <td className="py-1">{metric.componentName}</td>
              <td className={`text-right py-1 ${metric.renderTime > 16 ? 'text-red-400' : 'text-green-400'}`}>
                {metric.renderTime.toFixed(2)}
              </td>
              <td className="text-right py-1">{metric.updateCount}</td>
              <td className="text-right py-1">{new Date(metric.lastUpdated).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.length === 0 && <p className="text-gray-400 mt-2">No metrics collected yet</p>}
    </div>
  );
}

// Store performance tracker component
type StoreTrackerProps = {
  storeName: string;
};

export function StorePerformanceTracker({ storeName }: StoreTrackerProps) {
  const [metrics, setMetrics] = useState({
    updateCount: 0,
    lastUpdateTime: 0,
    averageUpdateTime: 0,
    totalUpdateTime: 0,
  });

  useEffect(() => {
    // Create a proxy around the store to track updates
    if (storeName === 'character') {
      const origSet = useCharacter.setState;

      useCharacter.setState = (fn: any, replace?: boolean) => {
        const start = performance.now();
        const result = origSet(fn, replace);
        const end = performance.now();
        const updateTime = end - start;

        setMetrics(prev => ({
          updateCount: prev.updateCount + 1,
          lastUpdateTime: updateTime,
          totalUpdateTime: prev.totalUpdateTime + updateTime,
          averageUpdateTime: (prev.totalUpdateTime + updateTime) / (prev.updateCount + 1)
        }));

        return result;
      };

      return () => {
        useCharacter.setState = origSet;
      };
    }
  }, [storeName]);

  return null; // This is just a tracker, doesn't render anything
}

// Application wrapper with performance tracking
export function PerformanceMonitor({ children }: PropsWithChildren<{}>) {
  const isDevMode = process.env.NODE_ENV === 'development';

  if (!isDevMode) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <PerformanceDebugger />
      <StorePerformanceTracker storeName="character" />
    </>
  );
}

export default PerformanceMonitor;