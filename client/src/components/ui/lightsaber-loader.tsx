
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface LightsaberLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: "blue" | "green" | "purple" | "red" | "yellow";
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}

export function LightsaberLoader({ 
  color = "blue", 
  size = "md", 
  animated = true,
  className, 
  ...props 
}: LightsaberLoaderProps) {
  const [progress, setProgress] = useState(0);
  
  // Color mapping
  const colorClasses = {
    blue: "bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]",
    green: "bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)]",
    purple: "bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.8)]",
    red: "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]",
    yellow: "bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]",
  };
  
  // Size mapping
  const sizeClasses = {
    sm: "h-1.5 w-24",
    md: "h-2 w-40",
    lg: "h-3 w-56",
  };
  
  // Handle animation
  useEffect(() => {
    if (!animated) {
      setProgress(100);
      return;
    }
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          return 0;
        }
        return prev + 4;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [animated]);
  
  return (
    <div className="flex items-center">
      <div className={cn("rounded-l-sm bg-gray-600", sizeClasses[size], "w-5")} />
      <div className={cn("rounded-r-full overflow-hidden", sizeClasses[size], className)} {...props}>
        <div 
          className={cn("h-full transition-all duration-300", colorClasses[color])}
          style={{ width: `${progress}%` }} 
        />
      </div>
    </div>
  );
}
