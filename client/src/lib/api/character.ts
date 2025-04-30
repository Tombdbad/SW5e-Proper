import { validateCharacter } from "./characterValidation";
import type { CharacterData } from "../../pages/CharacterCreation";

// Character API service
export const CharacterAPI = {
  async saveCharacter(characterData: CharacterData): Promise<any> {
    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(characterData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save character");
      }

      return await response.json();
    } catch (error) {
      console.error("Error saving character:", error);
      throw error;
    }
  },

  async getCharacter(characterId: string): Promise<any> {
    try {
      const response = await fetch(`/api/characters/${characterId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch character");
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching character:", error);
      throw error;
    }
  },

  async updateCharacter(characterId: string, characterData: Partial<CharacterData>): Promise<any> {
    try {
      const response = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(characterData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update character");
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating character:", error);
      throw error;
    }
  },

  async deleteCharacter(characterId: string): Promise<void> {
    try {
      const response = await fetch(`/api/characters/${characterId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete character");
      }
    } catch (error) {
      console.error("Error deleting character:", error);
      throw error;
    }
  },

  async validateCharacter(characterData: CharacterData): Promise<any> {
    // This can either call the server validation or use the local validation
    try {
      // For quicker testing, use local validation
      return await validateCharacter(characterData);

      // For production, you might want to use server validation
      /*
      const response = await fetch("/api/characters/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(characterData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Validation failed");
      }

      return await response.json();
      */
    } catch (error) {
      console.error("Error validating character:", error);
      throw error;
    }
  },

  async getCharacters(): Promise<any[]> {
    try {
      const response = await fetch("/api/characters");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch characters");
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching characters:", error);
      throw error;
    }
  }
};