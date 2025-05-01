
import React from "react";
import { cn } from "@/lib/utils";

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-3",
    lg: "h-12 w-12 border-4",
  };
  
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-solid border-yellow-400 border-t-transparent",
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
