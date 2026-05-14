export type {
  FridgeMealErrorResult,
  FridgeMealCaloriesBand,
  FridgeMealMode,
  FridgeMealNutritionEstimate,
  FridgeMealProteinBand,
  FridgeMealProposalStatus,
  FridgeMealResult,
  FridgeScanCompletionPayload,
  FridgeScanCaptureSource,
  FridgeScanEligibilityResponse,
  FridgeScanRecordState,
  FridgeScanStatus,
  FridgeScanSubmissionResponse,
  FridgeScanWebhookPayload,
} from '@/shared/fridgeScanContract';

export {
  FRIDGE_MEAL_CALORIES_BANDS,
  FRIDGE_MEAL_MAX_DETECTED_INGREDIENTS,
  FRIDGE_MEAL_MAX_GOAL_REASONS,
  FRIDGE_MEAL_MAX_OPTIONAL_ADDITIONS,
  FRIDGE_MEAL_MAX_PREPARATION_STEPS,
  FRIDGE_MEAL_MAX_SUBSTITUTIONS,
  FRIDGE_MEAL_MAX_TIPS,
  FRIDGE_MEAL_MAX_USED_INGREDIENTS,
  FRIDGE_MEAL_MODES,
  FRIDGE_MEAL_PROPOSAL_STATUSES,
  FRIDGE_MEAL_PROTEIN_BANDS,
  FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
  isFridgeMealMode,
  isFridgeMealProposalStatus,
  isFridgeMealResult,
  isFridgeScanCompletionPayload,
  isFridgeScanRecordState,
  normalizeFridgeMealErrorResult,
  normalizeFridgeMealResult,
  normalizeFridgeScanCompletionPayload,
  normalizeFridgeScanRecordState,
} from '@/shared/fridgeScanContract';

import type {
  FridgeMealMode,
  FridgeScanCaptureSource,
  FridgeScanStatus,
} from '@/shared/fridgeScanContract';

export interface FridgeScanSubmission {
  fridgeScanId: string;
  status: FridgeScanStatus;
  imagePath: string;
  remaining: number;
  limit: number;
  queuedAt: string;
  source: FridgeScanCaptureSource;
  selectedMode: FridgeMealMode;
}

export interface PreEncodedFridgeScanImage {
  base64?: string | null;
  width?: number | null;
  height?: number | null;
  source?: FridgeScanCaptureSource;
}

export interface SubmitFridgeScanCaptureInput {
  imageUri: string;
  source: FridgeScanCaptureSource;
  selectedMode: FridgeMealMode;
  locale?: string;
  clientMetadata?: Record<string, unknown>;
  preEncodedJpeg?: PreEncodedFridgeScanImage;
}
