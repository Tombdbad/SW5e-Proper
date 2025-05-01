
import React from 'react';
import { LoadingOverlay } from './loading-overlay';
import { Skeleton } from './skeleton';

export interface WithLoadingProps {
  isLoading?: boolean;
  error?: Error | null;
  loadingText?: string;
  skeleton?: React.ReactNode;
  fallback?: React.ReactNode;
  spinnerSize?: 'sm' | 'md' | 'lg';
  transparent?: boolean;
}

export function withLoading<P extends object>(
  Component: React.ComponentType<P>,
  defaultOptions: Omit<WithLoadingProps, 'isLoading' | 'error'> = {}
) {
  return function WithLoadingComponent({
    isLoading = false,
    error = null,
    loadingText,
    skeleton,
    fallback,
    spinnerSize,
    transparent,
    ...props
  }: P & WithLoadingProps) {
    // If there's an error and a fallback, show the fallback
    if (error && fallback) {
      return <>{fallback}</>;
    }

    // If loading with a skeleton, show the skeleton
    if (isLoading && skeleton) {
      return <>{skeleton}</>;
    }

    // If loading without a skeleton, show the overlay
    if (isLoading) {
      return (
        <LoadingOverlay 
          isLoading={true} 
          text={loadingText || defaultOptions.loadingText} 
          spinnerSize={spinnerSize || defaultOptions.spinnerSize}
          transparent={transparent ?? defaultOptions.transparent}
        >
          <Component {...props as P} />
        </LoadingOverlay>
      );
    }

    // Otherwise, render the component
    return <Component {...props as P} />;
  };
}
