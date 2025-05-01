
import React, { createContext, useContext, useEffect, useState, useRef, FC, useCallback } from 'react';

// Types for performance metrics
interface PerformanceMetrics {
  fps: number;
  memory: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  } | null;
  renders: Record<string, number>;
  timings: Record<string, {
    count: number;
    totalTime: number;
    average: number;
    min: number;
    max: number;
    lastMeasurement: number;
  }>;
}

interface PerformanceContextValue {
  metrics: PerformanceMetrics;
  startMeasure: (name: string) => void;
  endMeasure: (name: string) => void;
  trackRender: (componentName: string) => void;
  resetMetrics: () => void;
  isDebugEnabled: boolean;
  setDebugEnabled: (enabled: boolean) => void;
}

// Default metrics object
const defaultMetrics: PerformanceMetrics = {
  fps: 0,
  memory: null,
  renders: {},
  timings: {},
};

// Create context
const PerformanceContext = createContext<PerformanceContextValue>({
  metrics: defaultMetrics,
  startMeasure: () => {},
  endMeasure: () => {},
  trackRender: () => {},
  resetMetrics: () => {},
  isDebugEnabled: false,
  setDebugEnabled: () => {},
});

export const usePerformance = () => useContext(PerformanceContext);

interface PerformanceMonitorProps {
  children: React.ReactNode;
  enabled?: boolean;
  sampleRate?: number; // How often to update metrics in ms
  warningThresholds?: {
    fps?: number;
    memoryUsage?: number; // percentage
    renderCount?: number;
    timing?: number; // ms
  };
}

