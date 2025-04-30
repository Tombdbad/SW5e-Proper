import { create } from "zustand";

// Simple UUID generator function
const generateId = (): string => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export type CharacterClass =
  | "berserker"
  | "guardian"
  | "fighter"
  | "sentinel"
  | "consular"
  | "scout"
  | "engineer"
  | "scoundrel";
export type SpeciesType =
  | "human"
  | "twilek"
  | "wookiee"
  | "rodian"
  | "trandoshan"
  | "zabrak"
  | "other";
export type BackgroundType =
  | "soldier"
  | "pilot"
  | "criminal"
  | "noble"
  | "jedi"
  | "sith"
  | "bounty hunter"
  | "smuggler"
  | "other";

export interface Character {
  id: string;
  name: string;
  species: SpeciesType | string;
  class: CharacterClass | string;
  background: BackgroundType | string;
  level: number;
  experience: number;
  abilityScores: AbilityScores;
  maxHp: number;
  currentHp: number;
  temporaryHp: number;
  maxForcePoints: number;
  currentForcePoints: number;
  armorClass: number;
  speed: number;
  equipment: Array<{
    id: string;
    name: string;
    type: string;
    quantity: number;
    weight?: number;
    description?: string;
  }>;
  credits: number;
  skills: Record<string, number>;
  proficiencies: string[];
  biography: {
    age?: number;
    height?: string;
    weight?: string;
    alignment?: string;
    appearance?: string;
    backstory?: string;
  };
  forceAbilities: string[];
  statusEffects: Array<{
    id: string;
    name: string;
    duration: number;
    effect: string;
  }>;
}

interface CharacterState {
  character: Character | null;
  characters: Character[];
  errors: Record<string, string>;
  loadingState: "idle" | "loading" | "success" | "error";
  setCharacter: (character: Character) => void;
  updateCharacter: (updates: Partial<Character>) => void;
  resetCharacter: () => void;
  initializeNewCharacter: () => void;
  calculateDerivedStats: () => void;
  validateCharacter: (step: number) => Record<string, string>;
  saveCharacter: () => void;
  loadCharacters: () => void;
  deleteCharacter: (id: string) => void;
  addEquipment: (item: {
    name: string;
    type: string;
    quantity: number;
  }) => void;
  removeEquipment: (itemId: string) => void;
  updateEquipment: (
    itemId: string,
    updates: Partial<{ name: string; quantity: number; type: string }>,
  ) => void;
  applyStatusEffect: (effect: {
    name: string;
    duration: number;
    effect: string;
  }) => void;
  removeStatusEffect: (effectId: string) => void;
  restCharacter: (type: "short" | "long") => void;
  levelUp: () => void;
  calculateModifier: (abilityScore: number) => number;
  getAbilityModifiers: () => Record<keyof AbilityScores, number>;
  addExperience: (amount: number) => void;
}

const getBaseHp = (characterClass: string): number => {
  switch (characterClass) {
    case "berserker":
    case "guardian":
      return 12;
    case "fighter":
    case "sentinel":
      return 10;
    case "scout":
    case "engineer":
      return 8;
    case "consular":
    case "scoundrel":
      return 6;
    default:
      return 8;
  }
};

const calculateExpForNextLevel = (currentLevel: number): number => {
  return currentLevel * 1000;
};

const initialCharacter: Character = {
  id: "",
  name: "",
  species: "",
  class: "",
  background: "",
  level: 1,
  experience: 0,
  abilityScores: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  maxHp: 0,
  currentHp: 0,
  temporaryHp: 0,
  maxForcePoints: 0,
  currentForcePoints: 0,
  armorClass: 10,
  speed: 30,
  equipment: [],
  credits: 1000,
  skills: {
    acrobatics: 0,
    athletics: 0,
    deception: 0,
    insight: 0,
    intimidation: 0,
    investigation: 0,
    lore: 0,
    medicine: 0,
    perception: 0,
    performance: 0,
    persuasion: 0,
    piloting: 0,
    stealth: 0,
    survival: 0,
    technology: 0,
  },
  proficiencies: [],
  biography: {},
  forceAbilities: [],
  statusEffects: [],
};

