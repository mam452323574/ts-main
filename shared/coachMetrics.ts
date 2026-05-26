/**
 * Pure helpers shared between the Edge Function (Deno) and the React Native
 * client. Imported by `supabase/functions/_shared/coachConversationContext.ts`
 * (via Deno-compatible relative import) and `services/coach.ts` if/when the
 * front-end converges on the same primitives.
 *
 * No I/O, no network, no DB clients here.
 */

/**
 * Maps a `scans.scan_type` value (front/back facing) to the column prefix used
 * in `scan_metrics`. The two namespaces diverge :
 *   - `scans.scan_type IN ('body', 'health', 'nutrition', 'super')`
 *   - `scan_metrics` columns prefixed by `face_`, `body_`, `nutrition_`,
 *     `super_` (note `face_*` for the visage / "health" scan).
 *
 * The mapping is the same one already encoded in
 * `supabase/migrations/20260327143000_add_premium_potential.sql` (RPC
 * `get_premium_potential_data`).
 */
export const SCAN_TYPE_TO_METRICS_PREFIX = {
  health: 'face_',
  face: 'face_',
  body: 'body_',
  nutrition: 'nutrition_',
  super: 'super_',
} as const;

export type CoachScanTypeKey = keyof typeof SCAN_TYPE_TO_METRICS_PREFIX;

export function getMetricsPrefixForScanType(
  scanType: string | null | undefined,
): string | null {
  if (typeof scanType !== 'string') return null;
  const key = scanType as CoachScanTypeKey;
  return SCAN_TYPE_TO_METRICS_PREFIX[key] ?? null;
}

/**
 * Subset of metrics tracked in the `trends` block of the user_context. Only
 * the most actionable signals per scan_type — keeps the trends payload under
 * ~1.5 KB even when the user has many scans.
 *
 * The prefix is implied by the scan_type bucket (`face.<metric>` ->
 * `face_<metric>` column in scan_metrics).
 */
export const TRENDED_METRICS_BY_TYPE: Record<string, string[]> = {
  face: [
    'skin_clarity_score',
    'under_eye_shadow_score',
    'complexion_redness_score',
    'hydration_level',
    'skin_radiance_score',
  ],
  body: [
    'recovery_readiness_score',
    'muscle_definition_score',
    'midsection_definition_score',
    'posture_score',
    'shoulder_alignment_score',
  ],
  nutrition: [
    'hydration_contribution_score',
    'meal_balance_score',
    'processing_level_score',
    'inflammation_index_score',
    'sodium_level_score',
  ],
  super: [
    'global_risk_score',
  ],
};

/**
 * Priority ordering of metrics inside the digest entry's `metrics` sub-object.
 * Used when serializing so that the most-requested chiffres land at the top of
 * the JSON — important because the n8n node `Normalize Coach Conversation
 * Input` truncates `JSON.stringify(recent_scan_digest)` to 1200 chars (and we
 * are explicitly NOT touching that node in this iteration).
 *
 * Keys NOT in this list still get included; they are appended after the
 * priority block in alphabetical order.
 */
export const PRIORITY_METRIC_KEYS_BY_TYPE: Record<string, string[]> = {
  face: [
    'skin_clarity_score',
    'hydration_level',
    'under_eye_shadow_score',
    'complexion_redness_score',
    'eye_openness_score',
  ],
  body: [
    'recovery_readiness_score',
    'muscle_definition_score',
    'body_fat_percentage',
    'posture_score',
    'midsection_definition_score',
  ],
  nutrition: [
    'hydration_contribution_score',
    'meal_balance_score',
    'processing_level_score',
    'inflammation_index_score',
    'meal_type_key',
  ],
  super: [
    'global_risk_score',
  ],
};

export type MetricDirection = 'improving' | 'declining' | 'stable';

/**
 * Higher is better for these metrics (clarity, recovery, muscle definition,
 * etc.) — an INCREASE means "improving".
 *
 * Lower is better for these metrics (redness, shadow, inflammation, sodium,
 * processing level, sugar, etc.) — a DECREASE means "improving".
 *
 * Used inside `getMetricDirection` to flip the comparison sign correctly.
 */
const LOWER_IS_BETTER_METRICS = new Set<string>([
  'under_eye_shadow_score',
  'complexion_redness_score',
  'inflammation_index_score',
  'sodium_level_score',
  'sugar_grams_estimate',
  'processing_level_score',
  'lip_dryness_score',
  't_zone_oiliness_score',
  'tension_indicator_score',
]);

export interface MetricDirectionOptions {
  /** Absolute change below this threshold is considered "stable". Default: 0. */
  tolerance?: number;
}

/**
 * Returns `'improving' | 'declining' | 'stable'` for a metric given current
 * and previous values. Direction is flipped for metrics where lower-is-better
 * (see `LOWER_IS_BETTER_METRICS`).
 */
export function getMetricDirection(
  metricKey: string,
  current: number,
  previous: number,
  options: MetricDirectionOptions = {},
): MetricDirection {
  const tolerance = options.tolerance ?? 0;
  const rawDelta = current - previous;
  if (Math.abs(rawDelta) <= tolerance) {
    return 'stable';
  }
  const lowerIsBetter = LOWER_IS_BETTER_METRICS.has(metricKey);
  const adjusted = lowerIsBetter ? -rawDelta : rawDelta;
  return adjusted > 0 ? 'improving' : 'declining';
}

/**
 * Returns the unsigned, rounded delta (1 decimal place). Useful when the
 * caller wants to expose both a direction and a magnitude.
 */
export function roundMetricDelta(current: number, previous: number): number {
  return Math.round((current - previous) * 10) / 10;
}

/**
 * Categorical helper used by the LLM-side prompt to phrase the direction in a
 * user-friendly way. Kept here because it is pure & shared with the front.
 */
export function classifyMetricChange(
  metricKey: string,
  current: number,
  previous: number,
  options: MetricDirectionOptions = {},
): {
  direction: MetricDirection;
  delta: number;
  magnitude_abs: number;
} {
  const direction = getMetricDirection(metricKey, current, previous, options);
  const delta = roundMetricDelta(current, previous);
  return {
    direction,
    delta,
    magnitude_abs: Math.abs(delta),
  };
}

/**
 * Sorts an iterable of metric keys so that the priority keys (per scan_type)
 * come first in their declared order, then the remaining keys alphabetically.
 *
 * Used to control the JSON serialization order — see PRIORITY_METRIC_KEYS_BY_TYPE.
 */
export function orderMetricKeys(
  scanType: string,
  keys: Iterable<string>,
): string[] {
  const allKeys = Array.from(new Set(keys));
  const prefix = getMetricsPrefixForScanType(scanType);
  if (!prefix) return [...allKeys].sort();
  // Resolve the bucket label used in PRIORITY_METRIC_KEYS_BY_TYPE
  // (`face_` -> `face`, `body_` -> `body`, ...).
  const bucket = prefix.replace(/_$/, '');
  const priority = PRIORITY_METRIC_KEYS_BY_TYPE[bucket] ?? [];
  const priorityOrdered: string[] = [];
  const seen = new Set<string>();
  for (const key of priority) {
    if (allKeys.includes(key)) {
      priorityOrdered.push(key);
      seen.add(key);
    }
  }
  const remaining = allKeys
    .filter((key) => !seen.has(key))
    .sort();
  return [...priorityOrdered, ...remaining];
}