export const PerformanceMonitor: FC<PerformanceMonitorProps> = ({
  children,
  enabled = process.env.NODE_ENV === 'development',
  sampleRate = 1000,
  warningThresholds = {
    fps: 30,
    memoryUsage: 90,
    renderCount: 10,
    timing: 16, // 60fps frame budget
  },
}) => {
  const [isDebugEnabled, setDebugEnabled] = useState(enabled);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(defaultMetrics);
  
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const timingMarksRef = useRef<Record<string, number>>({});
  const requestIdRef = useRef<number | null>(null);
  
  // Function to measure FPS
  const measureFPS = useCallback(() => {
    const now = performance.now();
    const elapsed = now - lastFrameTimeRef.current;
    
    if (elapsed >= sampleRate) {
      const fps = (frameCountRef.current * 1000) / elapsed;
      
      setMetrics(prev => ({
        ...prev,
        fps: Math.round(fps),
      }));
      
      if (fps < (warningThresholds.fps || 30)) {
        console.warn(`Low FPS detected: ${fps.toFixed(1)}`);
      }
      
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }
    
    frameCountRef.current++;
    
    // Schedule next frame
    if (isDebugEnabled) {
      requestIdRef.current = requestAnimationFrame(measureFPS);
    }
  }, [isDebugEnabled, sampleRate, warningThresholds.fps]);
  
  // Measure memory usage (if available)
  const measureMemory = useCallback(() => {
    if (performance.memory) {
      // @ts-ignore - Chrome-specific API
      const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = performance.memory;
      
      setMetrics(prev => ({
        ...prev,
        memory: {
          jsHeapSizeLimit,
          totalJSHeapSize,
          usedJSHeapSize,
        },
      }));
      
      const usagePercent = (usedJSHeapSize / jsHeapSizeLimit) * 100;
      if (usagePercent > (warningThresholds.memoryUsage || 90)) {
        console.warn(`High memory usage: ${usagePercent.toFixed(1)}%`);
      }
    }
  }, [warningThresholds.memoryUsage]);
  
  // Start a performance measurement
  const startMeasure = useCallback((name: string) => {
    if (!isDebugEnabled) return;
    timingMarksRef.current[name] = performance.now();
  }, [isDebugEnabled]);
  
  // End a performance measurement
  const endMeasure = useCallback((name: string) => {
    if (!isDebugEnabled) return;
    
    const startTime = timingMarksRef.current[name];
    if (!startTime) {
      console.warn(`No start time found for measurement: ${name}`);
      return;
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    setMetrics(prev => {
      const existingTiming = prev.timings[name] || {
        count: 0,
        totalTime: 0,
        average: 0,
        min: Infinity,
        max: 0,
        lastMeasurement: 0,
      };
      
      const newCount = existingTiming.count + 1;
      const newTotal = existingTiming.totalTime + duration;
      
      const newTiming = {
        count: newCount,
        totalTime: newTotal,
        average: newTotal / newCount,
        min: Math.min(existingTiming.min, duration),
        max: Math.max(existingTiming.max, duration),
        lastMeasurement: duration,
      };
      
      // Log warning if exceeded threshold
      if (duration > (warningThresholds.timing || 16)) {
        console.warn(`Slow operation "${name}": ${duration.toFixed(2)}ms`);
      }
      
      return {
        ...prev,
        timings: {
          ...prev.timings,
          [name]: newTiming,
        },
      };
    });
    
    // Clear the timing mark
    delete timingMarksRef.current[name];
  }, [isDebugEnabled, warningThresholds.timing]);
  
  // Track component renders
  const trackRender = useCallback((componentName: string) => {
    if (!isDebugEnabled) return;
    
    setMetrics(prev => {
      const renderCount = (prev.renders[componentName] || 0) + 1;
      
      // Log warning if exceeded threshold
      if (renderCount > (warningThresholds.renderCount || 10)) {
        console.warn(`High render count for "${componentName}": ${renderCount}`);
      }
      
      return {
        ...prev,
        renders: {
          ...prev.renders,
          [componentName]: renderCount,
        },
      };
    });
  }, [isDebugEnabled, warningThresholds.renderCount]);
  
  // Reset all metrics
  const resetMetrics = useCallback(() => {
    setMetrics(defaultMetrics);
    frameCountRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    timingMarksRef.current = {};
  }, []);
  
  // Start/stop performance monitoring
  useEffect(() => {
    if (isDebugEnabled) {
      // Start measuring
      requestIdRef.current = requestAnimationFrame(measureFPS);
      
      // Set up memory measurements (if available)
      let memoryInterval: NodeJS.Timeout | null = null;
      if (performance.memory) {
        memoryInterval = setInterval(measureMemory, sampleRate);
      }
      
      // Add global developer tools
      if (typeof window !== 'undefined') {
        // @ts-ignore
        window.__SW5E_PERFORMANCE = {
          getMetrics: () => metrics,
          resetMetrics,
          startMeasure,
          endMeasure,
        };
      }
      
      return () => {
        if (requestIdRef.current !== null) {
          cancelAnimationFrame(requestIdRef.current);
        }
        
        if (memoryInterval) {
          clearInterval(memoryInterval);
        }
      };
    }
  }, [isDebugEnabled, measureFPS, measureMemory, metrics, resetMetrics, sampleRate, startMeasure, endMeasure]);
  
  const contextValue: PerformanceContextValue = {
    metrics,
    startMeasure,
    endMeasure,
    trackRender,
    resetMetrics,
    isDebugEnabled,
    setDebugEnabled,
  };
  
  return (
    <PerformanceContext.Provider value={contextValue}>
      {children}
    </PerformanceContext.Provider>
  );
};

// HOC to track component render performance
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  options: {
    name?: string;
    trackProps?: boolean;
    trackRenders?: boolean;
    trackMounting?: boolean;
    trackUpdates?: boolean;
  } = {}
) {
  const componentName = options.name || Component.displayName || Component.name || 'UnknownComponent';
  const {
    trackProps = true,
    trackRenders = true,
    trackMounting = true,
    trackUpdates = true,
  } = options;
  
  const WrappedComponent: React.FC<P> = (props) => {
    const { trackRender, startMeasure, endMeasure, isDebugEnabled } = usePerformance();
    const prevPropsRef = useRef<P | null>(null);
    
    useEffect(() => {
      if (isDebugEnabled && trackMounting) {
        startMeasure(`${componentName}:mount`);
        
        return () => {
          endMeasure(`${componentName}:mount`);
        };
      }
    }, []);
    
    useEffect(() => {
      if (!isDebugEnabled || !trackProps || !prevPropsRef.current) return;
      
      // Compare props to detect which ones changed
      const changedProps: string[] = [];
      const allKeys = new Set([
        ...Object.keys(prevPropsRef.current),
        ...Object.keys(props)
      ]);
      
      allKeys.forEach(key => {
        if (prevPropsRef.current![key as keyof P] !== props[key as keyof P]) {
          changedProps.push(key);
        }
      });
      
      if (changedProps.length > 0) {
        console.debug(`${componentName} props changed:`, changedProps);
      }
      
      prevPropsRef.current = { ...props };
    });
    
    // Track render time
    if (isDebugEnabled && trackRenders) {
      trackRender(componentName);
    }
    
    if (isDebugEnabled && trackUpdates) {
      startMeasure(`${componentName}:render`);
      const result = <Component {...props} />;
      endMeasure(`${componentName}:render`);
      return result;
    }
    
    return <Component {...props} />;
  };
  
  WrappedComponent.displayName = `withPerformanceTracking(${componentName})`;
  
  return WrappedComponent;
}

