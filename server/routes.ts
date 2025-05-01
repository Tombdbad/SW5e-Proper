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
} from "../shared/schema";
import {
  insertCharacterSchema,
  insertCampaignSchema,
  insertDebriefSchema,
} from "../shared/unifiedSchema";
import { ZodError } from "zod";
import { formatError } from "./utils";
import * as SW5EData from "./sw5eData";

export async function registerRoutes(app: Express): Promise<Server> {
  // SW5E Data endpoints
  app.get("/api/sw5e/species", async (req, res) => {
    try {
      const species = await SW5EData.getAllSpecies();
      res.json(species);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch species data" });
    }
  });

  app.get("/api/sw5e/classes", async (req, res) => {
    try {
      const classes = await SW5EData.getAllClasses();
      res.json(classes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch classes data" });
    }
  });

  app.get("/api/sw5e/backgrounds", async (req, res) => {
    try {
      const backgrounds = await SW5EData.getAllBackgrounds();
      res.json(backgrounds);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch backgrounds data" });
    }
  });

  app.get("/api/sw5e/powers/:type", async (req, res) => {
    try {
      const powers = await SW5EData.getPowersByType(req.params.type);
      res.json(powers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch powers data" });
    }
  });

  app.get("/api/sw5e/equipment", async (req, res) => {
    try {
      const equipment = await SW5EData.getAllEquipment();
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch equipment data" });
    }
  });

  app.get("/api/sw5e/npcs/:type", async (req, res) => {
    try {
      const npcs = await SW5EData.getNPCsByType(req.params.type);
      res.json(npcs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch NPCs" });
    }
  });

  app.post("/api/sw5e/npcs/generate", async (req, res) => {
    try {
      const { speciesId, backgroundId } = req.body;
      const npcStats = await SW5EData.generateNPCStats(speciesId, backgroundId);
      res.json(npcStats);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate NPC stats" });
    }
  });
  // All routes are prefixed with /api

  // Character endpoints
  app.get("/api/characters", async (req, res) => {
    try {
      // Validate that the characters table exists in the schema
      if (!characters) {
        console.error("Characters table not found in schema");
        return res.status(500).json({ message: "Database schema error: Characters table not defined" });
      }

      const allCharacters = await db.select().from(characters);
      res.json(allCharacters);
    } catch (error) {
      console.error("Error fetching characters:", error);
      // More detailed error information
      res.status(500).json({ 
        message: "Failed to fetch characters", 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
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
      const userData = { ...characterData, userId: 1 };

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

      // Validate the character data
      const characterData = insertCharacterSchema.parse(req.body);

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

  // Star Systems and Locations endpoints
  app.get("/api/star-systems", async (req, res) => {
    try {
      const allSystems = await db.select().from(starSystems);
      res.json(allSystems);
    } catch (error) {
      console.error("Error fetching star systems:", error);
      res.status(500).json({ message: "Failed to fetch star systems" });
    }
  });

  app.get("/api/star-systems/:id", async (req, res) => {
    try {
      const systemId = req.params.id;
      const system = await db
        .select()
        .from(starSystems)
        .where(eq(starSystems.id, systemId))
        .limit(1);

      if (!system || system.length === 0) {
        return res.status(404).json({ message: "Star system not found" });
      }

      res.json(system[0]);
    } catch (error) {
      console.error("Error fetching star system:", error);
      res.status(500).json({ message: "Failed to fetch star system" });
    }
  });

  app.get("/api/star-systems/:id/locations", async (req, res) => {
    try {
      const systemId = req.params.id;
      const locations = await db
        .select()
        .from(planets)
        .where(eq(planets.starSystem, systemId));

      res.json(locations);
    } catch (error) {
      console.error("Error fetching system locations:", error);
      res.status(500).json({ message: "Failed to fetch system locations" });
    }
  });

  // Campaign endpoints
  app.get("/api/campaigns", async (req, res) => {
    try {
      const allCampaigns = await db.select().from(campaigns);
      res.json(allCampaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
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

  app.put("/api/campaigns/:id", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);

      // Validate the campaign data
      const campaignData = insertCampaignSchema.parse(req.body);

      // Update campaign in database
      const result = await db
        .update(campaigns)
        .set({ ...campaignData, updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId))
        .returning();

      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error updating campaign:", error);

      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid campaign data",
          errors: formatError(error),
        });
      }

      res.status(500).json({ message: "Failed to update campaign" });
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

  return httpServer;
}