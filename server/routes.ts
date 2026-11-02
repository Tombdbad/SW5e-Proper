import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
// Import from schema
import {
  characters,
  campaigns,
  debriefs,
  insertDebriefSchema,
  insertCharacterSchema,
  insertCampaignSchema,
} from "../shared/schema";
import { ZodError } from "zod";
import { formatError } from "./utils";
import { registerSw5eRoutes } from "./sw5eRoutes";
import { registerDialogueRoutes } from "./dialogue";
import { registerSpeechRoutes } from "./speech";
import { registerCoopRoutes, attachCoop, liveCampaign, mergeLive } from "./coop";

export async function registerRoutes(app: Express): Promise<Server> {
  // Rules data (shared/data/sw5e) and world generation
  registerSw5eRoutes(app);
  // Spoken replies from the local model (Ollama)
  registerDialogueRoutes(app);
  registerSpeechRoutes(app);
  // Co-op sessions: who is playing, and (below) the live campaign while a session has it open
  registerCoopRoutes(app);

  // All routes are prefixed with /api

  // Character endpoints
  app.get("/api/characters", async (req, res) => {
    try {
      res.json(await db.select().from(characters));
    } catch (error) {
      console.error("Error fetching characters:", error);
      res.status(500).json({ message: "Failed to fetch characters", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/characters/:id", async (req, res) => {
    try {
      const characterId = parseInt(req.params.id);
      const character = await db
        .select()
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      if (!character || character.length === 0) {
        return res.status(404).json({ message: "Character not found" });
      }

      res.json(character[0]);
    } catch (error) {
      console.error("Error fetching character:", error);
      res.status(500).json({ message: "Failed to fetch character" });
    }
  });

  app.post("/api/characters", async (req, res) => {
    try {
      // Parse and validate the character data
      const characterData = insertCharacterSchema.parse(req.body);

      // Default userId to 1 for demo purposes
      let userData = { ...characterData, userId: 1 };
      
      // Handle subclass/archetype transition
      if (userData.subclass) {
        // Store existing subclass value for logging
        const originalSubclass = userData.subclass;
        console.log(`Migrating subclass '${originalSubclass}' to appropriate field`);
      }

      // Insert character into database
      const result = await db.insert(characters).values(userData).returning();

      if (!result || result.length === 0) {
        return res.status(500).json({ message: "Failed to create character" });
      }

      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating character:", error);

      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid character data",
          errors: formatError(error),
        });
      }

      res.status(500).json({ message: "Failed to create character" });
    }
  });

  app.put("/api/characters/:id", async (req, res) => {
    try {
      const characterId = parseInt(req.params.id);

      // Validate the character data (partial: clients send only changed fields)
      const characterData = insertCharacterSchema.partial().parse(req.body);

      // Update character in database
      const result = await db
        .update(characters)
        .set({ ...characterData, updatedAt: new Date() })
        .where(eq(characters.id, characterId))
        .returning();

      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Character not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error updating character:", error);

      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid character data",
          errors: formatError(error),
        });
      }

      res.status(500).json({ message: "Failed to update character" });
    }
  });

  // PATCH and DELETE for characters
  app.patch("/api/characters/:id", async (req, res) => {
    try {
      const characterId = parseInt(req.params.id);
      const characterData = insertCharacterSchema.partial().parse(req.body);
      const result = await db
        .update(characters)
        .set({ ...characterData, updatedAt: new Date() })
        .where(eq(characters.id, characterId))
        .returning();
      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Character not found" });
      }
      res.json(result[0]);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid character data", errors: formatError(error) });
      }
      console.error("Error updating character:", error);
      res.status(500).json({ message: "Failed to update character" });
    }
  });

  app.delete("/api/characters/:id", async (req, res) => {
    try {
      const characterId = parseInt(req.params.id);
      const result = await db.delete(characters).where(eq(characters.id, characterId)).returning();
      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Character not found" });
      }
      // A campaign cannot be played without its character
      await db.delete(campaigns).where(eq(campaigns.characterId, characterId));
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting character:", error);
      res.status(500).json({ message: "Failed to delete character" });
    }
  });

  // /api/star-systems removed: tables never existed; the map uses local data in client/src/lib/sw5e

  // Campaign endpoints
  app.get("/api/campaigns", async (req, res) => {
    try {
      res.json(await db.select().from(campaigns));
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      // A co-op game keeps the campaign live in memory and writes it a moment after each change
      const live = liveCampaign(campaignId);
      if (live) return res.json(live);
      const campaign = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign || campaign.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(campaign[0]);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      // Parse and validate the campaign data
      const campaignData = insertCampaignSchema.parse(req.body);

      // Default userId to 1 for demo purposes
      const userData = { ...campaignData, userId: 1 };

      // Insert campaign into database
      const result = await db.insert(campaigns).values(userData).returning();

      if (!result || result.length === 0) {
        return res.status(500).json({ message: "Failed to create campaign" });
      }

      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating campaign:", error);

      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid campaign data",
          errors: formatError(error),
        });
      }

      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  const updateCampaign = async (req: any, res: any) => {
    try {
      const campaignId = parseInt(req.params.id);
      const campaignData = insertCampaignSchema.partial().parse(req.body);
      const result = await db
        .update(campaigns)
        .set({ ...campaignData, updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId))
        .returning();
      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      mergeLive(campaignId, campaignData);
      res.json(result[0]);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid campaign data", errors: formatError(error) });
      }
      console.error("Error updating campaign:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  };
  app.put("/api/campaigns/:id", updateCampaign);
  app.patch("/api/campaigns/:id", updateCampaign);

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const result = await db.delete(campaigns).where(eq(campaigns.id, campaignId)).returning();
      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  app.get("/api/campaigns/:id/locations", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const campaign = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign || campaign.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Return the locations from the campaign
      res.json(campaign[0].locations);
    } catch (error) {
      console.error("Error fetching campaign locations:", error);
      res.status(500).json({ message: "Failed to fetch campaign locations" });
    }
  });

  // Debrief endpoints for LLM communication
  app.post("/api/debriefs", async (req, res) => {
    try {
      // Parse and validate the debrief data
      const debriefData = insertDebriefSchema.parse(req.body);

      // Insert debrief into database
      const result = await db.insert(debriefs).values(debriefData).returning();

      if (!result || result.length === 0) {
        return res.status(500).json({ message: "Failed to create debrief" });
      }

      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error creating debrief:", error);

      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid debrief data",
          errors: formatError(error),
        });
      }

      res.status(500).json({ message: "Failed to create debrief" });
    }
  });

  app.put("/api/debriefs/:id/response", async (req, res) => {
    try {
      const debriefId = parseInt(req.params.id);
      const { response } = req.body;

      if (!response) {
        return res.status(400).json({ message: "Response data is required" });
      }

      // Update debrief with LLM response
      const result = await db
        .update(debriefs)
        .set({ response })
        .where(eq(debriefs.id, debriefId))
        .returning();

      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Debrief not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error updating debrief response:", error);
      res.status(500).json({ message: "Failed to update debrief response" });
    }
  });

  const httpServer = createServer(app);
  attachCoop(httpServer);

  return httpServer;
}