export const FRIDGE_SCAN_IMAGE_BUCKET = 'scan-images';
export const FRIDGE_SCAN_STORAGE_NAMESPACE = 'fridge-scans';
export const FRIDGE_SCAN_PREMIUM_DAILY_LIMIT = 5;
export const FRIDGE_SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FRIDGE_MEAL_RESULT_SCHEMA_VERSION = 1 as const;

export const FRIDGE_SCAN_CAPTURE_SOURCES = ['camera', 'gallery'] as const;
export type FridgeScanCaptureSource =
  (typeof FRIDGE_SCAN_CAPTURE_SOURCES)[number];

export const FRIDGE_SCAN_STATUSES = ['queued', 'processed', 'failed'] as const;
export type FridgeScanStatus = (typeof FRIDGE_SCAN_STATUSES)[number];

export const FRIDGE_MEAL_MODES = ['diet', 'muscle_gain', 'gourmand'] as const;
export type FridgeMealMode = (typeof FRIDGE_MEAL_MODES)[number];

export const FRIDGE_MEAL_PROPOSAL_STATUSES = [
  'complete',
  'needs_additions',
  'limited',
] as const;
export type FridgeMealProposalStatus =
  (typeof FRIDGE_MEAL_PROPOSAL_STATUSES)[number];

export const FRIDGE_MEAL_CALORIES_BANDS = [
  'light',
  'moderate',
  'hearty',
] as const;
export type FridgeMealCaloriesBand =
  (typeof FRIDGE_MEAL_CALORIES_BANDS)[number];

export const FRIDGE_MEAL_PROTEIN_BANDS = [
  'low',
  'medium',
  'high',
] as const;
export type FridgeMealProteinBand = (typeof FRIDGE_MEAL_PROTEIN_BANDS)[number];

export const FRIDGE_MEAL_MAX_DETECTED_INGREDIENTS = 8;
export const FRIDGE_MEAL_MAX_USED_INGREDIENTS = 6;
export const FRIDGE_MEAL_MAX_OPTIONAL_ADDITIONS = 2;
export const FRIDGE_MEAL_MAX_PREPARATION_STEPS = 5;
export const FRIDGE_MEAL_MAX_GOAL_REASONS = 2;
export const FRIDGE_MEAL_MAX_SUBSTITUTIONS = 2;
export const FRIDGE_MEAL_MAX_TIPS = 2;

export const FRIDGE_SCAN_SUBMIT_REQUEST_KEYS = [
  'check_only',
  'source',
  'selected_mode',
  'image_base64',
  'locale',
  'client_metadata',
] as const;

export const FRIDGE_SCAN_COMPLETE_REQUEST_KEYS = [
  'fridge_scan_id',
  'request_id',
  'callback_nonce',
  'success',
  'data',
  'raw_output',
] as const;

export interface FridgeScanEligibilityResponse {
  success: boolean;
  allowed: boolean;
  message: string;
  message_key?: string;
  code?: string;
  request_id?: string;
  remaining: number;
  next_available_date?: number;
  current_count: number;
  limit: number;
  is_premium_required: boolean;
  quota_bypassed?: boolean;
}

export interface FridgeScanSubmissionResponse
  extends FridgeScanEligibilityResponse {
  fridge_scan_id?: string;
  status?: FridgeScanStatus;
  image_path?: string;
  selected_mode?: FridgeMealMode;
}

export interface FridgeMealNutritionEstimate {
  calories_band: FridgeMealCaloriesBand | null;
  protein_band: FridgeMealProteinBand | null;
  note: string | null;
}

export interface FridgeMealResult {
  schema_version: typeof FRIDGE_MEAL_RESULT_SCHEMA_VERSION;
  mode_selected: FridgeMealMode;
  proposal_status: FridgeMealProposalStatus;
  recipe_title: string;
  short_summary: string;
  ingredients_detected: string[];
  ingredients_used: string[];
  optional_additions: string[];
  preparation_steps: string[];
  why_this_fits_the_goal: string[];
  nutrition_estimate: FridgeMealNutritionEstimate;
  substitutions: string[];
  tips: string[];
  caution_note: string | null;
}

