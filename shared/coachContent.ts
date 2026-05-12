export const COACH_RESPONSE_VERSIONS = [1, 2] as const;
export type CoachResponseVersion = (typeof COACH_RESPONSE_VERSIONS)[number];

export const COACH_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export type CoachConfidence = (typeof COACH_CONFIDENCE_VALUES)[number];

export const COACH_METRIC_DIRECTIONS = ['up', 'down', 'stable'] as const;
export type CoachMetricDirection = (typeof COACH_METRIC_DIRECTIONS)[number];

export const COACH_METRIC_MAGNITUDES = ['slight', 'moderate', 'strong'] as const;
export type CoachMetricMagnitude = (typeof COACH_METRIC_MAGNITUDES)[number];

export const COACH_METRIC_INTERPRETATIONS = [
  'positive',
  'negative',
  'neutral',
] as const;
export type CoachMetricInterpretation =
  (typeof COACH_METRIC_INTERPRETATIONS)[number];

export interface CoachPrimaryMetricDelta {
  metric_key: string;
  human_label: string;
  direction: CoachMetricDirection;
  magnitude: CoachMetricMagnitude;
  interpretation: CoachMetricInterpretation;
}

export const COACH_PROFILE_UPDATE_FOCUS_VALUES = [
  'health',
  'body',
  'nutrition',
  'super',
] as const;
export type CoachProfileUpdateFocus =
  (typeof COACH_PROFILE_UPDATE_FOCUS_VALUES)[number];

export interface CoachProfileUpdateStructured {
  detected_diet_signals: string[];
  detected_strong_focus: CoachProfileUpdateFocus | null;
  suggested_goals: string[];
  suggested_persona_key: string | null;
}

export interface CoachStructuredContent {
  title: string;
  summary: string;
  context_notes: string[];
  priorities: string[];
  action_steps: string[];
  warnings: string[];
  encouragement: string | null;
  primary_metric_delta: CoachPrimaryMetricDelta | null;
  data_gaps: string[];
  confidence: CoachConfidence | null;
  profile_updates?: CoachProfileUpdateStructured | null;
}

export const COACH_CONTENT_LIMITS = {
  title: 80,
  summary: 280,
  contextNote: 240,
  priority: 180,
  actionStep: 200,
  warning: 200,
  encouragement: 280,
  dataGap: 160,
  body: 1200,
  ctaLabel: 40,
  disclaimer: 240,
  metricKey: 64,
  metricHumanLabel: 120,
  contextNotesMax: 3,
  prioritiesMax: 3,
  actionStepsMax: 4,
  warningsMax: 3,
  dataGapsMax: 3,
  dietSignalsMax: 5,
  dietSignal: 64,
  goalsMax: 3,
  goal: 120,
  personaKey: 40,
} as const;

export function isCoachProfileUpdateFocus(
  value: unknown,
): value is CoachProfileUpdateFocus {
  return (
    typeof value === 'string' &&
    (COACH_PROFILE_UPDATE_FOCUS_VALUES as readonly string[]).includes(value)
  );
}

export function isCoachResponseVersion(
  value: unknown,
): value is CoachResponseVersion {
  return (
    typeof value === 'number' &&
    (COACH_RESPONSE_VERSIONS as readonly number[]).includes(value)
  );
}

export function isCoachConfidence(value: unknown): value is CoachConfidence {
  return (
    typeof value === 'string' &&
    (COACH_CONFIDENCE_VALUES as readonly string[]).includes(value)
  );
}

export function isCoachMetricDirection(
  value: unknown,
): value is CoachMetricDirection {
  return (
    typeof value === 'string' &&
    (COACH_METRIC_DIRECTIONS as readonly string[]).includes(value)
  );
}

export function isCoachMetricMagnitude(
  value: unknown,
): value is CoachMetricMagnitude {
  return (
    typeof value === 'string' &&
    (COACH_METRIC_MAGNITUDES as readonly string[]).includes(value)
  );
}

export function isCoachMetricInterpretation(
  value: unknown,
): value is CoachMetricInterpretation {
  return (
    typeof value === 'string' &&
    (COACH_METRIC_INTERPRETATIONS as readonly string[]).includes(value)
  );
}
