import { ScanCatalogKey, ScanVitaminKey, SuperScanCatalogKey } from '@/types';

export type ResultCatalogNamespace =
  | 'verdicts'
  | 'qualitative_levels.face_shape'
  | 'qualitative_levels.body_type'
  | 'qualitative_levels.muscle_mass'
  | 'qualitative_levels.ingredient_quality'
  | 'qualitative_levels.glycemic_index'
  | 'qualitative_levels.severity'
  | 'scan.nutrition.vitamins'
  | 'scan.super.summaries'
  | 'scan.super.disclaimers'
  | 'scan.super.categories'
  | 'scan.super.conditions'
  | 'scan.super.explanations'
  | 'scan.super.advice';

export type ResultCatalogContract<Key extends string = string> = {
  namespace: ResultCatalogNamespace;
  canonical: readonly Key[];
  approvedAliases: Readonly<Record<string, Key>>;
  aliasLookup: Readonly<Record<string, Key>>;
  fallback: Key;
  leafKeySuffix?: string;
};

type ContractOptions<Key extends string> = {
  fallback?: Key;
  leafKeySuffix?: string;
};

export function normalizeContractToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]+/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function createContract<Key extends string>(
  namespace: ResultCatalogNamespace,
  canonical: readonly Key[],
  approvedAliases: Readonly<Record<string, Key>> = {},
  options: ContractOptions<Key> = {}
): ResultCatalogContract<Key> {
  const fallback =
    options.fallback ??
    (canonical.includes('unknown' as Key) ? ('unknown' as Key) : canonical[0]);
  const aliasLookup: Record<string, Key> = {};

  canonical.forEach((key) => {
    aliasLookup[normalizeContractToken(key)] = key;
  });

  Object.entries(approvedAliases).forEach(([alias, key]) => {
    const normalizedAlias = normalizeContractToken(alias);
    if (normalizedAlias) {
      aliasLookup[normalizedAlias] = key;
    }
  });

  return {
    namespace,
    canonical,
    approvedAliases,
    aliasLookup,
    fallback,
    leafKeySuffix: options.leafKeySuffix,
  };
}

export function resolveContractKey<Key extends string>(
  contract: ResultCatalogContract<Key>,
  value: string | null | undefined
) {
  if (!value) {
    return contract.fallback;
  }

  const normalizedValue = normalizeContractToken(value);
  if (!normalizedValue) {
    return contract.fallback;
  }

  return contract.aliasLookup[normalizedValue] ?? contract.fallback;
}

export function getContractTranslationPath<Key extends string>(
  contract: ResultCatalogContract<Key>,
  key: Key
) {
  return `${contract.namespace}.${key}${contract.leafKeySuffix ?? ''}`;
}

// Result keys rendered in the UI are a closed contract:
// canon exact -> alias explicite approuvé -> unknown.
// Ajouter une nouvelle valeur backend exige une mise à jour conjointe
// de ce contrat et des locales résultats.

const FACE_SHAPE_ALIASES: Readonly<Record<string, ScanCatalogKey>> = {
  ovale: 'oval',
  rond: 'round',
  redondo: 'round',
  carre: 'square',
  cuadrado: 'square',
  coeur: 'heart',
  corazon: 'heart',
  diamant: 'diamond',
  oblong: 'long',
  allonge: 'long',
  rectangle: 'rectangular',
  rectangulaire: 'rectangular',
};

const BODY_TYPE_ALIASES: Readonly<Record<string, ScanCatalogKey>> = {
  athletique: 'athletic',
  atletico: 'athletic',
  atletica: 'athletic',
  equilibre: 'balanced',
  equilibrado: 'balanced',
  equilibrada: 'balanced',
  equilibrato: 'balanced',
  equilibrata: 'balanced',
  ectomorphe: 'ectomorph',
  mesomorphe: 'mesomorph',
  endomorphe: 'endomorph',
  poire: 'pear',
  pomme: 'apple',
  invertedtriangle: 'inverted_triangle',
  triangleinverse: 'inverted_triangle',
};

const MUSCLE_MASS_ALIASES: Readonly<Record<string, ScanCatalogKey>> = {
  faible: 'low',
  schwach: 'low',
  debole: 'low',
  debil: 'low',
  fraco: 'low',
  modere: 'moderate',
  moderee: 'moderate',
  moderado: 'moderate',
  moderada: 'moderate',
  moderata: 'moderate',
  moyenne: 'average',
  media: 'average',
  medio: 'average',
  eleve: 'high',
  elevee: 'high',
  elevada: 'high',
  elevado: 'high',
  alto: 'high',
  alta: 'high',
  treseleve: 'very_high',
  athletique: 'athlete',
  atletico: 'athlete',
  atletica: 'athlete',
  equilibre: 'balanced',
};

