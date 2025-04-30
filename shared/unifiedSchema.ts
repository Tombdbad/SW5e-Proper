import { z } from 'zod'; // Make sure to import zod or the appropriate library
export const MulticlassSchema = z.object({
  class: z.string(),
  level: z.number().min(1).max(19),
  archetype: z.string().optional(),
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).optional().default([]),
});

export const CharacterSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  level: z.number().min(1).max(20).default(1),
  species: z.string(),
  class: z.string(),
  multiclass: z.array(MulticlassSchema).optional().default([]),
  background: z.string(),
});