
import { CharacterData } from "../../pages/CharacterCreation";
import { getClassById, getPowerProgression } from "../sw5e/classes";
import { getBackgroundById } from "../sw5e/backgrounds";

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

  // Class and background choices
  const selectedClass = getClassById(characterData.class);
  if (selectedClass) {
    const background = getBackgroundById(characterData.background);
    const classSkills = selectedClass.numSkillChoices;
    const backgroundSkills = background?.numSkillChoices ?? 0;
    if ((characterData.skillProficiencies ?? []).length < classSkills + backgroundSkills) {
      errors.push({
        field: "skillProficiencies",
        message: `Choose ${classSkills} class skills and ${backgroundSkills} background skills (Skills step)`,
      });
    }

    if (background && background.featOptions.length > 0 && (characterData.feats ?? []).length === 0) {
      errors.push({
        field: "feats",
        message: `Choose the feat your ${background.name} background grants (Feats step)`,
      });
    }

    // Casters know powers from 1st level (scouts from 2nd)
    const progression = getPowerProgression(selectedClass.id, Number(characterData.level) || 1);
    const known = progression.type === "Force" ? characterData.forcePowers : characterData.techPowers;
    if (progression.powersKnown > 0 && (known ?? []).length === 0) {
      errors.push({
        field: progression.type === "Force" ? "forcePowers" : "techPowers",
        message: `${selectedClass.name} knows ${progression.powersKnown} ${progression.type.toLowerCase()} powers at this level: choose at least one (Powers step)`,
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
