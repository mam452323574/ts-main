import { normalizeResultCatalogKey } from '@/utils/resultLocalization';

export const RESULT_SCAN_ICON_TOKENS = ['face', 'body', 'nutrition'] as const;

export type ResultScanIconToken = (typeof RESULT_SCAN_ICON_TOKENS)[number];

export const RESULT_METRIC_ICON_TOKENS = [
  'perceived_age',
  'face_shape',
  'symmetry',
  'fatigue',
  'hydration',
  'photogenic',
  'skin_quality',
  'glow',
  'collagen',
  'body_type',
  'muscle_mass',
  'waist',
  'strength',
  'bmi',
  'metabolic_age',
  'body_fat',
  'posture',
  'body_symmetry',
  'calories',
  'verdict',
  'satiety',
  'ingredients',
  'glycemic',
  'vitamins',
  'proteins',
  'carbs',
  'fats',
] as const;

export type ResultMetricIconToken = (typeof RESULT_METRIC_ICON_TOKENS)[number];

export const RESULT_SUPER_CATEGORY_ICON_TOKENS = [
  'unknown',
  'general',
  'inflammation',
  'metabolic',
  'skin',
  'posture',
  'nutrition',
  'recovery',
  'cardiovascular',
] as const;

export type ResultSuperCategoryIconToken =
  (typeof RESULT_SUPER_CATEGORY_ICON_TOKENS)[number];

export type ResultIconToken =
  | ResultScanIconToken
  | ResultMetricIconToken
  | ResultSuperCategoryIconToken;

export type ResultLucideIconName =
  | 'Camera'
  | 'CircleGauge'
  | 'CirclePercent'
  | 'ClipboardCheck'
  | 'Clock3'
  | 'Droplet'
  | 'Droplets'
  | 'Dumbbell'
  | 'Egg'
  | 'Flame'
  | 'Gauge'
  | 'HeartPulse'
  | 'LeafyGreen'
  | 'MoonStar'
  | 'Orbit'
  | 'PersonStanding'
  | 'PillBottle'
  | 'Ruler'
  | 'Salad'
  | 'Scale'
  | 'ScanFace'
  | 'ShieldCheck'
  | 'ShieldQuestionMark'
  | 'Sparkle'
  | 'SunMedium'
  | 'ThermometerSun'
  | 'UtensilsCrossed'
  | 'Wheat';

export type ResultCustomIconName =
  | 'faceContour'
  | 'muscleMass'
  | 'postureAlignment';

export type ResultIconDescriptor =
  | { kind: 'lucide'; name: ResultLucideIconName }
  | { kind: 'custom'; name: ResultCustomIconName };

const lucide = (name: ResultLucideIconName): ResultIconDescriptor => ({
  kind: 'lucide',
  name,
});

const custom = (name: ResultCustomIconName): ResultIconDescriptor => ({
  kind: 'custom',
  name,
});

export const RESULT_ICON_CATALOG: Record<ResultIconToken, ResultIconDescriptor> = {
  face: lucide('ScanFace'),
  body: lucide('PersonStanding'),
  nutrition: lucide('Salad'),
  perceived_age: lucide('Clock3'),
  face_shape: custom('faceContour'),
  symmetry: lucide('Scale'),
  fatigue: lucide('MoonStar'),
  hydration: lucide('Droplets'),
  photogenic: lucide('Camera'),
  skin_quality: lucide('Sparkle'),
  glow: lucide('SunMedium'),
  collagen: lucide('Orbit'),
  body_type: lucide('PersonStanding'),
  muscle_mass: custom('muscleMass'),
  waist: lucide('Ruler'),
  strength: lucide('Dumbbell'),
  bmi: lucide('Gauge'),
  metabolic_age: lucide('Clock3'),
  body_fat: lucide('CirclePercent'),
  posture: custom('postureAlignment'),
  body_symmetry: lucide('Scale'),
  calories: lucide('Flame'),
  verdict: lucide('ClipboardCheck'),
  satiety: lucide('UtensilsCrossed'),
  ingredients: lucide('LeafyGreen'),
  glycemic: lucide('CircleGauge'),
  vitamins: lucide('PillBottle'),
  proteins: lucide('Egg'),
  carbs: lucide('Wheat'),
  fats: lucide('Droplet'),
  unknown: lucide('ShieldQuestionMark'),
  general: lucide('ShieldCheck'),
  inflammation: lucide('ThermometerSun'),
  metabolic: lucide('CircleGauge'),
  skin: lucide('Sparkle'),
  recovery: lucide('MoonStar'),
  cardiovascular: lucide('HeartPulse'),
};

const FALLBACK_RESULT_ICON_DESCRIPTOR: ResultIconDescriptor = lucide('Sparkle');

const SUPER_CATEGORY_ICON_TOKEN_SET = new Set<string>(
  RESULT_SUPER_CATEGORY_ICON_TOKENS,
);

export function getResultIconDescriptor(
  token: ResultIconToken,
): ResultIconDescriptor {
  return RESULT_ICON_CATALOG[token] ?? FALLBACK_RESULT_ICON_DESCRIPTOR;
}

export function resolveSuperCategoryIconToken(
  categoryKey: string | null | undefined,
): ResultSuperCategoryIconToken {
  const normalizedKey = normalizeResultCatalogKey(categoryKey ?? '');

  return SUPER_CATEGORY_ICON_TOKEN_SET.has(normalizedKey)
    ? (normalizedKey as ResultSuperCategoryIconToken)
    : 'unknown';
}