const INGREDIENT_QUALITY_ALIASES: Readonly<Record<string, ScanCatalogKey>> = {
  naturel: 'natural',
  naturelle: 'natural',
  naturalisimo: 'natural',
  farm_fresh: 'natural',
  excellente: 'excellent',
  exzellent: 'excellent',
  excelente: 'excellent',
  bonne: 'good',
  gut: 'good',
  bene: 'good',
  bom: 'good',
  moyenne: 'average',
  media: 'average',
  medio: 'average',
  mauvaise: 'poor',
  mauvais: 'poor',
  schlecht: 'poor',
  cattivo: 'poor',
  ruim: 'poor',
  mediocre: 'bad',
  transforme: 'processed',
  transformee: 'processed',
  processado: 'processed',
  processato: 'processed',
  verarbeitet: 'processed',
  ultraprocessed: 'ultra_processed',
  ultratransforme: 'ultra_processed',
  ultraprocesado: 'ultra_processed',
  ultraprocessado: 'ultra_processed',
  starkverarbeitet: 'ultra_processed',
};

const GLYCEMIC_INDEX_ALIASES: Readonly<Record<string, ScanCatalogKey>> = {
  bas: 'low',
  faible: 'low',
  basso: 'low',
  bajo: 'low',
  baixe: 'low',
  low_glycemic_index: 'low',
  modere: 'moderate',
  moderado: 'moderate',
  moderata: 'moderate',
  medium: 'moderate',
  moderate_glycemic_index: 'moderate',
  eleve: 'high',
  elevee: 'high',
  elevado: 'high',
  elevada: 'high',
  alto: 'high',
  alta: 'high',
  high_glycemic_index: 'high',
};

const SEVERITY_ALIASES: Readonly<Record<string, ScanCatalogKey>> = {
  faible: 'low',
  modere: 'moderate',
  moderee: 'moderate',
  medium: 'moderate',
  eleve: 'high',
  elevee: 'high',
  elevated: 'high',
  alto: 'high',
  alta: 'high',
};

const VERDICT_ALIASES: Readonly<Record<string, ScanCatalogKey>> = {
  balanced_meal: 'balanced',
  repas_equilibre: 'balanced',
  equilibre: 'balanced',
  equilibree: 'balanced',
  ideal_for_smoothies: 'smoothie_ideal',
  protein_rich: 'protein_dense',
  high_protein: 'protein_dense',
  riche_en_proteines: 'protein_dense',
  leger: 'light',
  legere: 'light',
  transforme: 'processed',
  transformee: 'processed',
  sucre: 'sugary',
  gourmant: 'indulgent',
  gourmand: 'indulgent',
  plaisir: 'indulgent',
};

const VITAMIN_ALIASES: Readonly<Record<string, ScanVitaminKey>> = {
  a: 'vitamin_a',
  vitamine_a: 'vitamin_a',
  vitamina_a: 'vitamin_a',
  b: 'vitamin_b',
  vitaminb: 'vitamin_b',
  vitamine_b: 'vitamin_b',
  vitamina_b: 'vitamin_b',
  c: 'vitamin_c',
  vitaminc: 'vitamin_c',
  vitamine_c: 'vitamin_c',
  vitamina_c: 'vitamin_c',
  d: 'vitamin_d',
  vitamind: 'vitamin_d',
  vitamine_d: 'vitamin_d',
  vitamina_d: 'vitamin_d',
  e: 'vitamin_e',
  vitamine: 'vitamin_e',
  vitamina_e: 'vitamin_e',
  k: 'vitamin_k',
  vitamink: 'vitamin_k',
  vitamine_k: 'vitamin_k',
  vitamina_k: 'vitamin_k',
  b1: 'vitamin_b1',
  vitamine_b1: 'vitamin_b1',
  vitamina_b1: 'vitamin_b1',
  b2: 'vitamin_b2',
  vitamine_b2: 'vitamin_b2',
  vitamina_b2: 'vitamin_b2',
  b3: 'vitamin_b3',
  vitamine_b3: 'vitamin_b3',
  vitamina_b3: 'vitamin_b3',
  niacin: 'vitamin_b3',
  niacine: 'vitamin_b3',
  b5: 'vitamin_b5',
  vitamine_b5: 'vitamin_b5',
  vitamina_b5: 'vitamin_b5',
  b6: 'vitamin_b6',
  vitamine_b6: 'vitamin_b6',
  vitamina_b6: 'vitamin_b6',
  b7: 'vitamin_b7',
  vitamine_b7: 'vitamin_b7',
  vitamina_b7: 'vitamin_b7',
  b9: 'vitamin_b9',
  vitamine_b9: 'vitamin_b9',
  vitamina_b9: 'vitamin_b9',
  folate: 'vitamin_b9',
  folic_acid: 'vitamin_b9',
  b12: 'vitamin_b12',
  vitamine_b12: 'vitamin_b12',
  vitamina_b12: 'vitamin_b12',
  fer: 'iron',
  omega3: 'omega_3',
};

const SUPER_SUMMARY_ALIASES: Readonly<Record<string, SuperScanCatalogKey>> = {
  ras: 'stable',
  all_clear: 'stable',
  aucun_signe: 'stable',
  please_consult_a_doctor: 'medical_attention',
  consult_a_doctor: 'medical_attention',
  medical_follow_up_advised: 'medical_attention',
};

