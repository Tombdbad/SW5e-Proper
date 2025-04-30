import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ApiError } from "./sw5eApi";

// Create storage persister for offline support
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "sw5e-react-query-cache",
  // Only persist non-error, non-stale data
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => JSON.parse(data),
  throttleTime: 1000, // Only save to storage every second
});

// Create and configure QueryClient
export const createQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // General settings
        staleTime: 5 * 60 * 1000, // 5 minutes - SW5E data doesn't change frequently
        cacheTime: 4 * 60 * 60 * 1000, // 4 hours
        refetchOnWindowFocus: false, // SW5E data is mostly static
        refetchOnMount: true,
        retry: (failureCount, error) => {
          // Don't retry on 4xx client errors
          if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            return false;
          }
          // Retry up to 3 times for other errors
          return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

        // Error handling
        onError: (error) => {
          console.error("Query error:", error);
          // Handle 401 unauthorized errors
          if (error instanceof ApiError && error.status === 401) {
            // Clear token and redirect to login
            localStorage.removeItem("auth_token");
            window.location.href = "/login";
          }
        },
      },
      mutations: {
        // Better error handling for mutations
        retry: 1,
        onError: (error) => {
          console.error("Mutation error:", error);
        },
      },
    },
  });

  // Setup persistence for offline support
  persistQueryClient({
    queryClient,
    persister: localStoragePersister,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    // Only persist specific queries that would be useful offline
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        // Persist character data and reference data (species, classes, etc.)
        const queryKey = Array.isArray(query.queryKey)
          ? query.queryKey[0]
          : query.queryKey;

        const persistableKeys = [
          "species",
          "classes",
          "backgrounds",
          "powers",
          "feats",
          "character",
          "characters",
        ];

        return (
          // Only persist successful queries
          query.state.status === "success" &&
          // Only persist certain types of data
          persistableKeys.includes(queryKey as string)
        );
      },
    },
  });

  return queryClient;
};

export default createQueryClient;
