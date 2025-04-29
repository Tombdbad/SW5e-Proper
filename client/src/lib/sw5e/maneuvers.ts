
// Maneuvers data for SW5E
export interface Maneuver {
  id: string;
  name: string;
  type: "Attack" | "Defense" | "Strategy" | "Utility";
  discipline: string;
  prerequisite?: string;
  description: string;
  actionType: "Action" | "Bonus Action" | "Reaction" | "Special";
}

export const maneuvers: Maneuver[] = [
  {
    id: "tactical_assessment",
    name: "Tactical Assessment",
    type: "Strategy",
    discipline: "Tactical",
    description: "When you make an Intelligence (Investigation) check to assess a tactical situation, you can expend one superiority die and add it to the check.",
    actionType: "Action"
  },
  {
    id: "disarming_attack",
    name: "Disarming Attack",
    type: "Attack",
    discipline: "Assault",
    description: "When you hit a creature with a weapon attack, you can expend one superiority die to attempt to disarm the target.",
    actionType: "Special"
  },
  // Add more maneuvers as needed
];
