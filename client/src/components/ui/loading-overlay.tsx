
import React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  isLoading: boolean;
  text?: string;
  spinnerSize?: "sm" | "md" | "lg";
  transparent?: boolean;
}

export function LoadingOverlay({ 
  isLoading, 
  text, 
  spinnerSize = "md", 
  transparent = false,
  className, 
  children, 
  ...props 
}: LoadingOverlayProps & { children?: React.ReactNode }) {
  if (!isLoading) return <>{children}</>;
  
  return (
    <div className="relative">
      {children}
      
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center z-50",
          transparent ? "bg-black/30 backdrop-blur-sm" : "bg-gray-900/90",
          className
        )}
        {...props}
      >
        <Spinner size={spinnerSize} />
        {text && (
          <p className="mt-4 text-sm text-yellow-400">{text}</p>
        )}
      </div>
    </div>
  );
}
