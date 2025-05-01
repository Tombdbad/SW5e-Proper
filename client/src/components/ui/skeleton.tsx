import React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circle" | "rect";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ 
  variant = "text", 
  className, 
  width, 
  height,
  ...props 
}: SkeletonProps) {
  const baseClasses = "animate-pulse bg-gray-700/40 rounded";

  const variantClasses = {
    text: "h-4 w-full",
    circle: "rounded-full aspect-square",
    rect: "rounded-md"
  };

  const styles: React.CSSProperties = {
    width: width || undefined,
    height: height || undefined
  };

  return (
    <div 
      className={cn(baseClasses, variantClasses[variant], className)}
      style={styles}
      {...props} 
    />
  );
}
