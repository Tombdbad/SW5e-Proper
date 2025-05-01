
import React, { useState, useEffect, useRef } from 'react';
import { useCharacterStore } from '../stores/useCharacterStore';

interface PerformanceEntry {
  component: string;
  renderTime: number;
  timestamp: number;
}

interface StoreUpdateEntry {
  action: string;
  duration: number;
  timestamp: number;
  stateSize: number;
}

// Global performance tracking
const renderTimings: PerformanceEntry[] = [];
const storeUpdates: StoreUpdateEntry[] = [];

// Maximum number of entries to keep
const MAX_ENTRIES = 100;

/**
 * HOC to track component render performance
 */
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  options: { name?: string; trackProps?: boolean } = {}
) {
  const componentName = options.name || Component.displayName || Component.name || 'Component';
  
  // Return a new component that tracks renders
  const TrackedComponent = (props: P) => {
    const renderStartTime = useRef(performance.now());
    
    useEffect(() => {
      const renderTime = performance.now() - renderStartTime.current;
      
      // Add to tracking
      renderTimings.push({
        component: componentName,
        renderTime,
        timestamp: Date.now()
      });
      
      // Keep array size in check
      if (renderTimings.length > MAX_ENTRIES) {
        renderTimings.shift();
      }
      
      // Log if tracking props
      if (options.trackProps) {
        console.log(`[Performance] ${componentName} rendered in ${renderTime.toFixed(2)}ms with props:`, props);
      }
      
      // Reset for next render
      renderStartTime.current = performance.now();
    });
    
    return <Component {...props} />;
  };
  
  TrackedComponent.displayName = `Tracked(${componentName})`;
  return TrackedComponent;
}

/**
 * Hook to add performance tracking to any component
 */
export function useTrackRenders(componentName: string) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());
  
  useEffect(() => {
    const renderTime = performance.now() - lastRenderTime.current;
    renderCount.current++;
    
    renderTimings.push({
      component: componentName,
      renderTime,
      timestamp: Date.now()
    });
    
    // Keep array size in check
    if (renderTimings.length > MAX_ENTRIES) {
      renderTimings.shift();
    }
    
    // Reset for next render
    lastRenderTime.current = performance.now();
    
    return () => {
      // Component unmount logic if needed
    };
  });
  
  return renderCount.current;
}

/**
 * Component to display performance metrics in the UI
 */
export function PerformanceMonitor() {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState({
    renders: renderTimings,
    storeUpdates: storeUpdates,
  });
  
  // Update metrics periodically
  useEffect(() => {
    const intervalId = setInterval(() => {
      setMetrics({
        renders: [...renderTimings],
        storeUpdates: [...storeUpdates]
      });
    }, 1000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Add keyboard shortcut to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+P to toggle
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        setIsOpen(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded opacity-50 hover:opacity-100"
      >
        Monitor
      </button>
    );
  }
  
  // Render metrics UI
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 text-white overflow-auto z-50">
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Performance Monitor</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="bg-red-600 text-white px-3 py-1 rounded"
          >
            Close
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-700 rounded p-4">
            <h3 className="text-lg font-semibold mb-2">Component Renders</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2">Component</th>
                  <th className="text-right py-2">Render Time</th>
                  <th className="text-right py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {metrics.renders
                  .sort((a, b) => b.renderTime - a.renderTime)
                  .slice(0, 10)
                  .map((entry, i) => (
                    <tr key={i} className="border-b border-gray-800">
                      <td className="py-1">{entry.component}</td>
                      <td className="text-right py-1">
                        <span className={entry.renderTime > 16 ? "text-red-400" : "text-green-400"}>
                          {entry.renderTime.toFixed(2)}ms
                        </span>
                      </td>
                      <td className="text-right py-1 text-gray-400">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          
          <div className="border border-gray-700 rounded p-4">
            <h3 className="text-lg font-semibold mb-2">Store Updates</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2">Action</th>
                  <th className="text-right py-2">Duration</th>
                  <th className="text-right py-2">State Size</th>
                </tr>
              </thead>
              <tbody>
                {metrics.storeUpdates
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 10)
                  .map((entry, i) => (
                    <tr key={i} className="border-b border-gray-800">
                      <td className="py-1">{entry.action}</td>
                      <td className="text-right py-1">
                        <span className={entry.duration > 10 ? "text-red-400" : "text-green-400"}>
                          {entry.duration.toFixed(2)}ms
                        </span>
                      </td>
                      <td className="text-right py-1">
                        {(entry.stateSize / 1024).toFixed(2)} KB
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="mt-4 border border-gray-700 rounded p-4">
          <h3 className="text-lg font-semibold mb-2">Actions</h3>
          <div className="flex space-x-2">
            <button 
              onClick={() => {
                renderTimings.length = 0;
                storeUpdates.length = 0;
                setMetrics({ renders: [], storeUpdates: [] });
              }}
              className="bg-red-600 text-white px-3 py-1 rounded"
            >
              Clear Metrics
            </button>
            
            <button 
              onClick={() => console.table(renderTimings)}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              Log Render Data
            </button>
            
            <button 
              onClick={() => console.table(storeUpdates)}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              Log Store Updates
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Track store updates
 * Add this to your Zustand store to track updates
 */
export const trackStoreUpdates = (set: any, get: any, api: any) => (next: any) => (
  fn: any,
  ...args: any[]
) => {
  const actionName = typeof fn === 'function' ? fn.name || 'anonymous' : 'setState';
  const startTime = performance.now();
  
  // Call the original update function
  const result = next(fn, ...args);
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  // Get state size
  const stateSize = JSON.stringify(get()).length;
  
  // Record the update
  storeUpdates.push({
    action: actionName,
    duration,
    timestamp: Date.now(),
    stateSize
  });
  
  // Keep array size in check
  if (storeUpdates.length > MAX_ENTRIES) {
    storeUpdates.shift();
  }
  
  // Log slow updates
  if (duration > 10) {
    console.warn(`[Store Performance] Slow update: ${actionName} took ${duration.toFixed(2)}ms`);
  }
  
  return result;
};

// Export globally for debugging in console
if (typeof window !== 'undefined') {
  (window as any).__SW5E_PERFORMANCE__ = {
    getRenderMetrics: () => [...renderTimings],
    getStoreUpdates: () => [...storeUpdates],
    clearMetrics: () => {
      renderTimings.length = 0;
      storeUpdates.length = 0;
    }
  };
}