export const useCharacter = create<CharacterState>((set, get) => ({
  character: null,
  characters: [],
  errors: {},
  loadingState: "idle",

  setCharacter: (character) => set({ character }),

  updateCharacter: (updates) =>
    set((state) => ({
      character: state.character ? { ...state.character, ...updates } : null,
    })),

  resetCharacter: () => set({ character: null, errors: {} }),

  initializeNewCharacter: () => {
    const newChar = {
      ...initialCharacter,
      id: generateId(),
    };
    set({ character: newChar, errors: {} });
  },

  calculateDerivedStats: () => {
    const { character, calculateModifier } = get();
    if (!character) return;

    // Get modifiers
    const conModifier = calculateModifier(character.abilityScores.constitution);
    const dexModifier = calculateModifier(character.abilityScores.dexterity);
    const wisModifier = calculateModifier(character.abilityScores.wisdom);

    // Calculate base HP
    const baseHp = getBaseHp(character.class);
    const levelBonusHp = (character.level - 1) * (baseHp / 2 + conModifier);
    const maxHp = Math.max(1, baseHp + conModifier + Math.floor(levelBonusHp));

    // Calculate armor class
    const armorClass = 10 + dexModifier;

    // Calculate force points
    const isForceSensitive = ["consular", "guardian", "sentinel"].includes(
      character.class,
    );
    const maxForcePoints = isForceSensitive
      ? Math.max(1, character.level + wisModifier)
      : 0;

    // Calculate speed based on species
    let speed = 30;
    if (character.species === "wookiee") speed = 35;
    else if (character.species === "rodian") speed = 35;
    else if (character.species === "trandoshan") speed = 30;

    set({
      character: {
        ...character,
        maxHp,
        currentHp: character.currentHp || maxHp, // Only reset if not set
        armorClass,
        maxForcePoints,
        currentForcePoints: character.currentForcePoints || maxForcePoints, // Only reset if not set
        speed,
      },
    });
  },

  validateCharacter: (step: number) => {
    const { character } = get();
    const errors: Record<string, string> = {};

    if (!character) {
      errors.general = "Character data is missing";
      return errors;
    }

    switch (step) {
      case 0: // Basic Info
        if (!character.name) errors.name = "Name is required";
        if (!character.species) errors.species = "Species is required";
        break;
      case 1: // Class
        if (!character.class) errors.class = "Class is required";
        break;
      case 2: // Abilities
        Object.entries(character.abilityScores).forEach(([ability, score]) => {
          if (score < 3 || score > 18) {
            errors[ability] = "Score must be between 3 and 18";
          }
        });
        // Check if total points are within allowed range (typically 27 points for point-buy)
        const totalPoints = Object.values(character.abilityScores).reduce(
          (sum, score) => sum + score,
          0,
        );
        if (totalPoints > 75) {
          errors.totalPoints =
            "Total ability score points exceed maximum allowed";
        }
        break;
      case 3: // Background
        if (!character.background) errors.background = "Background is required";
        break;
      case 4: // Equipment
        // No strict requirements but could validate starting equipment
        break;
    }

    set({ errors });
    return errors;
  },

  saveCharacter: () => {
    const { character, characters } = get();
    if (!character) return;

    set({ loadingState: "loading" });

    try {
      // Save to local storage
      const updatedCharacters = [...characters];
      const existingIndex = updatedCharacters.findIndex(
        (c) => c.id === character.id,
      );

      if (existingIndex >= 0) {
        updatedCharacters[existingIndex] = { ...character };
      } else {
        updatedCharacters.push({ ...character });
      }

      localStorage.setItem(
        "sw-rpg-characters",
        JSON.stringify(updatedCharacters),
      );
      set({ characters: updatedCharacters, loadingState: "success" });
    } catch (error) {
      console.error("Failed to save character:", error);
      set({
        loadingState: "error",
        errors: { save: "Failed to save character" },
      });
    }
  },

  loadCharacters: () => {
    set({ loadingState: "loading" });

    try {
      const savedCharacters = localStorage.getItem("sw-rpg-characters");
      if (savedCharacters) {
        const parsedCharacters = JSON.parse(savedCharacters) as Character[];
        set({ characters: parsedCharacters, loadingState: "success" });
      } else {
        set({ characters: [], loadingState: "success" });
      }
    } catch (error) {
      console.error("Failed to load characters:", error);
      set({
        characters: [],
        loadingState: "error",
        errors: { load: "Failed to load characters" },
      });
    }
  },

  deleteCharacter: (id: string) => {
    const { characters } = get();
    const updatedCharacters = characters.filter((c) => c.id !== id);

    try {
      localStorage.setItem(
        "sw-rpg-characters",
        JSON.stringify(updatedCharacters),
      );
      set({ characters: updatedCharacters });

      // Reset current character if it was deleted
      const { character } = get();
      if (character && character.id === id) {
        set({ character: null });
      }
    } catch (error) {
      console.error("Failed to delete character:", error);
      set({ errors: { delete: "Failed to delete character" } });
    }
  },

  addEquipment: (item) => {
    const { character } = get();
    if (!character) return;

    const newItem = {
      id: generateId(),
      ...item,
    };

    set((state) => ({
      character: state.character
        ? {
            ...state.character,
            equipment: [...state.character.equipment, newItem],
          }
        : null,
    }));
  },

  removeEquipment: (itemId: string) => {
    const { character } = get();
    if (!character) return;

    set((state) => ({
      character: state.character
        ? {
            ...state.character,
            equipment: state.character.equipment.filter(
              (item) => item.id !== itemId,
            ),
          }
        : null,
    }));
  },

  updateEquipment: (itemId: string, updates) => {
    const { character } = get();
    if (!character) return;

    set((state) => {
      if (!state.character) return { character: null };

      const updatedEquipment = state.character.equipment.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item,
      );

      return {
        character: {
          ...state.character,
          equipment: updatedEquipment,
        },
      };
    });
  },

  applyStatusEffect: (effect) => {
    const { character } = get();
    if (!character) return;

    const newEffect = {
      id: generateId(),
      ...effect,
    };

    set((state) => ({
      character: state.character
        ? {
            ...state.character,
            statusEffects: [...state.character.statusEffects, newEffect],
          }
        : null,
    }));
  },

  removeStatusEffect: (effectId: string) => {
    const { character } = get();
    if (!character) return;

    set((state) => ({
      character: state.character
        ? {
            ...state.character,
            statusEffects: state.character.statusEffects.filter(
              (effect) => effect.id !== effectId,
            ),
          }
        : null,
    }));
  },

  restCharacter: (type: "short" | "long") => {
    const { character, calculateModifier } = get();
    if (!character) return;

    if (type === "short") {
      const conModifier = calculateModifier(
        character.abilityScores.constitution,
      );
      const recoveredHp = Math.max(1, character.level + conModifier);
      const newHp = Math.min(
        character.maxHp,
        character.currentHp + recoveredHp,
      );

      let newForcePoints = character.currentForcePoints;

      // Force users recover some force points
      if (["consular", "guardian", "sentinel"].includes(character.class)) {
        const wisModifier = calculateModifier(character.abilityScores.wisdom);
        const recoveredFp = Math.max(1, wisModifier);
        newForcePoints = Math.min(
          character.maxForcePoints,
          character.currentForcePoints + recoveredFp,
        );
      }

      set((state) => ({
        character: state.character
          ? {
              ...state.character,
              currentHp: newHp,
              currentForcePoints: newForcePoints,
            }
          : null,
      }));
    } else if (type === "long") {
      // Long rest recovers all HP and force points
      set((state) => ({
        character: state.character
          ? {
              ...state.character,
              currentHp: state.character.maxHp,
              currentForcePoints: state.character.maxForcePoints,
              temporaryHp: 0,
              // Remove time-based status effects
              statusEffects: state.character.statusEffects.filter(
                (effect) => effect.duration === -1, // Keep permanent effects
              ),
            }
          : null,
      }));
    }
  },

  calculateModifier: (abilityScore: number) => {
    return Math.floor((abilityScore - 10) / 2);
  },

  getAbilityModifiers: () => {
    const { character, calculateModifier } = get();
    if (!character) return {} as Record<keyof AbilityScores, number>;

    return {
      strength: calculateModifier(character.abilityScores.strength),
      dexterity: calculateModifier(character.abilityScores.dexterity),
      constitution: calculateModifier(character.abilityScores.constitution),
      intelligence: calculateModifier(character.abilityScores.intelligence),
      wisdom: calculateModifier(character.abilityScores.wisdom),
      charisma: calculateModifier(character.abilityScores.charisma),
    };
  },

  levelUp: () => {
    const { character, calculateModifier } = get();
    if (!character || character.level >= 20) return;

    const conModifier = calculateModifier(character.abilityScores.constitution);
    const baseHp = getBaseHp(character.class);
    const hpIncrease = Math.max(1, Math.floor(baseHp / 2) + conModifier);
    const newLevel = character.level + 1;

    let newMaxForcePoints = character.maxForcePoints;

    // Update force points for force users
    if (["consular", "guardian", "sentinel"].includes(character.class)) {
      const wisModifier = calculateModifier(character.abilityScores.wisdom);
      newMaxForcePoints = Math.max(1, newLevel + wisModifier);
    }

    set((state) => ({
      character: state.character
        ? {
            ...state.character,
            level: newLevel,
            maxHp: state.character.maxHp + hpIncrease,
            currentHp: state.character.currentHp + hpIncrease,
            maxForcePoints: newMaxForcePoints,
            currentForcePoints: newMaxForcePoints,
            experience:
              state.character.experience -
              calculateExpForNextLevel(state.character.level - 1),
          }
        : null,
    }));
  },

  addExperience: (amount: number) => {
    const { character, levelUp } = get();
    if (!character) return;

    const newExp = character.experience + amount;
    const expForNextLevel = calculateExpForNextLevel(character.level);

    set((state) => ({
      character: state.character
        ? {
            ...state.character,
            experience: newExp,
          }
        : null,
    }));

    // Check if character can level up
    if (newExp >= expForNextLevel) {
      levelUp();
    }
  },
}));