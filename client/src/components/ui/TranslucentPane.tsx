
import React from 'react';
import { cn } from '@/lib/utils';

interface TranslucentPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  blurStrength?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  opacity?: 'none' | 'low' | 'medium' | 'high' | 'full';
  variant?: 'default' | 'dark' | 'light' | 'accent';
  border?: boolean;
  shadow?: boolean;
  bordered?: boolean;
}

export const TranslucentPane: React.FC<TranslucentPaneProps> = ({
  children,
  className,
  blurStrength = 'md',
  opacity = 'medium',
  variant = 'default',
  border = true,
  shadow = true,
  bordered = false,
  ...props
}) => {
  // Map blur strength to Tailwind classes
  const blurMap = {
    none: '',
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
    xl: 'backdrop-blur-xl',
    '2xl': 'backdrop-blur-2xl',
    '3xl': 'backdrop-blur-3xl',
  };

  // Map opacity to background color
  const opacityMap = {
    none: 'bg-transparent',
    low: variant === 'dark' ? 'bg-black/10' : variant === 'light' ? 'bg-white/10' : variant === 'accent' ? 'bg-yellow-800/10' : 'bg-gray-800/10',
    medium: variant === 'dark' ? 'bg-black/30' : variant === 'light' ? 'bg-white/30' : variant === 'accent' ? 'bg-yellow-800/30' : 'bg-gray-800/30',
    high: variant === 'dark' ? 'bg-black/60' : variant === 'light' ? 'bg-white/60' : variant === 'accent' ? 'bg-yellow-800/60' : 'bg-gray-800/60',
    full: variant === 'dark' ? 'bg-black' : variant === 'light' ? 'bg-white' : variant === 'accent' ? 'bg-yellow-800' : 'bg-gray-800',
  };

  // Map border based on variant
  const borderClass = border
    ? variant === 'dark'
      ? 'border border-gray-800/40'
      : variant === 'light'
      ? 'border border-gray-200/40'
      : variant === 'accent'
      ? 'border border-yellow-700/40'
      : 'border border-gray-700/40'
    : '';

  // Map shadow based on variant
  const shadowClass = shadow ? 'shadow-lg' : '';

  // Map text color based on variant
  const textColorClass =
    variant === 'dark'
      ? 'text-white'
      : variant === 'light'
      ? 'text-gray-900'
      : variant === 'accent'
      ? 'text-gray-100'
      : 'text-gray-100';

  // Apply bordered style if requested
  const borderedClass = bordered
    ? variant === 'accent'
      ? 'border-2 border-yellow-500'
      : 'border-2 border-gray-500/50'
    : '';

  return (
    <div
      className={cn(
        'rounded-lg p-4',
        blurMap[blurStrength],
        opacityMap[opacity],
        borderClass,
        shadowClass,
        textColorClass,
        borderedClass,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default TranslucentPane;
