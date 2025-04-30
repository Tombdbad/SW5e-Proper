import React, { ReactNode, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import createQueryClient from "./queryClient";

interface QueryProviderProps {
  children: ReactNode;
  enableDevTools?: boolean;
}

/**
 * Provider component that initializes React Query client
 * and provides it to the app along with optional devtools
 */
export function QueryProvider({
  children,
  enableDevTools = process.env.NODE_ENV === "development",
}: QueryProviderProps) {
  // Create a query client instance that persists for the lifetime of the component
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {enableDevTools && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export default QueryProvider;
