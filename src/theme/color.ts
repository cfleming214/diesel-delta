/** Mixes a #rrggbb color with transparency, matching CSS `color-mix(in srgb, c p%, transparent)`. */
export function alpha(hex: string, opacity: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`alpha() expects #rrggbb, got ${hex}`);
  const n = parseInt(m[1], 16);
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 1000) / 1000;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
