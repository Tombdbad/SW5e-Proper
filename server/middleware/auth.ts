import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../../shared/schema";

// Add user property to Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
      };
    }
  }
}

/**
 * Authentication middleware to verify JWT tokens
 */
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("JWT_SECRET not configured");
      return res.status(500).json({ message: "Server configuration error" });
    }

    try {
      // Decode token payload
      const decoded = jwt.verify(token, secret) as {
        userId: string;
        email: string;
      };

      // Get user from database
      const user = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
        })
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);

      if (user.length === 0) {
        return res.status(401).json({ message: "User not found" });
      }

      // Attach user to request object
      req.user = user[0];

      next();
    } catch (error) {
      // Token validation failed
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ message: "Authentication failed" });
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
export const optionalAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(); // Continue without authentication
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(); // Continue without authentication
    }

    try {
      // Decode token payload
      const decoded = jwt.verify(token, secret) as {
        userId: string;
        email: string;
      };

      // Get user from database
      const user = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
        })
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);

      if (user.length > 0) {
        // Attach user to request object
        req.user = user[0];
      }

      next();
    } catch (error) {
      // Invalid token, but continue anyway as authentication is optional
      next();
    }
  } catch (error) {
    // Continue without authentication
    next();
  }
};