export interface FridgeScanRecordState {
  status: FridgeScanStatus;
  selected_mode: FridgeMealMode | null;
  meal_result: FridgeMealResult | null;
  error_code: string | null;
  error_message: string | null;
  processed_at: string | null;
}

export interface FridgeMealErrorResult {
  scan_type: 'error';
  message: string;
}

export interface FridgeScanCompletionPayload {
  fridge_scan_id: string;
  request_id?: string;
  callback_nonce: string;
  success: boolean;
  data: FridgeMealResult | FridgeMealErrorResult;
  raw_output?: unknown;
}

export interface FridgeScanWebhookPayload {
  payload_version: 1;
  request_id: string;
  fridge_scan_id: string;
  callback_nonce: string;
  user_id: string;
  locale: string;
  source: FridgeScanCaptureSource;
  selected_mode: FridgeMealMode;
  queued_at: string;
  image_base64: string;
  image: {
    bucket: string;
    path: string;
    content_type: 'image/jpeg';
  };
  client_metadata: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readOptionalTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeStringArray(
  value: unknown,
  options: {
    maxItems: number;
    minimumItems?: number;
    allowMissing?: boolean;
  },
): string[] | null {
  if (value == null && options.allowMissing) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const text = readOptionalTrimmedString(item);
    if (!text || seen.has(text)) {
      continue;
    }

    normalized.push(text);
    seen.add(text);

    if (normalized.length >= options.maxItems) {
      break;
    }
  }

  if ((options.minimumItems ?? 0) > normalized.length) {
    return null;
  }

  return normalized;
}

function normalizeNullableEnum<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): TValue | null {
  if (value == null) {
    return null;
  }

  return typeof value === 'string' && allowed.includes(value as TValue)
    ? (value as TValue)
    : null;
}

export function isFridgeScanCaptureSource(
  value: unknown,
): value is FridgeScanCaptureSource {
  return (
    typeof value === 'string' &&
    FRIDGE_SCAN_CAPTURE_SOURCES.includes(value as FridgeScanCaptureSource)
  );
}

export function isFridgeScanStatus(value: unknown): value is FridgeScanStatus {
  return (
    typeof value === 'string' &&
    FRIDGE_SCAN_STATUSES.includes(value as FridgeScanStatus)
  );
}

export function isFridgeMealMode(value: unknown): value is FridgeMealMode {
  return (
    typeof value === 'string' &&
    FRIDGE_MEAL_MODES.includes(value as FridgeMealMode)
  );
}

export function isFridgeMealProposalStatus(
  value: unknown,
): value is FridgeMealProposalStatus {
  return (
    typeof value === 'string' &&
    FRIDGE_MEAL_PROPOSAL_STATUSES.includes(value as FridgeMealProposalStatus)
  );
}

export function isFridgeMealCaloriesBand(
  value: unknown,
): value is FridgeMealCaloriesBand {
  return (
    typeof value === 'string' &&
    FRIDGE_MEAL_CALORIES_BANDS.includes(value as FridgeMealCaloriesBand)
  );
}

export function isFridgeMealProteinBand(
  value: unknown,
): value is FridgeMealProteinBand {
  return (
    typeof value === 'string' &&
    FRIDGE_MEAL_PROTEIN_BANDS.includes(value as FridgeMealProteinBand)
  );
}

