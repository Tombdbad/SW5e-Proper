
import { useState, useCallback } from 'react';

interface UseLoadingOptions {
  initialState?: boolean;
  timeout?: number;
  onTimeout?: () => void;
}

export function useLoading({
  initialState = false,
  timeout,
  onTimeout,
}: UseLoadingOptions = {}) {
  const [isLoading, setIsLoading] = useState(initialState);
  const [error, setError] = useState<Error | null>(null);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    // Optional timeout handling
    if (timeout) {
      const timer = setTimeout(() => {
        setIsLoading(false);
        if (onTimeout) {
          onTimeout();
        }
      }, timeout);
      
      return () => clearTimeout(timer);
    }
  }, [timeout, onTimeout]);

  const stopLoading = useCallback((err?: Error) => {
    setIsLoading(false);
    if (err) {
      setError(err);
    }
  }, []);

  const wrapPromise = useCallback(async <T,>(promise: Promise<T>): Promise<T> => {
    try {
      startLoading();
      const result = await promise;
      stopLoading();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      stopLoading(error);
      throw error;
    }
  }, [startLoading, stopLoading]);

  return {
    isLoading,
    error,
    startLoading,
    stopLoading,
    wrapPromise,
    setError,
  };
}
