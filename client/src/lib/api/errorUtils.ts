import { ApiError } from "./sw5eApi";

// Error types for more specific handling
export enum ErrorType {
  NETWORK = "network",
  SERVER = "server",
  VALIDATION = "validation",
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  NOT_FOUND = "not_found",
  UNKNOWN = "unknown",
}

// Error details with user-friendly messages
export interface ErrorDetails {
  type: ErrorType;
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
  raw?: any;
}

/**
 * Process API errors into consistent format
 */
export const processApiError = (error: unknown): ErrorDetails => {
  // Handle ApiError (from our axios wrapper)
  if (error instanceof ApiError) {
    // Authentication errors
    if (error.status === 401) {
      return {
        type: ErrorType.AUTHENTICATION,
        message: "Your session has expired. Please log in again.",
        status: error.status,
        raw: error.data,
      };
    }

    // Authorization errors
    if (error.status === 403) {
      return {
        type: ErrorType.AUTHORIZATION,
        message: "You do not have permission to perform this action.",
        status: error.status,
        raw: error.data,
      };
    }

    // Not found errors
    if (error.status === 404) {
      return {
        type: ErrorType.NOT_FOUND,
        message: "The requested resource was not found.",
        status: error.status,
        raw: error.data,
      };
    }

    // Validation errors (Assuming server returns validation errors in a consistent format)
    if (error.status === 422 || error.status === 400) {
      let fieldErrors: Record<string, string> = {};

      // Try to extract field-specific errors
      if (error.data?.errors && typeof error.data.errors === "object") {
        fieldErrors = error.data.errors;
      }

      return {
        type: ErrorType.VALIDATION,
        message: error.data?.message || "The provided data is invalid.",
        status: error.status,
        fieldErrors,
        raw: error.data,
      };
    }

    // Server errors
    if (error.status >= 500) {
      return {
        type: ErrorType.SERVER,
        message: "The server encountered an error. Please try again later.",
        status: error.status,
        raw: error.data,
      };
    }

    // Other API errors
    return {
      type: ErrorType.UNKNOWN,
      message: error.message || "An error occurred.",
      status: error.status,
      raw: error.data,
    };
  }

  // Network errors
  if (error instanceof Error && error.message.includes("Network Error")) {
    return {
      type: ErrorType.NETWORK,
      message:
        "Unable to connect to the server. Please check your internet connection.",
      raw: error,
    };
  }

  // Generic error fallback
  return {
    type: ErrorType.UNKNOWN,
    message:
      error instanceof Error ? error.message : "An unknown error occurred.",
    raw: error,
  };
};

/**
 * Hook to display user-friendly error messages
 * This can be expanded to integrate with your notification system
 */
export const useErrorNotification = () => {
  const showErrorNotification = (error: unknown) => {
    const processedError = processApiError(error);

    // Log for debugging
    console.error("API Error:", processedError);

    // Here you would integrate with your UI notification system
    // For example, if using react-toastify:
    // toast.error(processedError.message);

    return processedError;
  };

  return { showErrorNotification };
};

/**
 * Error retry configuration helper
 */
export const getRetryConfig = (maxRetries = 3) => ({
  retry: (failureCount: number, error: any) => {
    const processedError = processApiError(error);

    // Don't retry client errors (except network errors)
    if (
      processedError.type === ErrorType.VALIDATION ||
      processedError.type === ErrorType.AUTHORIZATION ||
      processedError.type === ErrorType.NOT_FOUND
    ) {
      return false;
    }

    // Retry network errors and server errors
    return (
      (processedError.type === ErrorType.NETWORK ||
        processedError.type === ErrorType.SERVER) &&
      failureCount < maxRetries
    );
  },
  retryDelay: (attemptIndex: number) =>
    Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
});
