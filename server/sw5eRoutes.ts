import express from "express";
import { z } from "zod";
import { eq, like, and, desc, asc } from "drizzle-orm";
import { db } from "../db";
import {
  species,
  classes,
  backgrounds,
  powers,
  equipment,
  feats,
  characters,
} from "../../shared/schema";
import { authenticateUser } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validation";

const router = express.Router();

// Helper function for pagination
const paginateResults = async <T>(
  query: any,
  page: number = 1,
  pageSize: number = 20,
): Promise<{
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> => {
  // Get total count
  const countQuery = await db.select({ count: db.fn.count() }).from(query);
  const total = Number(countQuery[0].count);

  // Calculate pagination
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;

  // Get paginated data
  const data = await query.limit(pageSize).offset(offset);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
  };
};

// Validate pagination parameters
const paginationSchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().optional(),
});

// Get all species
router.get("/species", async (req, res) => {
  try {
    const allSpecies = await db.select().from(species);
    res.json(allSpecies);
  } catch (error) {
    console.error("Error fetching species:", error);
    res.status(500).json({ message: "Failed to fetch species data" });
  }
});

// Get all classes
router.get("/classes", async (req, res) => {
  try {
    const allClasses = await db.select().from(classes);
    res.json(allClasses);
  } catch (error) {
    console.error("Error fetching classes:", error);
    res.status(500).json({ message: "Failed to fetch classes data" });
  }
});

// Get a specific class by ID
router.get("/classes/:id", async (req, res) => {
  try {
    const classId = req.params.id;
    const classData = await db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (classData.length === 0) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json(classData[0]);
  } catch (error) {
    console.error("Error fetching class:", error);
    res.status(500).json({ message: "Failed to fetch class data" });
  }
});

// Get all backgrounds
router.get("/backgrounds", async (req, res) => {
  try {
    const allBackgrounds = await db.select().from(backgrounds);
    res.json(allBackgrounds);
  } catch (error) {
    console.error("Error fetching backgrounds:", error);
    res.status(500).json({ message: "Failed to fetch backgrounds data" });
  }
});

// Get powers with optional type filter
router.get("/powers/:type?", async (req, res) => {
  try {
    const powerType = req.params.type;

    let query = db.select().from(powers);

    // Filter by power type if specified
    if (powerType && ["force", "tech"].includes(powerType.toLowerCase())) {
      query = query.where(
        eq(
          powers.powerType,
          powerType.toLowerCase() === "force" ? "Force" : "Tech",
        ),
      );
    }

    const allPowers = await query;
    res.json(allPowers);
  } catch (error) {
    console.error("Error fetching powers:", error);
    res.status(500).json({ message: "Failed to fetch powers data" });
  }
});

// Get equipment with pagination and search
router.get("/equipment", async (req, res) => {
  try {
    const validation = paginationSchema.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid pagination parameters",
        errors: validation.error.format(),
      });
    }

    const { page, pageSize, sortBy, sortOrder, search } = validation.data;

    let query = db.select().from(equipment);

    // Apply search filter if provided
    if (search) {
      query = query.where(like(equipment.name, `%${search}%`));
    }

    // Apply sorting
    if (sortBy) {
      const column = equipment[sortBy as keyof typeof equipment];
      if (column) {
        query = query.orderBy(sortOrder === "asc" ? asc(column) : desc(column));
      }
    } else {
      // Default sort by name
      query = query.orderBy(asc(equipment.name));
    }

    // Apply pagination
    const paginatedResults = await paginateResults(query, page, pageSize);

    res.json(paginatedResults);
  } catch (error) {
    console.error("Error fetching equipment:", error);
    res.status(500).json({ message: "Failed to fetch equipment data" });
  }
});

// Get all feats
router.get("/feats", async (req, res) => {
  try {
    const allFeats = await db.select().from(feats);
    res.json(allFeats);
  } catch (error) {
    console.error("Error fetching feats:", error);
    res.status(500).json({ message: "Failed to fetch feats data" });
  }
});

// Character routes requiring authentication
router.use(authenticateUser);

// Get all characters for the current user
router.get("/characters", async (req, res) => {
  try {
    const userId = req.user.id;

    const userCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.userId, userId))
      .orderBy(desc(characters.updatedAt));

    res.json(userCharacters);
  } catch (error) {
    console.error("Error fetching user characters:", error);
    res.status(500).json({ message: "Failed to fetch characters" });
  }
});

// Get a specific character
router.get("/character/:id", async (req, res) => {
  try {
    const characterId = req.params.id;
    const userId = req.user.id;

    const characterData = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.userId, userId)))
      .limit(1);

    if (characterData.length === 0) {
      return res.status(404).json({ message: "Character not found" });
    }

    res.json(characterData[0]);
  } catch (error) {
    console.error("Error fetching character:", error);
    res.status(500).json({ message: "Failed to fetch character data" });
  }
});

// Character validation schema
const characterSchema = z.object({
  name: z.string().min(1).max(100),
  species: z.string().min(1),
  class: z.string().min(1),
  level: z.number().int().min(1).max(20),
  background: z.string().min(1),
  alignment: z.string().min(1),
  experiencePoints: z.number().int().min(0),
  abilities: z.record(z.number().int().min(1).max(20)),
  skills: z.record(z.boolean()),
  hitPoints: z.object({
    current: z.number().int().min(0),
    maximum: z.number().int().min(1),
  }),
  equipment: z.array(z.string()),
  powers: z.array(z.string()),
  feats: z.array(z.string()),
  credits: z.number().int().min(0),
  biography: z.string().optional(),
  appearance: z.string().optional(),
});

// Create a new character
router.post(
  "/character",
  handleValidationErrors(characterSchema),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const characterData = req.body;

      const newCharacter = await db
        .insert(characters)
        .values({
          ...characterData,
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json(newCharacter[0]);
    } catch (error) {
      console.error("Error creating character:", error);
      res.status(500).json({ message: "Failed to create character" });
    }
  },
);

// Update a character
router.put(
  "/character/:id",
  handleValidationErrors(characterSchema.partial()),
  async (req, res) => {
    try {
      const characterId = req.params.id;
      const userId = req.user.id;
      const updates = req.body;

      // Check if character exists and belongs to user
      const existingCharacter = await db
        .select()
        .from(characters)
        .where(
          and(eq(characters.id, characterId), eq(characters.userId, userId)),
        )
        .limit(1);

      if (existingCharacter.length === 0) {
        return res.status(404).json({ message: "Character not found" });
      }

      // Update character
      const updatedCharacter = await db
        .update(characters)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, characterId))
        .returning();

      res.json(updatedCharacter[0]);
    } catch (error) {
      console.error("Error updating character:", error);
      res.status(500).json({ message: "Failed to update character" });
    }
  },
);

// Delete a character
router.delete("/character/:id", async (req, res) => {
  try {
    const characterId = req.params.id;
    const userId = req.user.id;

    // Check if character exists and belongs to user
    const existingCharacter = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.userId, userId)))
      .limit(1);

    if (existingCharacter.length === 0) {
      return res.status(404).json({ message: "Character not found" });
    }

    // Delete character
    await db.delete(characters).where(eq(characters.id, characterId));

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting character:", error);
    res.status(500).json({ message: "Failed to delete character" });
  }
});

export default router;