// Simple metrics display component
export const PerformanceMetricsDisplay: FC<{
  showFps?: boolean;
  showMemory?: boolean;
  showRenders?: boolean;
  showTimings?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}> = ({
  showFps = true,
  showMemory = true,
  showRenders = true,
  showTimings = true,
  position = 'bottom-right',
}) => {
  const { metrics, isDebugEnabled, setDebugEnabled, resetMetrics } = usePerformance();
  
  if (!isDebugEnabled) {
    return null;
  }
  
  // Calculate positioning
  const positionStyles: React.CSSProperties = {
    position: 'fixed',
    padding: '10px',
    background: 'rgba(0, 0, 0, 0.75)',
    color: 'white',
    fontFamily: 'monospace',
    fontSize: '12px',
    zIndex: 9999,
    maxHeight: '50vh',
    overflowY: 'auto',
    maxWidth: '300px',
  };
  
  if (position.includes('top')) {
    positionStyles.top = '10px';
  } else {
    positionStyles.bottom = '10px';
  }
  
  if (position.includes('right')) {
    positionStyles.right = '10px';
  } else {
    positionStyles.left = '10px';
  }
  
  // Format bytes to human-readable form
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };
  
  return (
    <div style={positionStyles}>
      <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
        <strong>SW5E Performance</strong>
        <div>
          <button 
            onClick={resetMetrics}
            style={{ marginRight: '5px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
          >
            Reset
          </button>
          <button 
            onClick={() => setDebugEnabled(false)}
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      </div>
      
      {showFps && (
        <div style={{ marginBottom: '5px' }}>
          <strong>FPS:</strong> {metrics.fps} 
          {metrics.fps < 30 && <span style={{ color: 'red' }}> (Low)</span>}
        </div>
      )}
      
      {showMemory && metrics.memory && (
        <div style={{ marginBottom: '10px' }}>
          <div>
            <strong>Memory Usage:</strong> {formatBytes(metrics.memory.usedJSHeapSize)} / {formatBytes(metrics.memory.jsHeapSizeLimit)}
          </div>
          <div style={{ 
            width: '100%', 
            height: '5px', 
            background: '#333', 
            marginTop: '5px',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${(metrics.memory.usedJSHeapSize / metrics.memory.jsHeapSizeLimit) * 100}%`,
              height: '100%',
              background: metrics.memory.usedJSHeapSize / metrics.memory.jsHeapSizeLimit > 0.9 ? 'red' : 'green',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}
      
      {showRenders && Object.keys(metrics.renders).length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <strong>Component Renders:</strong>
          <ul style={{ margin: '5px 0', paddingLeft: '15px' }}>
            {Object.entries(metrics.renders)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([component, count]) => (
                <li key={component}>
                  {component}: {count}
                  {count > 10 && <span style={{ color: 'orange' }}> (High)</span>}
                </li>
              ))}
          </ul>
          {Object.keys(metrics.renders).length > 10 && (
            <div style={{ fontSize: '10px', fontStyle: 'italic' }}>
              Showing top 10 of {Object.keys(metrics.renders).length} components
            </div>
          )}
        </div>
      )}
      
      {showTimings && Object.keys(metrics.timings).length > 0 && (
        <div>
          <strong>Timing Measurements:</strong>
          <ul style={{ margin: '5px 0', paddingLeft: '15px' }}>
            {Object.entries(metrics.timings)
              .sort((a, b) => b[1].average - a[1].average)
              .slice(0, 10)
              .map(([name, timing]) => (
                <li key={name}>
                  {name}: {timing.average.toFixed(2)}ms avg
                  {timing.average > 16 && <span style={{ color: 'orange' }}> (Slow)</span>}
                </li>
              ))}
          </ul>
          {Object.keys(metrics.timings).length > 10 && (
            <div style={{ fontSize: '10px', fontStyle: 'italic' }}>
              Showing top 10 of {Object.keys(metrics.timings).length} timings
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Hook for tracking component render and update timings
export function useComponentPerformance(componentName: string) {
  const { isDebugEnabled, startMeasure, endMeasure, trackRender } = usePerformance();
  const renderIdRef = useRef(0);
  
  useEffect(() => {
    if (isDebugEnabled) {
      const id = ++renderIdRef.current;
      const timerName = `${componentName}:render:${id}`;
      
      startMeasure(timerName);
      trackRender(componentName);
      
      return () => {
        endMeasure(timerName);
      };
    }
  });
  
  const measureOperation = useCallback((name: string, operation: Function) => {
    if (!isDebugEnabled) {
      return operation();
    }
    
    const timerName = `${componentName}:${name}`;
    startMeasure(timerName);
    try {
      return operation();
    } finally {
      endMeasure(timerName);
    }
  }, [componentName, endMeasure, isDebugEnabled, startMeasure]);
  
  const measureAsyncOperation = useCallback(async (name: string, operation: Function) => {
    if (!isDebugEnabled) {
      return operation();
    }
    
    const timerName = `${componentName}:${name}`;
    startMeasure(timerName);
    try {
      return await operation();
    } finally {
      endMeasure(timerName);
    }
  }, [componentName, endMeasure, isDebugEnabled, startMeasure]);
  
  return {
    measureOperation,
    measureAsyncOperation,
  };
}

export default PerformanceMonitor;
