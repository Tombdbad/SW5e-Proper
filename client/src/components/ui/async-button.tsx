
import React, { useState, useCallback } from 'react';
import { Button } from './button';
import { ButtonProps } from './button';
import { Spinner } from './spinner';
import { cn } from '@/lib/utils';

export interface AsyncButtonProps extends ButtonProps {
  onAsyncClick?: (event: React.MouseEvent<HTMLButtonElement>) => Promise<any>;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  showLoadingSpinner?: boolean;
  resetAfter?: number;
}

export function AsyncButton({
  children,
  onAsyncClick,
  onClick,
  disabled,
  loadingText,
  successText,
  errorText,
  showLoadingSpinner = true,
  resetAfter = 2000,
  className,
  ...props
}: AsyncButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  const handleClick = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    // If no async handler, just call the regular onClick
    if (!onAsyncClick) {
      onClick?.(event);
      return;
    }
    
    try {
      setStatus('loading');
      await onAsyncClick(event);
      setStatus('success');
      
      // Reset button state after a delay
      if (resetAfter > 0) {
        setTimeout(() => {
          setStatus('idle');
        }, resetAfter);
      }
    } catch (error) {
      console.error('AsyncButton error:', error);
      setStatus('error');
      
      // Reset button state after a delay
      if (resetAfter > 0) {
        setTimeout(() => {
          setStatus('idle');
        }, resetAfter);
      }
    }
  }, [onClick, onAsyncClick, resetAfter]);
  
  // Determine what text to display
  const buttonText = () => {
    if (status === 'loading' && loadingText) return loadingText;
    if (status === 'success' && successText) return successText;
    if (status === 'error' && errorText) return errorText;
    return children;
  };
  
  // Apply variant based on status
  const getVariantClass = () => {
    if (status === 'success') return 'bg-green-600 hover:bg-green-700';
    if (status === 'error') return 'bg-red-600 hover:bg-red-700';
    return '';
  };
  
  return (
    <Button
      onClick={handleClick}
      disabled={disabled || status === 'loading'}
      className={cn(getVariantClass(), className)}
      {...props}
    >
      <span className="flex items-center justify-center gap-2">
        {status === 'loading' && showLoadingSpinner && <Spinner size="sm" className="h-3 w-3" />}
        {buttonText()}
      </span>
    </Button>
  );
}
