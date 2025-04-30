
import React from "react";

interface AlertProps {
  type: "info" | "success" | "warning" | "error";
  className?: string;
  children: React.ReactNode;
}

export default function Alert({ type, className = "", children }: AlertProps) {
  const typeStyles = {
    info: "bg-blue-500 bg-opacity-20 border-blue-500 text-blue-200",
    success: "bg-green-500 bg-opacity-20 border-green-500 text-green-200",
    warning: "bg-yellow-500 bg-opacity-20 border-yellow-500 text-yellow-200",
    error: "bg-red-500 bg-opacity-20 border-red-500 text-red-200",
  };

  return (
    <div
      className={`p-4 border-l-4 rounded ${typeStyles[type]} ${className}`}
    >
      {children}
    </div>
  );
}
