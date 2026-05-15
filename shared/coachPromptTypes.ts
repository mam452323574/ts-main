export const COACH_PROMPT_TYPES = [
  'latest_scan',
  'weekly_plan',
  'nutrition_focus',
  'body_focus',
  'face_focus',
  'hydration_focus',
  'sleep_coach',
  'risk_watch',
  'trend_review',
  'recovery_plan',
] as const;

export type CoachPromptType = (typeof COACH_PROMPT_TYPES)[number];

export const LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE =
  'latest_scan_issue_resolution' as const;
export const FREE_QUESTION_PROMPT_TYPE = 'free_question' as const;

export const COACH_HIDDEN_GENERATION_PROMPT_TYPES = [
  FREE_QUESTION_PROMPT_TYPE,
  LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
] as const;

export const COACH_GENERATION_PROMPT_TYPES = [
  ...COACH_PROMPT_TYPES,
  ...COACH_HIDDEN_GENERATION_PROMPT_TYPES,
] as const;

export type CoachGenerationPromptType =
  (typeof COACH_GENERATION_PROMPT_TYPES)[number];

export const COACH_PROMPT_TYPE_ALIASES = {
  trend_comparison: 'trend_review',
  latest_scan_issue_resolution: 'latest_scan',
} as const;

export const DEFAULT_COACH_PROMPT_TYPE: CoachPromptType = 'latest_scan';

export const COACH_PROMPT_CATEGORIES = [
  'today',
  'plan',
  'focus',
  'vigilance',
  'trend',
] as const;

export type CoachPromptCategory = (typeof COACH_PROMPT_CATEGORIES)[number];

export interface CoachPromptDefinition {
  key: CoachPromptType;
  category: CoachPromptCategory;
  requiresPremium: boolean;
}

export const COACH_PROMPT_DEFINITIONS: readonly CoachPromptDefinition[] = [
  { key: 'latest_scan', category: 'today', requiresPremium: false },
  { key: 'weekly_plan', category: 'plan', requiresPremium: true },
  { key: 'recovery_plan', category: 'plan', requiresPremium: false },
  { key: 'nutrition_focus', category: 'focus', requiresPremium: true },
  { key: 'body_focus', category: 'focus', requiresPremium: true },
  { key: 'face_focus', category: 'focus', requiresPremium: false },
  { key: 'hydration_focus', category: 'focus', requiresPremium: false },
  { key: 'sleep_coach', category: 'focus', requiresPremium: true },
  { key: 'risk_watch', category: 'vigilance', requiresPremium: true },
  { key: 'trend_review', category: 'trend', requiresPremium: true },
];

const DEFINITION_BY_KEY: Record<CoachPromptType, CoachPromptDefinition> =
  COACH_PROMPT_DEFINITIONS.reduce(
    (acc, definition) => {
      acc[definition.key] = definition;
      return acc;
    },
    {} as Record<CoachPromptType, CoachPromptDefinition>,
  );

export function isCoachPromptType(value: unknown): value is CoachPromptType {
  return (
    typeof value === 'string' &&
    (COACH_PROMPT_TYPES as readonly string[]).includes(value)
  );
}

