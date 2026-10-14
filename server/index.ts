import express, { type Request, Response, NextFunction } from "express";
import "dotenv/config";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool, ensureDefaultUser } from "./db";

const app = express();
// Generated worlds are a few hundred kB of JSON
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Check database connection before registering routes
  try {
    // Simple query to test DB connection
    await pool.query("SELECT 1");
    await ensureDefaultUser();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection error:', error);
    // Continue anyway, as we'll handle errors in individual routes
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error(err);
    if (!res.headersSent) res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serves the API and the client on port 5000 (the service), or PORT for a test copy
  // Listens on loopback unless HOST is set: the app has no login (see REVIVAL_NOTES.md, Phase 3)
  const port = Number(process.env.PORT) || 5000;
  server.listen({
    port,
    host: process.env.HOST || "127.0.0.1",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
