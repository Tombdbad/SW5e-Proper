
import React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: "default" | "lightsaber";
  showPercentage?: boolean;
}

export function ProgressBar({ 
  value, 
  max = 100, 
  variant = "default", 
  showPercentage = false,
  className, 
  ...props 
}: ProgressBarProps) {
  const percentage = Math.min(Math.max(0, (value / max) * 100), 100);
  
  return (
    <div className="w-full">
      <div
        className={cn(
          "h-2.5 w-full bg-gray-900/50 rounded-full overflow-hidden",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full transition-all duration-300 ease-out",
            variant === "default" ? "bg-yellow-400" : "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.7)]"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showPercentage && (
        <div className="text-xs text-gray-400 mt-1 text-right">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
}
