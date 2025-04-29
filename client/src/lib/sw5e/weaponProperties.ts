
export interface WeaponProperty {
  id: string;
  name: string;
  description: string;
}

export const weaponProperties: WeaponProperty[] = [
  {
    id: "burst",
    name: "Burst",
    description: "When you use this weapon to make a ranged attack, you can use your bonus action to make another ranged attack with this weapon against the same target."
  },
  {
    id: "defensive",
    name: "Defensive",
    description: "While wielding this weapon, you gain a +1 bonus to your AC."
  }
];
