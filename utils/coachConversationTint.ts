// Derives a stable per-conversation tint from the persona's haloTint by
// rotating the hue with an id-keyed offset. Two conversations with the same
// coach still get visually distinguishable backgrounds while keeping the
// persona's identity recognisable.

function hashConversationId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [(h * 60 + 360) % 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Thirteen offsets spread across the full hue circle so adjacent buckets are
// clearly distinguishable at a glance. One slot keeps the persona's exact hue
// (the "identity" bucket); all other slots rotate noticeably so two threads
// with the same coach can be told apart from across the inbox.
const HUE_OFFSETS = [
  0,
  30, -30,
  60, -60,
  90, -90,
  120, -120,
  150, -150,
  180,
];

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export function getCoachConversationTint(
  conversationId: string,
  baseTint: string,
): string {
  const rgb = parseHex(baseTint);
  if (!rgb) return baseTint;
  const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const offset = HUE_OFFSETS[hashConversationId(conversationId) % HUE_OFFSETS.length];
  if (offset === 0) {
    // Identity bucket: keep the canonical persona haloTint untouched so one
    // conversation per persona still reads as the "true" coach colour.
    return baseTint;
  }
  // Accentuate the rotated hue: push saturation up (with a hard floor so even
  // the muted slate of `strict_tough` lands somewhere vivid) and clamp
  // lightness to a mid-range band so the halo stays readable on both light
  // and dark canvases.
  const accentSaturation = clamp01(Math.max(s + 0.28, 0.6));
  const accentLightness = Math.min(Math.max(l, 0.52), 0.7);
  return hslToHex(h + offset, accentSaturation, accentLightness);
}
