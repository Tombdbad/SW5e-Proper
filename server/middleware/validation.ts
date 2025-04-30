import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";

/**
 * Express middleware for validating request body against a Zod schema
 */
export const handleValidationErrors = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body against schema
      const validatedData = await schema.parseAsync(req.body);

      // Replace request body with validated data
      req.body = validatedData;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        return res.status(400).json({
          message: "Validation error",
          errors: formatZodErrors(error),
        });
      }

      // Handle unexpected errors
      return res.status(500).json({
        message: "An unexpected error occurred during validation",
      });
    }
  };
};

/**
 * Format Zod errors into a more user-friendly structure
 */
function formatZodErrors(error: ZodError) {
  const formattedErrors: Record<string, string> = {};

  error.errors.forEach((err) => {
    // Get the field path (e.g., "name", "abilities.strength")
    const path = err.path.join(".");

    // Add the error message
    formattedErrors[path] = err.message;
  });

  return formattedErrors;
}

/**
 * Express middleware for validating query parameters against a Zod schema
 */
export const validateQueryParams = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query params against schema
      const validatedData = await schema.parseAsync(req.query);

      // Replace query params with validated data
      req.query = validatedData;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        return res.status(400).json({
          message: "Invalid query parameters",
          errors: formatZodErrors(error),
        });
      }

      // Handle unexpected errors
      return res.status(500).json({
        message: "An unexpected error occurred during validation",
      });
    }
  };
};
