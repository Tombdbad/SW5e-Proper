import { ZodError } from "zod";

/**
 * Formats a Zod validation error into a more user-friendly format
 * @param error The ZodError to format
 * @returns A structured error object
 */
export function formatError(error: ZodError) {
  return error.errors.map(err => ({
    path: err.path.join('.'),
    message: err.message
  }));
}
