
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLoading } from './useLoading';

interface UseLoadingStateOptions {
  queryKey?: unknown[];
  queryKeys?: unknown[][];
}

export function useLoadingState({ queryKey, queryKeys = [] }: UseLoadingStateOptions = {}) {
  const queryClient = useQueryClient();
  const { isLoading, startLoading, stopLoading, error, setError } = useLoading();
  
  // Add the single queryKey to the array of queryKeys if provided
  const allQueryKeys = queryKey ? [...queryKeys, queryKey] : queryKeys;
  
  useEffect(() => {
    if (allQueryKeys.length === 0) return;
    
    // Track loading state for all provided query keys
    const isAnyLoading = allQueryKeys.some(key => {
      const state = queryClient.getQueryState(key);
      return state?.status === 'loading';
    });
    
    // Track error state for all provided query keys
    const firstError = allQueryKeys
      .map(key => queryClient.getQueryState(key)?.error)
      .find(error => error !== undefined);
    
    if (isAnyLoading) {
      startLoading();
    } else {
      stopLoading();
    }
    
    if (firstError) {
      setError(firstError as Error);
    }
  }, [allQueryKeys, queryClient, startLoading, stopLoading, setError]);
  
  return {
    isLoading,
    error,
  };
}
