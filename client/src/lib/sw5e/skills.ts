
// Skills data for SW5E
export interface Skill {
  id: string;
  name: string;
  ability: string;
  description: string;
  examples: string[];
}

export const skills: Skill[] = [
  {
    id: "athletics",
    name: "Athletics",
    ability: "strength",
    description: "Your Athletics check covers difficult situations you encounter while climbing, jumping, or swimming.",
    examples: ["Climbing a steep cliff", "Jumping across a chasm", "Swimming against a strong current"]
  },
  {
    id: "technology",
    name: "Technology",
    ability: "intelligence",
    description: "Your Technology check measures your ability to understand and interact with technology.",
    examples: ["Slicing a computer system", "Repairing a droid", "Understanding alien tech"]
  }
  // Add more skills as needed
];