export function normalizeFridgeMealResult(
  value: unknown,
): FridgeMealResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const schemaVersion = value.schema_version;
  if (schemaVersion !== FRIDGE_MEAL_RESULT_SCHEMA_VERSION) {
    return null;
  }

  const modeSelected = value.mode_selected;
  const proposalStatus = value.proposal_status;

  if (
    !isFridgeMealMode(modeSelected) ||
    !isFridgeMealProposalStatus(proposalStatus)
  ) {
    return null;
  }

  const recipeTitle = readOptionalTrimmedString(value.recipe_title);
  const shortSummary = readOptionalTrimmedString(value.short_summary);
  const ingredientsDetected = normalizeStringArray(
    value.ingredients_detected,
    {
      maxItems: FRIDGE_MEAL_MAX_DETECTED_INGREDIENTS,
      minimumItems: 1,
    },
  );
  const ingredientsUsed = normalizeStringArray(value.ingredients_used, {
    maxItems: FRIDGE_MEAL_MAX_USED_INGREDIENTS,
    minimumItems: 1,
  });
  const preparationSteps = normalizeStringArray(value.preparation_steps, {
    maxItems: FRIDGE_MEAL_MAX_PREPARATION_STEPS,
    minimumItems: 1,
  });
  const whyThisFitsTheGoal = normalizeStringArray(
    value.why_this_fits_the_goal,
    {
      maxItems: FRIDGE_MEAL_MAX_GOAL_REASONS,
      minimumItems: 1,
    },
  );
  const substitutions = normalizeStringArray(value.substitutions, {
    maxItems: FRIDGE_MEAL_MAX_SUBSTITUTIONS,
    allowMissing: true,
  });
  const tips = normalizeStringArray(value.tips, {
    maxItems: FRIDGE_MEAL_MAX_TIPS,
    allowMissing: true,
  });
  const optionalAdditions = normalizeStringArray(value.optional_additions, {
    maxItems: FRIDGE_MEAL_MAX_OPTIONAL_ADDITIONS,
    allowMissing: true,
  });

  if (
    !recipeTitle ||
    !shortSummary ||
    !ingredientsDetected ||
    !ingredientsUsed ||
    !preparationSteps ||
    !whyThisFitsTheGoal ||
    !substitutions ||
    !tips ||
    !optionalAdditions
  ) {
    return null;
  }

  if (!ingredientsUsed.every((item) => ingredientsDetected.includes(item))) {
    return null;
  }

  if (proposalStatus === 'complete' && optionalAdditions.length > 0) {
    return null;
  }

  if (
    proposalStatus === 'needs_additions' &&
    optionalAdditions.length === 0
  ) {
    return null;
  }

  const nutritionEstimateValue = value.nutrition_estimate;
  if (!isRecord(nutritionEstimateValue)) {
    return null;
  }

  const nutritionEstimate: FridgeMealNutritionEstimate = {
    calories_band: normalizeNullableEnum(
      nutritionEstimateValue.calories_band,
      FRIDGE_MEAL_CALORIES_BANDS,
    ),
    protein_band: normalizeNullableEnum(
      nutritionEstimateValue.protein_band,
      FRIDGE_MEAL_PROTEIN_BANDS,
    ),
    note: readOptionalTrimmedString(nutritionEstimateValue.note),
  };

  return {
    schema_version: FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
    mode_selected: modeSelected,
    proposal_status: proposalStatus,
    recipe_title: recipeTitle,
    short_summary: shortSummary,
    ingredients_detected: ingredientsDetected,
    ingredients_used: ingredientsUsed,
    optional_additions: optionalAdditions,
    preparation_steps: preparationSteps,
    why_this_fits_the_goal: whyThisFitsTheGoal,
    nutrition_estimate: nutritionEstimate,
    substitutions,
    tips,
    caution_note: readOptionalTrimmedString(value.caution_note),
  };
}

export function isFridgeMealResult(value: unknown): value is FridgeMealResult {
  return normalizeFridgeMealResult(value) !== null;
}

export function normalizeFridgeScanRecordState(
  value: unknown,
): FridgeScanRecordState | null {
  if (!isRecord(value) || !isFridgeScanStatus(value.status)) {
    return null;
  }

  const mealResult =
    value.meal_result == null ? null : normalizeFridgeMealResult(value.meal_result);

  if (value.meal_result != null && !mealResult) {
    return null;
  }

  return {
    status: value.status,
    selected_mode: normalizeNullableEnum(value.selected_mode, FRIDGE_MEAL_MODES),
    meal_result: mealResult,
    error_code: readOptionalTrimmedString(value.error_code),
    error_message: readOptionalTrimmedString(value.error_message),
    processed_at: readOptionalTrimmedString(value.processed_at),
  };
}

