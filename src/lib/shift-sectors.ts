export const SECTORS = {
  cocina: { label: "Cocina", color: "#2fa64f" },
  caja: { label: "Caja", color: "#9ca3af" },
  apoyo: { label: "Apoyo", color: "#e78fa0" },
  cafeteria: { label: "Cafetería", color: "#3b82f6" },
  salon: { label: "Salón", color: "#f59e0b" },
} as const;
export type Sector = keyof typeof SECTORS;

export function sectorFromRgb(r: number, g: number, b: number): Sector | undefined {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (max < 90 || min > 235) return;
  if (delta < 22) return max >= 140 && max <= 225 ? "caja" : undefined;
  const hue = ((max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta) * 60 + 360) % 360;
  if (hue >= 85 && hue <= 170) return "cocina";
  if (hue >= 185 && hue <= 250) return "cafeteria";
  if ((hue >= 315 || hue < 18) && r > 150 && b > 90) return "apoyo";
  if (hue >= 20 && hue < 51) return "salon";
  // Yellow francs, white cells and purple table headings have no sector.
}
