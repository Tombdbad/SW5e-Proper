
export interface FightingStyle {
  id: string;
  name: string;
  description: string;
  availableClasses: string[];
}

export const fightingStyles: FightingStyle[] = [
  {
    id: "dueling",
    name: "Dueling",
    description: "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
    availableClasses: ["fighter", "guardian"]
  }
];
