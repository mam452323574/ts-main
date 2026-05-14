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

export interface CoachScheduleSlot {
  time: string;
  duration_min: number | null;
  action: string;
  tag: string | null;
}

export interface CoachDailySchedule {
  day: string;
  slots: CoachScheduleSlot[];
}

export interface CoachMicroRoutine {
  name: string;
  when: string | null;
  total_min: number | null;
  steps: string[];
}

export interface CoachMealIngredient {
  item: string;
  portion: string | null;
}

export interface CoachMealTemplate {
  name: string;
  when: string | null;
  prep_min: number | null;
  ingredients: CoachMealIngredient[];
  why: string | null;
}

export interface CoachMealSwap {
  from: string;
  to: string;
  why: string | null;
}

export const COACH_SHOPPING_SECTIONS = [
  'frais',
  'sec',
  'boissons',
  'snacks',
  'autre',
] as const;
export type CoachShoppingSection = (typeof COACH_SHOPPING_SECTIONS)[number];

export interface CoachShoppingListItem {
  item: string;
  section: CoachShoppingSection;
}

export interface CoachQuickRecipe {
  name: string;
  total_min: number | null;
  steps: string[];
  tags: string[];
}

export interface CoachKnowledgeCard {
  title: string;
  body: string;
  takeaway: string | null;
}

export interface CoachHabitTracker {
  label: string;
  target_days: number;
  window: string | null;
}

export const COACH_REMINDER_RECURRENCES = [
  'today',
  'daily',
  'weekly',
] as const;
export type CoachReminderRecurrence =
  (typeof COACH_REMINDER_RECURRENCES)[number];

export interface CoachReminder {
  at: string;
  label: string;
  recurrence: CoachReminderRecurrence;
}

export const COACH_NEXT_SCAN_TYPES = [
  'face',
  'body',
  'nutrition',
  'super',
  'health',
] as const;
export type CoachNextScanType = (typeof COACH_NEXT_SCAN_TYPES)[number];

export interface CoachNextScanSuggestion {
  scan_type: CoachNextScanType;
  in_days: number;
  reason: string | null;
}

export interface CoachSignalWatch {
  signal: string;
  what_to_notice: string;
  when_to_escalate: string | null;
}

export interface CoachStreakCelebration {
  days: number;
  message: string;
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
  daily_schedule?: CoachDailySchedule[];
  micro_routine?: CoachMicroRoutine[];
  meal_template?: CoachMealTemplate | null;
  meal_swaps?: CoachMealSwap[];
  shopping_list?: CoachShoppingListItem[];
  quick_recipe?: CoachQuickRecipe | null;
  knowledge_card?: CoachKnowledgeCard | null;
  habit_tracker?: CoachHabitTracker[];
  reminders?: CoachReminder[];
  next_scan_suggestion?: CoachNextScanSuggestion | null;
  signal_watch?: CoachSignalWatch[];
  streak_celebration?: CoachStreakCelebration | null;
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
  scheduleDay: 24,
  scheduleTime: 16,
  scheduleAction: 140,
  scheduleTag: 24,
  routineName: 80,
  routineWhen: 40,
  routineStep: 120,
  mealName: 80,
  mealWhen: 24,
  mealWhy: 200,
  mealIngredientItem: 60,
  mealIngredientPortion: 40,
  mealSwapFrom: 80,
  mealSwapTo: 80,
  mealSwapWhy: 160,
  shoppingItem: 60,
  shoppingSection: 20,
  recipeName: 80,
  recipeStep: 120,
  recipeTag: 24,
  knowledgeTitle: 80,
  knowledgeBody: 500,
  knowledgeTakeaway: 140,
  habitLabel: 80,
  habitWindow: 24,
  reminderAt: 24,
  reminderLabel: 80,
  reminderRecurrence: 16,
  nextScanType: 16,
  nextScanReason: 160,
  signalName: 80,
  signalNotice: 140,
  signalEscalation: 160,
  streakMessage: 140,
  body: 4000,
  ctaLabel: 40,
  disclaimer: 240,
  metricKey: 64,
  metricHumanLabel: 120,
  contextNotesMax: 3,
  prioritiesMax: 3,
  actionStepsMax: 4,
  warningsMax: 3,
  dataGapsMax: 3,
  dailyScheduleMax: 7,
  scheduleSlotsMax: 4,
  microRoutineMax: 2,
  routineStepsMax: 6,
  mealIngredientsMax: 6,
  mealSwapsMax: 3,
  shoppingListMax: 12,
  recipeStepsMax: 5,
  recipeTagsMax: 4,
  habitTrackerMax: 3,
  remindersMax: 3,
  signalWatchMax: 3,
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

export function isCoachShoppingSection(
  value: unknown,
): value is CoachShoppingSection {
  return (
    typeof value === 'string' &&
    (COACH_SHOPPING_SECTIONS as readonly string[]).includes(value)
  );
}

export function isCoachReminderRecurrence(
  value: unknown,
): value is CoachReminderRecurrence {
  return (
    typeof value === 'string' &&
    (COACH_REMINDER_RECURRENCES as readonly string[]).includes(value)
  );
}

export function isCoachNextScanType(value: unknown): value is CoachNextScanType {
  return (
    typeof value === 'string' &&
    (COACH_NEXT_SCAN_TYPES as readonly string[]).includes(value)
  );
}
