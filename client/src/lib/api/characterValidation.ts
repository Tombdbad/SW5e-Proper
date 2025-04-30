
import { CharacterData } from "../../pages/CharacterCreation";
import { CLASSES } from "../sw5e/classes";
import { FORCE_POWERS } from "../sw5e/forcePowers";
import { TECH_POWERS } from "../sw5e/techPowers";

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Validate character data before submission
export const validateCharacter = async (
  characterData: CharacterData
): Promise<ValidationResult> => {
  const errors: ValidationError[] = [];

  // Required fields validation
  if (!characterData.name || characterData.name.trim() === "") {
    errors.push({
      field: "name",
      message: "Character name is required",
    });
  }

  if (!characterData.species || characterData.species.trim() === "") {
    errors.push({
      field: "species",
      message: "Species selection is required",
    });
  }

  if (!characterData.class || characterData.class.trim() === "") {
    errors.push({
      field: "class",
      message: "Class selection is required",
    });
  }

  // Class-specific validations
  const selectedClass = CLASSES.find((c) => c.id === characterData.class);
  if (selectedClass) {
    // Validate skill proficiencies
    const requiredSkillCount = selectedClass.numSkillChoices || 0;
    if (
      characterData.skillProficiencies.length < requiredSkillCount &&
      requiredSkillCount > 0
    ) {
      errors.push({
        field: "skillProficiencies",
        message: `You must select ${requiredSkillCount} skills from your class options`,
      });
    }

    // Validate force powers for force users
    if (
      selectedClass.spellcasting &&
      selectedClass.spellcasting.type === "Force" &&
      characterData.forcePowers.length === 0
    ) {
      errors.push({
        field: "forcePowers",
        message: `${selectedClass.name} requires selection of Force powers`,
      });
    }

    // Validate tech powers for tech users
    if (
      selectedClass.spellcasting &&
      selectedClass.spellcasting.type === "Tech" &&
      characterData.techPowers.length === 0
    ) {
      errors.push({
        field: "techPowers",
        message: `${selectedClass.name} requires selection of Tech powers`,
      });
    }
  }

  // Multiclass validation
  if (characterData.multiclass && characterData.multiclass.length > 0) {
    for (const multiclass of characterData.multiclass) {
      if (!multiclass.class || multiclass.class.trim() === "") {
        errors.push({
          field: "multiclass",
          message: "Multiclass selection is required",
        });
      }

      if (multiclass.level < 1) {
        errors.push({
          field: "multiclass",
          message: "Multiclass level must be at least 1",
        });
      }
    }
  }

  // Return validation result
  return {
    valid: errors.length === 0,
    errors,
  };
};

// Middleware-compatible validation function for server use
export const validateCharacterRequest = (
  req: any,
  res: any,
  next: any
): void => {
  const characterData = req.body;
  validateCharacter(characterData)
    .then((result) => {
      if (result.valid) {
        next();
      } else {
        res.status(400).json({
          error: "Character validation failed",
          details: result.errors,
        });
      }
    })
    .catch((error) => {
      res.status(500).json({
        error: "Validation error",
        message: error.message,
      });
    });
};

export default {
  validateCharacter,
  validateCharacterRequest,
};