const SUPER_DISCLAIMER_ALIASES: Readonly<Record<string, SuperScanCatalogKey>> = {
  this_is_not_a_diagnosis: 'medical_not_diagnosis',
  not_a_diagnosis: 'medical_not_diagnosis',
  medical_advice_only: 'medical_not_diagnosis',
  context_general: 'general',
};

export const FACE_SHAPE_CONTRACT = createContract('qualitative_levels.face_shape', [
  'unknown',
  'oval',
  'round',
  'square',
  'heart',
  'diamond',
  'long',
  'triangle',
  'rectangular',
] as const, FACE_SHAPE_ALIASES);

export const BODY_TYPE_CONTRACT = createContract('qualitative_levels.body_type', [
  'unknown',
  'athletic',
  'balanced',
  'ectomorph',
  'mesomorph',
  'endomorph',
  'hourglass',
  'pear',
  'apple',
  'rectangle',
  'inverted_triangle',
] as const, BODY_TYPE_ALIASES);

export const MUSCLE_MASS_CONTRACT = createContract('qualitative_levels.muscle_mass', [
  'unknown',
  'low',
  'moderate',
  'average',
  'balanced',
  'high',
  'very_high',
  'athlete',
] as const, MUSCLE_MASS_ALIASES);

export const INGREDIENT_QUALITY_CONTRACT = createContract(
  'qualitative_levels.ingredient_quality',
  [
    'unknown',
    'natural',
    'excellent',
    'good',
    'average',
    'poor',
    'bad',
    'processed',
    'ultra_processed',
  ] as const,
  INGREDIENT_QUALITY_ALIASES
);

export const GLYCEMIC_INDEX_CONTRACT = createContract(
  'qualitative_levels.glycemic_index',
  ['unknown', 'low', 'moderate', 'high'] as const,
  GLYCEMIC_INDEX_ALIASES
);

export const SEVERITY_CONTRACT = createContract(
  'qualitative_levels.severity',
  ['unknown', 'low', 'moderate', 'high'] as const,
  SEVERITY_ALIASES
);

export const VERDICT_CONTRACT = createContract(
  'verdicts',
  [
    'unknown',
    'balanced',
    'smoothie_ideal',
    'protein_dense',
    'light',
    'processed',
    'sugary',
    'indulgent',
  ] as const,
  VERDICT_ALIASES
);

export const NUTRITION_VITAMIN_CONTRACT = createContract(
  'scan.nutrition.vitamins',
  [
    'unknown',
    'vitamin_a',
    'vitamin_b',
    'vitamin_c',
    'vitamin_d',
    'vitamin_e',
    'vitamin_k',
    'vitamin_b1',
    'vitamin_b2',
    'vitamin_b3',
    'vitamin_b5',
    'vitamin_b6',
    'vitamin_b7',
    'vitamin_b9',
    'vitamin_b12',
    'iron',
    'calcium',
    'magnesium',
    'zinc',
    'potassium',
    'omega_3',
  ] as const,
  VITAMIN_ALIASES
);

export const SUPER_SUMMARY_CONTRACT = createContract(
  'scan.super.summaries',
  ['unknown', 'stable', 'medical_attention'] as const,
  SUPER_SUMMARY_ALIASES
);

export const SUPER_DISCLAIMER_CONTRACT = createContract(
  'scan.super.disclaimers',
  ['unknown', 'medical_not_diagnosis', 'general'] as const,
  SUPER_DISCLAIMER_ALIASES
);

export const SUPER_CATEGORY_CONTRACT = createContract('scan.super.categories', [
  'unknown',
  'general',
  'inflammation',
  'metabolic',
  'skin',
  'posture',
  'nutrition',
  'recovery',
  'cardiovascular',
] as const);

export const SUPER_CONDITION_CONTRACT = createContract(
  'scan.super.conditions',
  ['unknown'] as const,
  {},
  { leafKeySuffix: '.label' }
);

export const SUPER_EXPLANATION_CONTRACT = createContract('scan.super.explanations', [
  'unknown',
  'inflammatory_markers_look_elevated',
] as const);

export const SUPER_ADVICE_CONTRACT = createContract('scan.super.advice', [
  'unknown',
  'schedule_a_consultation',
] as const);

export const RESULT_CATALOG_CONTRACTS = [
  VERDICT_CONTRACT,
  FACE_SHAPE_CONTRACT,
  BODY_TYPE_CONTRACT,
  MUSCLE_MASS_CONTRACT,
  INGREDIENT_QUALITY_CONTRACT,
  GLYCEMIC_INDEX_CONTRACT,
  SEVERITY_CONTRACT,
  NUTRITION_VITAMIN_CONTRACT,
  SUPER_SUMMARY_CONTRACT,
  SUPER_DISCLAIMER_CONTRACT,
  SUPER_CATEGORY_CONTRACT,
  SUPER_CONDITION_CONTRACT,
  SUPER_EXPLANATION_CONTRACT,
  SUPER_ADVICE_CONTRACT,
] as const;