export function isCoachGenerationPromptType(
  value: unknown,
): value is CoachGenerationPromptType {
  return (
    typeof value === 'string' &&
    (COACH_GENERATION_PROMPT_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeCoachPromptType(
  value: unknown,
): CoachPromptType | null {
  if (isCoachPromptType(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return (COACH_PROMPT_TYPE_ALIASES as Record<string, CoachPromptType>)[
    normalized
  ] ?? null;
}

export function normalizeCoachGenerationPromptType(
  value: unknown,
): CoachGenerationPromptType | null {
  if (isCoachGenerationPromptType(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (isCoachGenerationPromptType(normalized)) {
    return normalized;
  }

  return (COACH_PROMPT_TYPE_ALIASES as Record<string, CoachPromptType>)[
    normalized
  ] ?? null;
}

export function resolveVisibleCoachPromptType(
  promptType: CoachGenerationPromptType,
): CoachPromptType {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return DEFAULT_COACH_PROMPT_TYPE;
  }

  if (promptType === LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE) {
    return 'latest_scan';
  }

  return promptType;
}

export function getCoachPromptDefinition(
  key: CoachPromptType,
): CoachPromptDefinition {
  return DEFINITION_BY_KEY[key];
}

export function getCoachPromptCategory(
  key: CoachPromptType,
): CoachPromptCategory {
  return DEFINITION_BY_KEY[key].category;
}

export function hasCoachPromptTypeAccess(
  promptType: CoachPromptType,
  accountTier?: string | null,
): boolean {
  const definition = DEFINITION_BY_KEY[promptType];
  if (!definition.requiresPremium) {
    return true;
  }

  return accountTier === 'premium' || accountTier === 'admin';
}

export function resolveEffectiveCoachPromptType(
  promptType: unknown,
  accountTier?: string | null,
): CoachPromptType {
  const normalizedPromptType = normalizeCoachPromptType(promptType);
  if (!normalizedPromptType) {
    return DEFAULT_COACH_PROMPT_TYPE;
  }

  return hasCoachPromptTypeAccess(normalizedPromptType, accountTier)
    ? normalizedPromptType
    : DEFAULT_COACH_PROMPT_TYPE;
}

export interface CoachPromptCategoryGroup {
  category: CoachPromptCategory;
  prompts: readonly CoachPromptType[];
}

export function groupCoachPromptsByCategory(
  prompts: readonly CoachPromptType[] = COACH_PROMPT_TYPES,
): CoachPromptCategoryGroup[] {
  const groups = new Map<CoachPromptCategory, CoachPromptType[]>();

  for (const category of COACH_PROMPT_CATEGORIES) {
    groups.set(category, []);
  }

  for (const prompt of prompts) {
    const category = getCoachPromptCategory(prompt);
    groups.get(category)?.push(prompt);
  }

  return COACH_PROMPT_CATEGORIES.map((category) => ({
    category,
    prompts: groups.get(category) ?? [],
  })).filter((group) => group.prompts.length > 0);
}

// ---------------------------------------------------------------------------
// Scan dispatch quotas — decides how many scans to send to the webhook,
// scoped per prompt_type so each mode can be reasoned against the right
// slice of history.
// ---------------------------------------------------------------------------

export type CoachScanTypeKey = 'health' | 'body' | 'nutrition' | 'super';

export interface CoachPromptScanQuota {
  /** Max recent scans sent in payload.recent_scans. */
  recentLimit: number;
  /** Max history scans sent in payload.prior_scans. */
  priorLimit: number;
  /** If set, payload.recent_scans is scoped to last N days. */
  recentWindowDays?: number;
  /** If set, scans of these types are prioritised in recent_scans. */
  typeFilter?: readonly CoachScanTypeKey[];
}

const DEFAULT_QUOTA: CoachPromptScanQuota = {
  recentLimit: 5,
  priorLimit: 6,
};

const COACH_PROMPT_SCAN_QUOTAS: Record<
  CoachGenerationPromptType,
  CoachPromptScanQuota
> = {
  latest_scan: {
    recentLimit: 5,
    priorLimit: 4,
  },
  latest_scan_issue_resolution: {
    recentLimit: 5,
    priorLimit: 4,
  },
  free_question: {
    recentLimit: 5,
    priorLimit: 6,
  },
  weekly_plan: {
    recentLimit: 10,
    priorLimit: 4,
    recentWindowDays: 7,
  },
  recovery_plan: {
    recentLimit: 6,
    priorLimit: 10,
  },
  nutrition_focus: {
    recentLimit: 6,
    priorLimit: 6,
    typeFilter: ['nutrition'],
  },
  body_focus: {
    recentLimit: 6,
    priorLimit: 6,
    typeFilter: ['body'],
  },
  face_focus: {
    recentLimit: 6,
    priorLimit: 6,
    typeFilter: ['health'],
  },
  hydration_focus: {
    recentLimit: 5,
    priorLimit: 5,
    typeFilter: ['health', 'nutrition'],
  },
  sleep_coach: {
    recentLimit: 6,
    priorLimit: 8,
    typeFilter: ['health', 'body'],
  },
  risk_watch: {
    recentLimit: 4,
    priorLimit: 10,
    typeFilter: ['super'],
  },
  trend_review: {
    recentLimit: 10,
    priorLimit: 12,
  },
};

export function getCoachPromptScanQuota(
  promptType: CoachGenerationPromptType,
): CoachPromptScanQuota {
  return COACH_PROMPT_SCAN_QUOTAS[promptType] ?? DEFAULT_QUOTA;
}
