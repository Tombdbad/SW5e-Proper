import { create } from "zustand";

interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface Character {
  id: string;
  name: string;
  species: string;
  class: string;
  background: string;
  alignment: string;
  level: number;
  abilityScores: AbilityScores;
  maxHp: number;
  currentHp: number;
  maxForcePoints: number;
  currentForcePoints: number;
  armorClass: number;
  speed: number;
  equipment: string[];
  customItems?: any[];
  backstory?: string;
  startingLocation: string;
  notes?: string;
  experience: number;
  skillProficiencies: string[];
  savingThrowProficiencies: string[];
  credits: number;
}

interface CharacterState {
  character: Character | null;
  setCharacter: (character: Character) => void;
  updateCharacter: (updates: Partial<Character>) => void;
  initializeCharacter: (character: Character) => void;
  gainExperience: (amount: number) => void;
  levelUp: () => void;
  heal: (amount: number) => void;
  takeDamage: (amount: number) => void;
  spendForcePoints: (amount: number) => void;
  restoreForcePoints: (amount: number) => void;
  addItem: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  addCustomItem: (item: any) => void;
  removeCustomItem: (itemId: string) => void;
  updateNotes: (notes: string) => void;
  updateCredits: (amount: number) => void;
}

export const useCharacter = create<CharacterState>((set) => ({
  character: null,
  
  setCharacter: (character) => set({ character }),
  
  updateCharacter: (updates) => set((state) => ({
    character: state.character ? { ...state.character, ...updates } : null
  })),
  
  initializeCharacter: (character) => {
    // Initialize derived stats
    const conModifier = Math.floor((character.abilityScores.constitution - 10) / 2);
    
    // Calculate HP based on class and constitution
    let baseHp = 0;
    switch (character.class) {
      case "berserker":
      case "guardian":
        baseHp = 12; // d12 hit die
        break;
      case "fighter":
      case "sentinel":
        baseHp = 10; // d10 hit die
        break;
      case "monk":
      case "operative":
      case "scholar":
        baseHp = 8; // d8 hit die
        break;
      case "consular":
      case "engineer":
        baseHp = 6; // d6 hit die
        break;
      default:
        baseHp = 8; // default to d8
    }
    
    const maxHp = baseHp + conModifier;
    
    // Calculate force points based on class and wisdom
    const wisModifier = Math.floor((character.abilityScores.wisdom - 10) / 2);
    let maxForcePoints = 0;
    
    if (["consular", "guardian", "sentinel"].includes(character.class)) {
      maxForcePoints = Math.max(1, wisModifier); // Force users
    }
    
    // Calculate armor class
    const dexModifier = Math.floor((character.abilityScores.dexterity - 10) / 2);
    let armorClass = 10 + dexModifier;
    
    // Find armor items in equipment
    const hasArmor = character.equipment.some(item => 
      item.includes("armor") || item.includes("shield")
    );
    
    if (hasArmor) {
      armorClass += 2; // Simple bonus for having armor
    }
    
    // Set initial values
    const initializedCharacter = {
      ...character,
      maxHp,
      currentHp: maxHp,
      maxForcePoints,
      currentForcePoints: maxForcePoints,
      armorClass,
      speed: 30, // Default speed
      experience: 0,
      skillProficiencies: [],
      savingThrowProficiencies: [],
      credits: 1000, // Starting credits
    };
    
    set({ character: initializedCharacter });
  },
  
  gainExperience: (amount) => set((state) => {
    if (!state.character) return { character: null };
    
    const newExperience = state.character.experience + amount;
    return {
      character: {
        ...state.character,
        experience: newExperience
      }
    };
  }),
  
  levelUp: () => set((state) => {
    if (!state.character) return { character: null };
    
    // Calculate new stats based on level up
    const newLevel = state.character.level + 1;
    const conModifier = Math.floor((state.character.abilityScores.constitution - 10) / 2);
    
    // Simple HP increase on level up
    let hpIncrease = 0;
    switch (state.character.class) {
      case "berserker":
      case "guardian":
        hpIncrease = 7 + conModifier; // Average of d12
        break;
      case "fighter":
      case "sentinel":
        hpIncrease = 6 + conModifier; // Average of d10
        break;
      case "monk":
      case "operative":
      case "scholar":
        hpIncrease = 5 + conModifier; // Average of d8
        break;
      case "consular":
      case "engineer":
        hpIncrease = 4 + conModifier; // Average of d6
        break;
      default:
        hpIncrease = 5 + conModifier; // default
    }
    
    const newMaxHp = state.character.maxHp + Math.max(1, hpIncrease);
    
    // Force point increases for force users
    let forcePointIncrease = 0;
    if (["consular", "guardian", "sentinel"].includes(state.character.class)) {
      const wisModifier = Math.floor((state.character.abilityScores.wisdom - 10) / 2);
      forcePointIncrease = Math.max(1, wisModifier);
    }
    
    const newMaxForcePoints = state.character.maxForcePoints + forcePointIncrease;
    
    return {
      character: {
        ...state.character,
        level: newLevel,
        maxHp: newMaxHp,
        currentHp: newMaxHp, // Full heal on level up
        maxForcePoints: newMaxForcePoints,
        currentForcePoints: newMaxForcePoints // Full restore on level up
      }
    };
  }),
  
  heal: (amount) => set((state) => {
    if (!state.character) return { character: null };
    
    const newHp = Math.min(
      state.character.maxHp,
      state.character.currentHp + amount
    );
    
    return {
      character: {
        ...state.character,
        currentHp: newHp
      }
    };
  }),
  
  takeDamage: (amount) => set((state) => {
    if (!state.character) return { character: null };
    
    const newHp = Math.max(0, state.character.currentHp - amount);
    
    return {
      character: {
        ...state.character,
        currentHp: newHp
      }
    };
  }),
  
  spendForcePoints: (amount) => set((state) => {
    if (!state.character) return { character: null };
    
    const newForcePoints = Math.max(0, state.character.currentForcePoints - amount);
    
    return {
      character: {
        ...state.character,
        currentForcePoints: newForcePoints
      }
    };
  }),
  
  restoreForcePoints: (amount) => set((state) => {
    if (!state.character) return { character: null };
    
    const newForcePoints = Math.min(
      state.character.maxForcePoints,
      state.character.currentForcePoints + amount
    );
    
    return {
      character: {
        ...state.character,
        currentForcePoints: newForcePoints
      }
    };
  }),
  
  addItem: (itemId) => set((state) => {
    if (!state.character) return { character: null };
    
    return {
      character: {
        ...state.character,
        equipment: [...state.character.equipment, itemId]
      }
    };
  }),
  
  removeItem: (itemId) => set((state) => {
    if (!state.character) return { character: null };
    
    return {
      character: {
        ...state.character,
        equipment: state.character.equipment.filter(id => id !== itemId)
      }
    };
  }),
  
  addCustomItem: (item) => set((state) => {
    if (!state.character) return { character: null };
    
    return {
      character: {
        ...state.character,
        customItems: [...(state.character.customItems || []), item]
      }
    };
  }),
  
  removeCustomItem: (itemId) => set((state) => {
    if (!state.character) return { character: null };
    
    return {
      character: {
        ...state.character,
        customItems: (state.character.customItems || []).filter(item => item.id !== itemId)
      }
    };
  }),
  
  updateNotes: (notes) => set((state) => {
    if (!state.character) return { character: null };
    
    return {
      character: {
        ...state.character,
        notes
      }
    };
  }),
  
  updateCredits: (amount) => set((state) => {
    if (!state.character) return { character: null };
    
    return {
      character: {
        ...state.character,
        credits: state.character.credits + amount
      }
    };
  })
}));
