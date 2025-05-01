
import React from "react";
import { cn } from "@/lib/utils";

export interface HologramLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export function HologramLoader({
  size = "md",
  className,
  ...props
}: HologramLoaderProps) {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 rounded-full border-2 border-blue-400/30 animate-ping" />
      <div className="absolute inset-2 rounded-full border border-blue-400/50 animate-pulse" />
      <div className="absolute w-full h-full animate-scan">
        <div className="h-0.5 w-full bg-blue-400/70 blur-[1px] shadow-[0_0_5px_rgba(59,130,246,0.8)]"></div>
      </div>
      <div className="text-blue-400/80 animate-pulse text-xs">LOADING</div>
    </div>
  );
}
