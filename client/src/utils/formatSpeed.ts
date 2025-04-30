// src/utils/formatSpeed.ts

export type Speed = number | Record<string, number>;

export function formatSpeed(speed: Speed): string {
  if (typeof speed === "number") {
    return `${speed} ft.`;
  }

  return Object.entries(speed)
    .map(([type, value]) => `${type}: ${value} ft.`)
    .join(", ");
}
