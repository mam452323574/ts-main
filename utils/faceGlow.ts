type FaceGlowMetrics = {
  glow?: unknown;
  glowScore?: unknown;
} | null | undefined;

type FaceGlowSource = {
  glow_index?: unknown;
  energy_score?: unknown;
  glowScore?: unknown;
  glow_score?: unknown;
  glow?: unknown;
  metrics?: FaceGlowMetrics;
} | null | undefined;

function toFiniteNumber(value: unknown): number | null {
  if (value === null || typeof value === 'undefined' || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

export function resolveFaceGlowScore(source: FaceGlowSource): number | null {
  if (!source || typeof source !== 'object') {
    return null;
  }

  // Priorité absolue à glow_index (nouvelle norme du backend),
  // puis fallback sur les anciennes variantes (backward-compatibility).
  const candidates = [
    source.glow_index,
    source.glowScore,
    source.glow_score,
    source.glow,
    source.energy_score,
    source.metrics?.glow,
    source.metrics?.glowScore,
  ];

  for (const candidate of candidates) {
    const resolvedValue = toFiniteNumber(candidate);
    if (resolvedValue !== null) {
      return resolvedValue;
    }
  }

  return null;
}