export function normalizeFridgeMealErrorResult(
  value: unknown,
): FridgeMealErrorResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const scanType = value.scan_type;
  const message = readOptionalTrimmedString(value.message);

  if (scanType !== 'error' || !message) {
    return null;
  }

  return {
    scan_type: 'error',
    message,
  };
}

export function normalizeFridgeScanCompletionPayload(
  value: unknown,
): FridgeScanCompletionPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const fridgeScanId = readOptionalTrimmedString(value.fridge_scan_id);
  const requestId = readOptionalTrimmedString(value.request_id);
  const callbackNonce = readOptionalTrimmedString(value.callback_nonce);
  const success = typeof value.success === 'boolean' ? value.success : null;

  if (!fridgeScanId || !callbackNonce || success === null) {
    return null;
  }

  const data = success
    ? normalizeFridgeMealResult(value.data)
    : normalizeFridgeMealErrorResult(value.data);

  if (!data) {
    return null;
  }

  return {
    fridge_scan_id: fridgeScanId,
    ...(requestId ? { request_id: requestId } : {}),
    callback_nonce: callbackNonce,
    success,
    data,
    ...(value.raw_output !== undefined ? { raw_output: value.raw_output } : {}),
  };
}

export function isFridgeScanCompletionPayload(
  value: unknown,
): value is FridgeScanCompletionPayload {
  return normalizeFridgeScanCompletionPayload(value) !== null;
}

export function isFridgeScanRecordState(
  value: unknown,
): value is FridgeScanRecordState {
  return normalizeFridgeScanRecordState(value) !== null;
}

export function buildCanonicalFridgeScanImagePath(userId: string, scanId: string) {
  return `${userId}/${FRIDGE_SCAN_STORAGE_NAMESPACE}/${scanId}.jpg`;
}

export function buildFridgeScanSubmitRequest(input: {
  checkOnly?: boolean;
  source?: FridgeScanCaptureSource;
  selectedMode?: FridgeMealMode;
  imageBase64?: string;
  locale?: string;
  clientMetadata?: Record<string, unknown>;
}) {
  const normalizedLocale =
    typeof input.locale === 'string' && input.locale.trim().length > 0
      ? input.locale.trim()
      : undefined;

  return {
    ...(input.checkOnly ? { check_only: true } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.selectedMode ? { selected_mode: input.selectedMode } : {}),
    ...(input.imageBase64 ? { image_base64: input.imageBase64 } : {}),
    ...(normalizedLocale ? { locale: normalizedLocale } : {}),
    ...(input.clientMetadata ? { client_metadata: input.clientMetadata } : {}),
  };
}

export function buildFridgeScanWebhookPayload(input: {
  requestId: string;
  fridgeScanId: string;
  userId: string;
  locale: string;
  source: FridgeScanCaptureSource;
  selectedMode: FridgeMealMode;
  callbackNonce: string;
  queuedAt: string;
  imageBase64: string;
  imagePath: string;
  clientMetadata?: Record<string, unknown>;
}): FridgeScanWebhookPayload {
  return {
    payload_version: 1,
    request_id: input.requestId,
    fridge_scan_id: input.fridgeScanId,
    callback_nonce: input.callbackNonce,
    user_id: input.userId,
    locale: input.locale,
    source: input.source,
    selected_mode: input.selectedMode,
    queued_at: input.queuedAt,
    image_base64: input.imageBase64,
    image: {
      bucket: FRIDGE_SCAN_IMAGE_BUCKET,
      path: input.imagePath,
      content_type: 'image/jpeg',
    },
    client_metadata: input.clientMetadata ?? {},
  };
}

export function buildFridgeScanCompletionPayload(input: {
  fridgeScanId: string;
  success: boolean;
  data: FridgeMealResult | FridgeMealErrorResult;
  callbackNonce: string;
  requestId?: string;
  rawOutput?: unknown;
}): FridgeScanCompletionPayload {
  return {
    fridge_scan_id: input.fridgeScanId,
    ...(input.requestId ? { request_id: input.requestId } : {}),
    callback_nonce: input.callbackNonce,
    success: input.success,
    data: input.data,
    ...(input.rawOutput !== undefined ? { raw_output: input.rawOutput } : {}),
  };
}
