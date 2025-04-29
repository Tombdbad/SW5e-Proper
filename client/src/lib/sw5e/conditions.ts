
// Conditions data for SW5E
export interface Condition {
  id: string;
  name: string;
  description: string;
  effects: string[];
}

export const conditions: Condition[] = [
  {
    id: "blinded",
    name: "Blinded",
    description: "A blinded creature can't see and automatically fails any ability check that requires sight.",
    effects: [
      "Automatically fails any ability check that requires sight",
      "Attack rolls against the creature have advantage",
      "The creature's attack rolls have disadvantage"
    ]
  }
  // Add more conditions as needed
];
