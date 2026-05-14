import type { LocaleCode } from '@/i18n/config';
import type {
  CoachPersonaDefinition,
  CoachPersonaKey,
} from '@/shared/coachPersonas';
import type {
  CoachQuestionHints,
  CoachQuestionKey,
} from '@/shared/coachQuestions';
import type {
  CoachGenerationPromptType,
  CoachPromptType,
} from '@/shared/coachPromptTypes';
import type {
  CoachConfidence,
  CoachMetricDirection,
  CoachMetricInterpretation,
  CoachMetricMagnitude,
  CoachPrimaryMetricDelta,
  CoachResponseVersion,
  CoachStructuredContent,
} from '@/shared/coachContent';
import type {
  CoachScanIntentPayload,
  ScanCoachIntent,
  ScanCoachIntentSeverity,
} from '@/shared/scanCoachIntent';
export type { CoachPersonaDefinition, CoachPersonaKey } from '@/shared/coachPersonas';
export type { CoachQuestionHints, CoachQuestionKey } from '@/shared/coachQuestions';
export type {
  CoachGenerationPromptType,
  CoachPromptType,
} from '@/shared/coachPromptTypes';
export type {
  CoachScanIntentPayload,
  ScanCoachIntent,
  ScanCoachIntentSeverity,
} from '@/shared/scanCoachIntent';
export type {
  CoachConfidence,
  CoachMetricDirection,
  CoachMetricInterpretation,
  CoachMetricMagnitude,
  CoachPrimaryMetricDelta,
  CoachProfileUpdateFocus,
  CoachProfileUpdateStructured,
  CoachResponseVersion,
  CoachStructuredContent,
} from '@/shared/coachContent';

export interface Product {
  id: number;
  name: string;
  imageUrl: string;
  benefits: string[];
  shopUrl: string;
}

export interface GamificationData {
  scanCount: number;
  mascotStage: number;
  mascotFilename: string;
  mascotImageUrl: string;
}

export interface DashboardData {
  healthScore: number;
  calories: {
    current: number;
    goal: number;
  };
  bodyfat: number;
  gamification: GamificationData;
}

export interface HealthScoreHistoryItem {
  date: string;
  value: number;
}

export interface CalorieHistoryItem {
  date: string;
  consumed: number;
  goal: number;
}

export interface BodyCompositionHistoryItem {
  date: string;
  bodyfat: number;
  muscle: number;
}

// Nouvelles interfaces pour les métriques étendues
export interface BodyScoreHistoryItem {
  date: string;
  bodyScore: number;
  bodyFatPercentage: number;
  strengthIndex: number;
  postureScore: number;
  bodySymmetry: number;
  metabolicAge: number;
}

export interface FaceScoreHistoryItem {
  date: string;
  faceScore: number;
  skinQualityScore: number;
  symmetryPercentage: number;
  energyScore: number;
  hydrationLevel: number;
  collagenLevel: number;
}

export interface NutritionHistoryItem {
  date: string;
  caloriesEstimate: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  satietyIndex: number;
  nutritionScore: number;
}

export interface SuperScanHistoryItem {
  date: string;
  globalRiskScore: number;
}

export type SupportedLocale = LocaleCode;

export type LocalizedTextMap = Partial<Record<SupportedLocale, string>>;

export interface LocalizedTextDescriptor {
  locale?: SupportedLocale | string;
  default?: string;
  text?: string;
  value?: string;
  translations?: LocalizedTextMap;
}

export type LocalizedTextValue = string | LocalizedTextMap | LocalizedTextDescriptor;

export type AnalyticsPeriod = '7days' | '30days' | '3months' | '1year';

export interface AnalyticsData {
  period: AnalyticsPeriod;
  healthScoreHistory: HealthScoreHistoryItem[];
  calorieHistory: CalorieHistoryItem[];
  bodyCompositionHistory: BodyCompositionHistoryItem[];
  // Nouvelles données
  bodyScoreHistory: BodyScoreHistoryItem[];
  faceScoreHistory: FaceScoreHistoryItem[];
  nutritionHistory: NutritionHistoryItem[];
  superScanHistory: SuperScanHistoryItem[];
}

export type ScanType = 'body' | 'health' | 'nutrition' | 'super';

export interface ScanResult {
  type: 'muscle' | 'fat';
  percentage: number;
  imageUrl: string;
}

export interface ScanLimitStatus {
  scanType: ScanType;
  currentCount: number;
  isLimitReached: boolean;
}

export interface Recipe {
  id: number;
  name: string;
  imageUrl: string;
  preparationTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Exercise {
  id: number;
  name: string;
  imageUrl: string;
  duration: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export type AccountTier = 'free' | 'premium' | 'admin';

export type OAuthProvider = 'google' | 'apple' | 'email';

export interface ScanUsageRecord {
  last_scan_date: string | null;
  scan_timestamps: string[];
}

export interface ScanUsage {
  health: ScanUsageRecord;
  body: ScanUsageRecord;
  nutrition: ScanUsageRecord;
  super?: ScanUsageRecord;
}

export interface WelcomeCredits {
  health: number;
  body: number;
  nutrition: number;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  scan_count: number;
  account_tier: AccountTier;
  coach_persona_key: CoachPersonaKey;
  bio: string | null;
  push_token: string | null;
  email_verified: boolean;
  has_seen_tutorial: boolean;
  notification_settings: {
    reminders: boolean;
    achievements: boolean;
    newContent: boolean;
  };
  subscription_status?: 'active' | 'inactive' | 'canceled' | 'past_due' | 'expired';
  subscription_expiry_date?: string | null;
  subscription_platform?: 'ios' | 'android' | 'stripe' | 'web' | null;
  scan_usage: ScanUsage;
  welcome_credits: WelcomeCredits;
  last_scan_date: string | null;
  account_created_at: string;
  created_at: string;
  updated_at: string;
  language_code?: string | null;
  country_code?: string | null;
  inferred_persona?: PersistedInferredPersona | null;
}

export interface OAuthConnection {
  id: string;
  user_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  provider_email: string | null;
  linked_at: string;
  metadata: Record<string, any>;
}

export interface PremiumFeature {
  id: string;
  feature_key: string;
  feature_name: string;
  feature_description: string | null;
  free_tier_description: string | null;
  premium_tier_description: string | null;
  requires_premium: boolean;
  category: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DisposableEmailDomain {
  id: string;
  domain: string;
  added_at: string;
  added_by: string | null;
  active: boolean;
  notes: string | null;
}

export interface ScanEligibilityResponse {
  success: boolean;
  allowed: boolean;
  message: string;
  message_key?: string;
  code?: string;
  request_id?: string;
  scanType?: ScanType | string;
  remaining?: number;
  available?: number;
  used?: number;
  next_available_date?: number;
  next_recharge_at?: number;
  nextRechargeAt?: string | number;
  server_now_ms?: number;
  server_clock_offset_ms?: number;
  current_count?: number;
  limit?: number;
  scan_id?: string;
  error?: string;
  used_welcome_credit?: boolean;
  remaining_welcome_credits?: number;
  welcome_credits?: number;
}

export interface ScanLimitConfig {
  count: number;
  periodMs: number;
  label: string;
}

export interface VerificationCode {
  id: string;
  user_id: string;
  email: string;
  code: string;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

export interface TrustedDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_name: string;
  last_used_at: string;
  created_at: string;
}

export interface N8nNutritionData {
  productName: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  ingredients?: string[];
  allergens?: string[];
  nutritionScore?: number;
  healthScore?: number;
  recommendations?: string[];
}

export interface Scan {
  id: string;
  user_id: string;
  scan_type: ScanType;
  image_url: string | null;
  image_path?: string | null;
  used_welcome_credit?: boolean;
  analysis_result?: N8nNutritionData | StoredAnalysisResult;
  analyzed_at?: string;
  created_at: string;
}

export interface PremiumPotentialHistoryPoint {
  date: string;
  score: number;
}

export interface PremiumPotentialInputs {
  scanType: ScanType;
  currentScan: Scan | null;
  historicalAverage30d: number | null;
  scanCountTotal: number;
  recentScoreHistory: PremiumPotentialHistoryPoint[];
}

// Types pour les résultats d'analyse ChatGPT (visage, corps, plat)
// Types pour les résultats d'analyse ChatGPT (visage, corps, plat)
export type NormalizedAnalysisSchemaVersion = 3 | 4;

export interface NormalizedAnalysisBase {
  schema_version: NormalizedAnalysisSchemaVersion;
}

export interface LegacyNormalizedAnalysisBase {
  schema_version: 2;
}

export type ScanAnalysisLimitationFlag =
  | 'blur'
  | 'low_light'
  | 'partial_subject'
  | 'occlusion'
  | 'portion_uncertain';

export interface ScanAnalysisMeta {
  confidence_score: number | null;
  image_quality_score: number | null;
  metric_coverage_score: number | null;
  limitation_flags: ScanAnalysisLimitationFlag[];
}

export type ScanCatalogKey = string;
export type ScanVitaminKey = string;
export type SuperScanCatalogKey = string;

export type ConditionSeverity = 'low' | 'moderate' | 'high' | 'unknown';
export type LegacyConditionSeverity = 'Faible' | 'Modérée' | 'Élevée' | string;

export type SuperAnalysisType =
  | 'super_health_v2'
  | 'fat_distribution_scan_v2';
export type AnalysisType = 'face' | 'body' | 'nutrition' | SuperAnalysisType;

export interface LegacyScanFaceResult {
  scan_type: 'face';
  analysis_locale?: SupportedLocale | string;
  analysis_meta?: ScanAnalysisMeta | null;
  face_score: number;
  perceived_age: number;
  skin_quality_score: number;
  symmetry_percentage: number;
  fatigue_level: number;
  glow_index?: number | null;
  energy_score?: number | null;
  face_shape?: LocalizedTextValue;
  face_shape_code?: string | null;
  face_shape_i18n?: unknown;
  collagen_level: number;
  hydration_level: number;
  photogenic_score: number;
}

export interface LegacyNormalizedScanFaceResult extends LegacyNormalizedAnalysisBase {
  scan_type: 'face';
  analysis_meta?: ScanAnalysisMeta | null;
  face_score: number;
  perceived_age: number;
  skin_quality_score: number;
  symmetry_percentage: number;
  fatigue_level: number;
  glow_index?: number | null;
  energy_score?: number | null;
  face_shape_key: ScanCatalogKey;
  face_shape_fallback_text?: string | null;
  collagen_level: number;
  hydration_level: number;
  photogenic_score: number;
}

export interface ScanFaceResult extends NormalizedAnalysisBase {
  scan_type: 'face';
  analysis_meta?: ScanAnalysisMeta | null;
  face_score: number;
  perceived_age: number;
  skin_quality_score: number;
  symmetry_percentage: number;
  fatigue_level: number;
  glow_index?: number | null;
  energy_score?: number | null;
  face_shape_key: ScanCatalogKey;
  face_shape_fallback_text?: string | null;
  collagen_level: number;
  hydration_level: number;
  photogenic_score: number;
  skin_clarity_score?: number | null;
  under_eye_shadow_score?: number | null;
  under_eye_volume_score?: number | null;
  eye_openness_score?: number | null;
  complexion_redness_score?: number | null;
  pore_visibility_score?: number | null;
  skin_evenness_score?: number | null;
  skin_radiance_score?: number | null;
  lip_dryness_score?: number | null;
  forehead_smoothness_score?: number | null;
  t_zone_oiliness_score?: number | null;
  perceived_sex_key?: ScanCatalogKey | null;
  perceived_age_range_key?: ScanCatalogKey | null;
  perceived_stress_level?: number | null;
  perceived_sleep_quality?: number | null;
}

export interface LegacyScanBodyResult {
  scan_type: 'body';
  analysis_locale?: SupportedLocale | string;
  analysis_meta?: ScanAnalysisMeta | null;
  body_score: number;
  body_fat_percentage: number;
  muscle_mass_label?: LocalizedTextValue;
  muscle_mass_code?: string | null;
  muscle_mass_label_i18n?: unknown;
  body_type?: LocalizedTextValue;
  body_type_code?: string | null;
  body_type_i18n?: unknown;
  posture_score: number;
  waist_estimation_cm: number;
  strength_index: number;
  body_symmetry: number;
  bmi_estimate: number;
  metabolic_age: number;
}

export interface LegacyNormalizedScanBodyResult extends LegacyNormalizedAnalysisBase {
  scan_type: 'body';
  analysis_meta?: ScanAnalysisMeta | null;
  body_score: number;
  body_fat_percentage: number;
  muscle_mass_key: ScanCatalogKey;
  muscle_mass_fallback_text?: string | null;
  body_type_key: ScanCatalogKey;
  body_type_fallback_text?: string | null;
  posture_score: number;
  waist_estimation_cm: number;
  strength_index: number;
  body_symmetry: number;
  bmi_estimate: number;
  metabolic_age: number;
}

export interface ScanBodyResult extends NormalizedAnalysisBase {
  scan_type: 'body';
  analysis_meta?: ScanAnalysisMeta | null;
  body_score: number;
  body_fat_percentage: number;
  muscle_mass_key: ScanCatalogKey;
  muscle_mass_fallback_text?: string | null;
  body_type_key: ScanCatalogKey;
  body_type_fallback_text?: string | null;
  posture_score: number;
  waist_estimation_cm: number;
  strength_index: number;
  body_symmetry: number;
  bmi_estimate: number;
  metabolic_age: number;
  muscle_definition_score?: number | null;
  midsection_definition_score?: number | null;
  shoulder_alignment_score?: number | null;
  recovery_readiness_score?: number | null;
  upper_body_definition_score?: number | null;
  lower_body_definition_score?: number | null;
  arm_definition_score?: number | null;
  v_taper_score?: number | null;
  body_tension_indicator_score?: number | null;
  perceived_sex_key?: ScanCatalogKey | null;
  perceived_age_range_key?: ScanCatalogKey | null;
  estimated_height_range_key?: ScanCatalogKey | null;
  estimated_weight_range_key?: ScanCatalogKey | null;
  body_frame_key?: ScanCatalogKey | null;
  perceived_fitness_level_key?: ScanCatalogKey | null;
}

export interface LegacyScanNutritionResult {
  scan_type: 'nutrition';
  analysis_locale?: SupportedLocale | string;
  analysis_meta?: ScanAnalysisMeta | null;
  plate_health_score: number;
  calories_estimate: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  glycemic_index_label?: LocalizedTextValue;
  glycemic_index_code?: string | null;
  glycemic_index_label_i18n?: unknown;
  satiety_index: number;
  ingredient_quality?: LocalizedTextValue;
  ingredient_quality_code?: string | null;
  ingredient_quality_i18n?: unknown;
  main_vitamins?: LocalizedTextValue;
  main_vitamins_i18n?: unknown;
  main_vitamin_keys?: ScanVitaminKey[];
  main_vitamins_fallback_text?: string | null;
  short_verdict?: LocalizedTextValue;
  short_verdict_i18n?: unknown;
  micronutrients?: LocalizedTextValue;
  micronutrients_i18n?: unknown;
  main_micronutrients?: LocalizedTextValue;
  main_micronutrients_i18n?: unknown;
  micronutrient_details?: LocalizedTextValue;
  micronutrient_details_i18n?: unknown;
  nutrition_points?: LocalizedTextValue;
  nutrition_points_i18n?: unknown;
  nutritional_points?: LocalizedTextValue;
  nutritional_points_i18n?: unknown;
  nutrition_highlights?: LocalizedTextValue;
  nutrition_highlights_i18n?: unknown;
  recommendations?: LocalizedTextValue;
  recommendations_i18n?: unknown;
  nutrition_recommendations?: LocalizedTextValue;
  nutrition_recommendations_i18n?: unknown;
  dietary_recommendations?: LocalizedTextValue;
  dietary_recommendations_i18n?: unknown;
  actionable_advice?: LocalizedTextValue;
  actionable_advice_i18n?: unknown;
  dietary_details?: LocalizedTextValue;
  dietary_details_i18n?: unknown;
  food_details?: LocalizedTextValue;
  food_details_i18n?: unknown;
  meal_details?: LocalizedTextValue;
  meal_details_i18n?: unknown;
  plate_analysis?: LocalizedTextValue;
  plate_analysis_i18n?: unknown;
  meal_analysis?: LocalizedTextValue;
  meal_analysis_i18n?: unknown;
  dish_analysis?: LocalizedTextValue;
  dish_analysis_i18n?: unknown;
  analysis_text?: LocalizedTextValue;
  analysis_text_i18n?: unknown;
  estimated_composition?: LocalizedTextValue;
  estimated_composition_i18n?: unknown;
  composition_estimated?: LocalizedTextValue;
  composition_estimated_i18n?: unknown;
  composition_details?: LocalizedTextValue;
  composition_details_i18n?: unknown;
}

export interface LegacyNormalizedScanNutritionResult extends LegacyNormalizedAnalysisBase {
  scan_type: 'nutrition';
  analysis_meta?: ScanAnalysisMeta | null;
  plate_health_score: number;
  calories_estimate: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  verdict_key: ScanCatalogKey;
  verdict_fallback_text?: string | null;
  glycemic_index_key: ScanCatalogKey;
  glycemic_index_fallback_text?: string | null;
  satiety_index: number;
  ingredient_quality_key: ScanCatalogKey;
  ingredient_quality_fallback_text?: string | null;
  main_vitamin_keys: ScanVitaminKey[];
  main_vitamins_fallback_text?: string | null;
}

export interface ScanNutritionResult extends NormalizedAnalysisBase {
  scan_type: 'nutrition';
  analysis_meta?: ScanAnalysisMeta | null;
  plate_health_score: number;
  calories_estimate: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  verdict_key: ScanCatalogKey;
  verdict_fallback_text?: string | null;
  glycemic_index_key: ScanCatalogKey;
  glycemic_index_fallback_text?: string | null;
  satiety_index: number;
  ingredient_quality_key: ScanCatalogKey;
  ingredient_quality_fallback_text?: string | null;
  main_vitamin_keys: ScanVitaminKey[];
  main_vitamins_fallback_text?: string | null;
  micronutrients?: string | null;
  nutrition_points?: string | null;
  recommendations?: string | null;
  dietary_details?: string | null;
  plate_analysis?: string | null;
  estimated_composition?: string | null;
  fiber_grams_estimate?: number | null;
  sugar_grams_estimate?: number | null;
  processing_level_score?: number | null;
  hydration_contribution_score?: number | null;
  sodium_level_score?: number | null;
  meal_balance_score?: number | null;
  inflammation_index_score?: number | null;
  meal_type_key?: ScanCatalogKey | null;
  portion_size_key?: ScanCatalogKey | null;
  color_diversity_score?: number | null;
  vegetable_portion_ratio?: number | null;
  protein_visibility_score?: number | null;
  whole_grain_indicator_score?: number | null;
  meal_freshness_score?: number | null;
  cuisine_type_key?: ScanCatalogKey | null;
  meat_type_key?: ScanCatalogKey | null;
  cooking_method_key?: ScanCatalogKey | null;
  meal_dietary_pattern_key?: ScanCatalogKey | null;
  allergen_visibility_keys?: ScanCatalogKey[];
}

export type AnalysisResult = ScanFaceResult | ScanBodyResult | ScanNutritionResult;
export type LegacyNormalizedAnalysisResult =
  | LegacyNormalizedScanFaceResult
  | LegacyNormalizedScanBodyResult
  | LegacyNormalizedScanNutritionResult;
export type LegacyAnalysisResult =
  | LegacyScanFaceResult
  | LegacyScanBodyResult
  | LegacyScanNutritionResult;
export type ShareStoryVariant = 'face' | 'body' | 'nutrition' | 'super';
export type ShareableAnalysisResult = AnalysisResult | SuperScanResult;
export type ShareStoryMetricValueVariant = 'numeric' | 'fraction' | 'text';

export interface ShareStoryMetric {
  label: string;
  value: string;
  valueVariant: ShareStoryMetricValueVariant;
  labelMaxLines: number;
  valueMaxLines: number;
}

export interface ShareStoryPayload {
  variant: ShareStoryVariant;
  variantLabel: string;
  score: number;
  scoreLabel: string;
  heroImageUri?: string | null;
  metrics: ShareStoryMetric[];
  accentColor: string;
  accentColorSecondary?: string;
  headline?: string;
  footerBrand: string;
  footerCta: string;
  statusBadgeLabel?: string;
  statusTone?: 'neutral' | 'warning';
}

export type SocialComposerDraftAsset =
  | { kind: 'none' }
  | { kind: 'share_story'; payload: ShareStoryPayload }
  | { kind: 'local_image'; imageUri: string };

export interface SocialComposerDraft {
  version: 1;
  id: string;
  source: 'composer' | 'share_story';
  scanId: string | null;
  category: SocialCategory;
  caption: string;
  asset: SocialComposerDraftAsset;
  createdAt: string;
  updatedAt: string;
}

// === Super Scan Types ===

export interface FatDistributionAreaAnalysis {
  area_name: string;
  subcutaneous_fat_percent: number;
  water_retention_percent: number;
  definition_percent: number;
  dominant_type: string;
  confidence: number;
  explanation: string;
  actionable_advice: string;
}

export type FatDistributionPriorityZone = string;

export interface FatDistributionScanResult {
  scan_type: 'fat_distribution_scan_v2';
  global_body_fat_estimate_percent: number | null;
  global_facial_fat_estimate_percent: number | null;
  global_water_retention_estimate_percent: number;
  analysis_summary: string;
  dominant_storage_pattern: string;
  areas_analysis: FatDistributionAreaAnalysis[];
  priority_zones: FatDistributionPriorityZone[];
  disclaimer_text: string;
}

export interface LegacyDetectedCondition {
  condition_name?: string;
  condition_code?: string | null;
  condition_name_i18n?: unknown;
  category?: string;
  category_code?: string | null;
  category_i18n?: unknown;
  probability: number;
  severity: LegacyConditionSeverity;
  explanation?: string;
  explanation_i18n?: unknown;
  actionable_advice?: string;
  actionable_advice_i18n?: unknown;
}

export interface LegacyNormalizedDetectedCondition {
  condition_key: SuperScanCatalogKey;
  condition_fallback_text?: string | null;
  category_key: SuperScanCatalogKey;
  category_fallback_text?: string | null;
  probability: number;
  severity_key: ConditionSeverity;
  explanation_key: SuperScanCatalogKey;
  explanation_fallback_text?: string | null;
  advice_key: SuperScanCatalogKey;
  advice_fallback_text?: string | null;
}

export interface DetectedCondition {
  condition_key: SuperScanCatalogKey;
  condition_fallback_text?: string | null;
  category_key: SuperScanCatalogKey;
  category_fallback_text?: string | null;
  probability: number;
  severity_key: ConditionSeverity;
  explanation_key: SuperScanCatalogKey;
  explanation_fallback_text?: string | null;
  advice_key: SuperScanCatalogKey;
  advice_fallback_text?: string | null;
}

export interface LegacySuperScanResult {
  scan_type: 'super_health_v2';
  analysis_locale?: SupportedLocale | string;
  global_risk_score: number;
  urgency_flag: boolean;
  analysis_summary?: string;
  analysis_summary_i18n?: unknown;
  detected_conditions: LegacyDetectedCondition[];
  disclaimer_text?: string;
  disclaimer_text_i18n?: unknown;
}

export interface LegacyNormalizedSuperScanResult extends LegacyNormalizedAnalysisBase {
  scan_type: 'super_health_v2';
  global_risk_score: number;
  urgency_flag: boolean;
  summary_key: SuperScanCatalogKey;
  summary_fallback_text?: string | null;
  detected_conditions: LegacyNormalizedDetectedCondition[];
  disclaimer_key: SuperScanCatalogKey;
  disclaimer_fallback_text?: string | null;
}

export interface SuperScanResult extends NormalizedAnalysisBase {
  scan_type: 'super_health_v2';
  global_risk_score: number;
  urgency_flag: boolean;
  summary_key: SuperScanCatalogKey;
  summary_fallback_text?: string | null;
  detected_conditions: DetectedCondition[];
  disclaimer_key: SuperScanCatalogKey;
  disclaimer_fallback_text?: string | null;
}

export type SuperScanAnalysisResult =
  | FatDistributionScanResult
  | SuperScanResult
  | LegacyNormalizedSuperScanResult
  | LegacySuperScanResult;

export type StoredAnalysisResult =
  | AnalysisResult
  | SuperScanAnalysisResult
  | LegacyNormalizedAnalysisResult
  | LegacyAnalysisResult;

// === Phase 1 foundations ===

export interface FeatureFlags {
  social_enabled: boolean;
  coach_enabled: boolean;
  entry_offer_enabled: boolean;
  social_comments_enabled: boolean;
}

export type SocialCategory = 'before_after' | 'food' | 'physique';

export type SocialCategoryFilter = 'all' | SocialCategory;

export type SocialAdminModerationFilter =
  | 'needs_review'
  | 'reported'
  | 'processed';

export type ModerationState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'flagged'
  | 'hidden'
  | 'removed';

export type SocialModerationStatus = ModerationState;

export type SocialReportTargetType = 'post' | 'comment';

export type SocialReactionState = 'like' | 'dislike' | 'neutral';

export type SocialReportReasonCode =
  | 'harassment'
  | 'hate_speech'
  | 'sexual_content'
  | 'graphic_gore'
  | 'spam_repeat'
  | 'self_harm'
  | 'illegal_activity'
  | 'misinformation'
  | 'other';

export type SocialModerationAction =
  | 'approve'
  | 'flag'
  | 'hide'
  | 'remove'
  | 'restore'
  | 'reject'
  | 'dismiss_reports';

export type SocialReportWorkflowStatus =
  | 'submitted'
  | 'reviewing'
  | 'resolved'
  | 'dismissed';

export type CoachEntryStatus = 'pending' | 'ready' | 'error';

export type GrowthState =
  | 'baseline'
  | 'entry_offer_ready'
  | 'entry_offer_claimed'
  | 'entry_offer_dismissed'
  | 'coach_ready'
  | 'cooldown';

export interface CoachScanDigest {
  scan_id: string;
  scan_type: ScanType;
  captured_at: string;
  normalized_scan_type:
    | 'face'
    | 'body'
    | 'nutrition'
    | 'super_health_v2'
    | 'fat_distribution_scan_v2';
  metrics: Record<string, unknown>;
}

export type CoachScanIntentSeverity = ScanCoachIntentSeverity;

export type CoachScanIntent = ScanCoachIntent;

export type CoachRelevantFlag =
  | 'has_recent_decline'
  | 'has_recent_improvement'
  | 'low_hydration'
  | 'high_fatigue'
  | 'high_body_fat'
  | 'high_facial_fat'
  | 'high_water_retention'
  | 'low_protein'
  | 'high_risk_scan'
  | 'urgent_attention_flag'
  | 'new_condition_detected'
  | 'low_confidence_scan'
  | 'image_quality_limited'
  | 'partial_metric_coverage'
  | 'low_skin_clarity'
  | 'high_under_eye_shadow'
  | 'high_under_eye_volume'
  | 'low_eye_openness'
  | 'high_complexion_redness'
  | 'low_muscle_definition'
  | 'low_midsection_definition'
  | 'low_shoulder_alignment'
  | 'low_recovery_readiness'
  | 'low_fiber'
  | 'high_sugar_intake'
  | 'high_sodium_intake'
  | 'high_processing_level'
  | 'low_meal_balance'
  | 'high_inflammation_index'
  | 'high_pore_visibility'
  | 'low_skin_evenness'
  | 'low_skin_radiance'
  | 'high_lip_dryness'
  | 'low_upper_body_definition'
  | 'low_lower_body_definition'
  | 'low_arm_definition'
  | 'low_v_taper'
  | 'high_body_tension'
  | 'low_color_diversity'
  | 'low_vegetable_portion'
  | 'low_protein_visibility'
  | 'high_perceived_stress'
  | 'low_perceived_sleep_quality'
  | 'allergen_visible';

export type CoachMetricInterpretationHint =
  | 'higher_is_better'
  | 'lower_is_better'
  | 'neutral_context';

export interface CoachFaceKeyMetrics {
  face_score: number;
  perceived_age: number;
  skin_quality_score: number;
  symmetry_percentage: number;
  fatigue_level: number;
  glow_index: number | null;
  energy_score: number | null;
  face_shape_key: ScanCatalogKey;
  collagen_level: number;
  hydration_level: number;
  photogenic_score: number;
  skin_clarity_score: number | null;
  under_eye_shadow_score: number | null;
  under_eye_volume_score: number | null;
  eye_openness_score: number | null;
  complexion_redness_score: number | null;
  pore_visibility_score: number | null;
  skin_evenness_score: number | null;
  skin_radiance_score: number | null;
  lip_dryness_score: number | null;
  forehead_smoothness_score: number | null;
  t_zone_oiliness_score: number | null;
  perceived_sex_key: ScanCatalogKey | null;
  perceived_age_range_key: ScanCatalogKey | null;
  perceived_stress_level: number | null;
  perceived_sleep_quality: number | null;
}

export interface CoachBodyKeyMetrics {
  body_score: number;
  body_fat_percentage: number;
  muscle_mass_key: ScanCatalogKey;
  body_type_key: ScanCatalogKey;
  posture_score: number;
  waist_estimation_cm: number;
  strength_index: number;
  body_symmetry: number;
  bmi_estimate: number;
  metabolic_age: number;
  muscle_definition_score: number | null;
  midsection_definition_score: number | null;
  shoulder_alignment_score: number | null;
  recovery_readiness_score: number | null;
  upper_body_definition_score: number | null;
  lower_body_definition_score: number | null;
  arm_definition_score: number | null;
  v_taper_score: number | null;
  body_tension_indicator_score: number | null;
  perceived_sex_key: ScanCatalogKey | null;
  perceived_age_range_key: ScanCatalogKey | null;
  estimated_height_range_key: ScanCatalogKey | null;
  estimated_weight_range_key: ScanCatalogKey | null;
  body_frame_key: ScanCatalogKey | null;
  perceived_fitness_level_key: ScanCatalogKey | null;
}

export interface CoachNutritionKeyMetrics {
  plate_health_score: number;
  calories_estimate: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  verdict_key: ScanCatalogKey;
  glycemic_index_key: ScanCatalogKey;
  satiety_index: number;
  ingredient_quality_key: ScanCatalogKey;
  main_vitamin_keys: ScanVitaminKey[];
  fiber_grams_estimate: number | null;
  sugar_grams_estimate: number | null;
  processing_level_score: number | null;
  hydration_contribution_score: number | null;
  sodium_level_score: number | null;
  meal_balance_score: number | null;
  inflammation_index_score: number | null;
  meal_type_key: ScanCatalogKey | null;
  portion_size_key: ScanCatalogKey | null;
  color_diversity_score: number | null;
  vegetable_portion_ratio: number | null;
  protein_visibility_score: number | null;
  whole_grain_indicator_score: number | null;
  meal_freshness_score: number | null;
  cuisine_type_key: ScanCatalogKey | null;
  meat_type_key: ScanCatalogKey | null;
  cooking_method_key: ScanCatalogKey | null;
  meal_dietary_pattern_key: ScanCatalogKey | null;
  allergen_visibility_keys: ScanCatalogKey[];
}

export interface CoachSuperKeyMetrics {
  global_risk_score: number;
  urgency_flag: boolean;
  summary_key: SuperScanCatalogKey;
  disclaimer_key: SuperScanCatalogKey;
  detected_conditions: DetectedCondition[];
}

export interface CoachFatDistributionKeyMetrics {
  global_body_fat_estimate_percent: number | null;
  global_facial_fat_estimate_percent: number | null;
  global_water_retention_estimate_percent: number;
  analysis_summary: string;
  dominant_storage_pattern: string;
  priority_zones: FatDistributionPriorityZone[];
  area_count: number;
}

export type CoachKeyMetrics =
  | CoachFaceKeyMetrics
  | CoachBodyKeyMetrics
  | CoachNutritionKeyMetrics
  | CoachSuperKeyMetrics
  | CoachFatDistributionKeyMetrics;

export interface CoachScanRichContext {
  scan_id: string;
  scan_type: ScanType;
  normalized_scan_type: CoachScanDigest['normalized_scan_type'];
  captured_at: string;
  analysis_result_normalized:
    | AnalysisResult
    | SuperScanResult
    | FatDistributionScanResult;
  analysis_meta: ScanAnalysisMeta | null;
  key_metrics: CoachKeyMetrics;
  raw_fallback_fields: Record<string, unknown> | null;
  coach_relevant_flags: CoachRelevantFlag[];
}

export interface CoachMetricDelta {
  metric: string;
  current_value: number;
  previous_value: number;
  delta: number;
  direction: CoachMetricDirection;
  interpretation_hint: CoachMetricInterpretationHint;
}

export interface CoachComparisonToPrevious {
  available: boolean;
  compared_scan_id: string | null;
  metric_deltas: CoachMetricDelta[];
}

export interface CoachTrendMetric extends CoachMetricDelta {
  sample_count: number;
}

export interface CoachTrendSummary {
  available: boolean;
  scan_type: ScanType | null;
  summary_flags: string[];
  score_trend: CoachTrendMetric | null;
  metric_trends: CoachTrendMetric[];
}

export type InferredPersonaConfidence = 'low' | 'medium' | 'high';
export type CoachEngagementLevel = 'low' | 'medium' | 'high';
export type PersonaFieldSourceKind = 'declare' | 'infere';

export interface CoachDataReliabilityComponents {
  sample_size_percent: number;
  recency_percent: number;
  consistency_percent: number;
  image_quality_percent: number;
  coverage_percent: number;
}

export interface CoachDataReliability {
  overall_percent: number;
  components: CoachDataReliabilityComponents;
  caveats: string[];
}

export type CoachScanFrequencyLabel =
  | 'sporadic'
  | 'regular'
  | 'daily'
  | 'unknown';

export type CoachPreferredTimeOfDay =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'mixed'
  | 'unknown';

export type CoachWeekdayWeekendBalance =
  | 'weekday_heavy'
  | 'weekend_heavy'
  | 'balanced'
  | 'unknown';

export type CoachDormancyRiskLevel = 'low' | 'medium' | 'high';

export interface CoachTemporalPatterns {
  last_scan_days_ago: number | null;
  scans_last_7d: number;
  scans_last_30d: number;
  scan_frequency_label: CoachScanFrequencyLabel;
  preferred_time_of_day_key: CoachPreferredTimeOfDay;
  weekday_weekend_balance: CoachWeekdayWeekendBalance;
  longest_streak_days: number;
  current_streak_days: number;
  dormancy_risk_level: CoachDormancyRiskLevel;
}

export type CoachPrimaryGoalKey =
  | 'weight_loss'
  | 'muscle_gain'
  | 'skin_health'
  | 'sleep_recovery'
  | 'general_wellness'
  | 'sport_performance'
  | 'unclear';

export interface CoachGoalInference {
  primary_goal_key: CoachPrimaryGoalKey;
  confidence: InferredPersonaConfidence | null;
  motivation_indicators: string[];
}

export type CoachLifestyleArchetypeKey =
  | 'active_athlete'
  | 'wellness_seeker'
  | 'aesthetic_focused'
  | 'health_recovery'
  | 'casual_explorer'
  | 'unclear';

export interface CoachLifestyleSignature {
  archetype_key: CoachLifestyleArchetypeKey;
  stress_indicator_aggregate: number | null;
  sleep_indicator_aggregate: number | null;
  hydration_indicator_aggregate: number | null;
  recovery_indicator_aggregate: number | null;
}

export interface CoachNutritionProfile {
  dietary_diversity_score: number | null;
  cuisine_preference_keys: string[];
  cooking_method_preference_keys: string[];
  dominant_meat_type_key: string | null;
  meal_timing_distribution: Record<string, number>;
  processing_level_average: number | null;
  sugar_intake_average_grams: number | null;
  fiber_intake_average_grams: number | null;
  protein_intake_average_grams: number | null;
}

export type CoachTrajectoryDirection =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'unknown';

export interface CoachTrajectoryEntry {
  metric: string;
  scan_type: ScanType;
  direction: CoachTrajectoryDirection;
  delta: number | null;
  sample_count: number;
}

export interface CoachTrajectoryMap {
  body_score: CoachTrajectoryEntry;
  face_score: CoachTrajectoryEntry;
  plate_health_score: CoachTrajectoryEntry;
  body_fat_percentage: CoachTrajectoryEntry;
  hydration_level: CoachTrajectoryEntry;
  fatigue_level: CoachTrajectoryEntry;
  muscle_definition_score: CoachTrajectoryEntry;
}

export type CoachRiskLevel = 'low' | 'moderate' | 'elevated' | 'unknown';

export interface CoachRiskSignals {
  cardiovascular_risk_level_key: CoachRiskLevel;
  cardiovascular_risk_drivers: string[];
  metabolic_risk_level_key: CoachRiskLevel;
  metabolic_risk_drivers: string[];
  inflammation_risk_level_key: CoachRiskLevel;
  inflammation_risk_drivers: string[];
}

export type CoachRecommendationTone =
  | 'supportive_gentle'
  | 'direct_motivating'
  | 'neutral_informative'
  | 'celebratory'
  | 'cautious';

export interface CoachRecommendations {
  recommended_emphasis: string[];
  topics_to_avoid: string[];
  suggested_tone_key: CoachRecommendationTone;
  next_scan_focus_suggestion_key: ScanType | null;
}

export interface CoachInferredMetricSignal {
  metric: string;
  scan_type: ScanType;
  average_value: number;
  sample_count: number;
  interpretation_hint: CoachMetricInterpretationHint;
}

export interface CoachInferredPersonaField<T = string> {
  value: T | null;
  source: PersonaFieldSourceKind;
  confidence: InferredPersonaConfidence | null;
  sample_count: number;
}

export interface CoachInferredPersona {
  apparent_sex: CoachInferredPersonaField;
  apparent_age_range: CoachInferredPersonaField;
  apparent_height_range: CoachInferredPersonaField;
  apparent_weight_range: CoachInferredPersonaField;
  apparent_body_frame: CoachInferredPersonaField;
  apparent_fitness_level: CoachInferredPersonaField;
  dominant_scan_focus: CoachInferredPersonaField<ScanType>;
  dietary_signals: string[];
  recurring_allergen_signals: string[];
  engagement_level: CoachEngagementLevel;
  weak_metrics: CoachInferredMetricSignal[];
  strong_metrics: CoachInferredMetricSignal[];
  scan_count_total: number;
  inferred_confidence: InferredPersonaConfidence;
  data_reliability: CoachDataReliability;
  temporal_patterns: CoachTemporalPatterns;
  goal_inference: CoachGoalInference;
  lifestyle_signature: CoachLifestyleSignature;
  nutrition_profile: CoachNutritionProfile;
  trajectories: CoachTrajectoryMap;
  risk_signals: CoachRiskSignals;
  anomalies: string[];
  coach_recommendations: CoachRecommendations;
}

export interface CoachProfileUpdate {
  detected_diet_signals: string[];
  detected_strong_focus: ScanType | null;
  suggested_goals: string[];
  suggested_persona_key: CoachPersonaKey | null;
}

export interface PersistedInferredPersona {
  detected_diet_signals: string[];
  detected_strong_focus: ScanType | null;
  suggested_goals: string[];
  suggested_persona_key: CoachPersonaKey | null;
  last_updated_at: string;
  update_count: number;
}

export interface CoachGuidancePayload {
  payload_version: 2;
  prompt_type: CoachGenerationPromptType;
  question_key?: CoachQuestionKey | null;
  question_text?: string | null;
  question_hints?: CoachQuestionHints | null;
  generated_at: string;
  scan_count_7d: number;
  selected_scan_id?: string | null;
  scan_intent?: CoachScanIntentPayload | null;
  selected_scan: CoachScanDigest | null;
  recent_scans: CoachScanDigest[];
  by_type?: Partial<Record<ScanType, CoachScanDigest | null>>;
  latest_scan: CoachScanRichContext | null;
  prior_scans: CoachScanRichContext[];
  latest_by_type: Record<ScanType, CoachScanRichContext | null>;
  comparison_to_previous: CoachComparisonToPrevious;
  trend_summary: CoachTrendSummary;
  inferred_persona: CoachInferredPersona | null;
  coach_profile_memory: PersistedInferredPersona | null;
}

export interface SocialPost {
  id: string;
  author_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  category: SocialCategory;
  content_text: string;
  scan_id?: string | null;
  share_payload_snapshot?: ShareStoryPayload | null;
  asset_path?: string | null;
  asset_url?: string | null;
  image_url: string | null;
  created_at: string;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  viewer_visible_comment_count?: number | null;
  viewer_reaction: SocialReactionState;
  viewer_has_liked: boolean;
  moderation_status: SocialModerationStatus;
  moderation_state?: ModerationState;
  moderation_reason?: string | null;
  moderation_provider?: string | null;
  rejection_count?: number;
  last_rejected_at?: string | null;
  deleted_at?: string | null;
  language_code?: string | null;
  country_code?: string | null;
}

export interface SocialPublicProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  account_created_at: string | null;
  created_at: string;
  scan_count: number;
}

export interface SocialComment {
  id: string;
  post_id: string;
  author_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  content_text: string;
  created_at: string;
  like_count: number;
  viewer_has_liked: boolean;
  moderation_status: SocialModerationStatus;
  moderation_state?: ModerationState;
  moderation_reason?: string | null;
  moderation_provider?: string | null;
  rejection_count?: number;
  last_rejected_at?: string | null;
  deleted_at?: string | null;
}

export interface SocialViewerPostState {
  visibleCommentCount?: number;
}

export type SocialViewerState = Record<string, SocialViewerPostState>;

export interface SocialFeedPage {
  items: SocialPost[];
  next_cursor: string | null;
}

export interface SocialCommentsPage {
  items: SocialComment[];
  next_cursor: string | null;
}

export interface CoachEntry {
  id: string;
  title: string | null;
  body: string | null;
  disclaimer: string;
  persona_key: CoachPersonaKey;
  has_valid_persona?: boolean;
  prompt_type?: CoachGenerationPromptType | null;
  question_key?: CoachQuestionKey | null;
  question_text?: string | null;
  response_version?: CoachResponseVersion | null;
  content?: CoachStructuredContent | null;
  cta_label: string | null;
  cta_route: string | null;
  created_at: string;
  source: string | null;
  locale?: string | null;
  user_id?: string;
  status?: CoachEntryStatus | null;
  error_code?: string | null;
  cache_key?: string | null;
  input_hash?: string | null;
  request_payload_json?: Record<string, unknown> | null;
  response_payload_json?: Record<string, unknown> | null;
  expires_at?: string | null;
  generated_at?: string | null;
}

export interface CoachQuotaStatus {
  account_tier: AccountTier;
  limit: number | null;
  used_count: number;
  available: number | null;
  next_recharge_at: string | null;
  unlimited: boolean;
  window_seconds: number;
  as_of: string;
}

export interface UserGrowthExperience {
  user_id: string;
  growth_state: GrowthState;
  entry_offer_eligible: boolean;
  entry_offer_shown_at: string | null;
  entry_offer_dismissed_at: string | null;
  entry_offer_claimed_at: string | null;
  entry_offer_offering_id: string | null;
  coach_seen_at: string | null;
  coach_cooldown_until: string | null;
  growth_state_updated_at: string;
  created_at?: string;
  updated_at: string;
}

export interface Phase2FeatureFlags extends FeatureFlags {
  scope: string;
  moderation_enabled: boolean;
  entry_offer_offering_id: string | null;
  rollout_percentage: number | null;
  post_rate_limit_per_day: number;
  comment_rate_limit_per_hour: number;
  report_rate_limit_per_day: number;
  repeated_rejection_threshold: number;
  rejected_content_cooldown_hours: number;
  coach_cache_ttl_minutes: number;
}

export interface SocialCreatePostRequest {
  category: SocialCategory;
  content_text?: string;
  upload_id?: string;
  reserved_asset_path?: string;
  scan_id?: string;
  share_payload_snapshot?: ShareStoryPayload;
  language_code?: string;
}

export interface Phase2RateLimitResult {
  allowed: boolean;
  limit_count: number;
  window_seconds: number;
  recent_count: number;
  retry_after_seconds: number;
}

export interface Phase2RejectionCooldownResult {
  active: boolean;
  cooldown_until: string | null;
  recent_rejection_count: number;
  rejection_threshold: number;
  cooldown_hours: number;
}

export interface SocialCreatePostResponse {
  success: true;
  post_id: string;
  moderation_state: ModerationState;
  published: boolean;
  asset_url: string | null;
  rate_limit: Phase2RateLimitResult;
  cooldown: Phase2RejectionCooldownResult;
}

export interface SocialCreateCommentRequest {
  post_id: string;
  content_text: string;
}

export interface SocialCreateCommentResponse {
  success: true;
  comment_id: string;
  post_id: string;
  moderation_state: ModerationState;
  published: boolean;
  rate_limit: Phase2RateLimitResult;
  cooldown: Phase2RejectionCooldownResult;
}

export interface SocialUpdateCommentRequest {
  comment_id: string;
  content_text: string;
}

export interface SocialUpdateCommentResponse {
  success: true;
  comment: SocialComment;
}

export interface SocialDeleteCommentRequest {
  comment_id: string;
}

export interface SocialDeleteCommentResponse {
  success: true;
  comment_id: string;
  post_id: string;
  deleted_at: string;
  moderation_state: Extract<ModerationState, 'removed'>;
}

export interface SocialDeletePostRequest {
  post_id: string;
}

export interface SocialDeletePostResponse {
  success: true;
  post_id: string;
  moderation_state: Extract<ModerationState, 'removed'>;
  deleted_at: string;
}

export interface SocialSetCommentLikeRequest {
  comment_id: string;
  liked: boolean;
}

export interface SocialSetCommentLikeResponse {
  success: true;
  comment_id: string;
  viewer_has_liked: boolean;
  like_count: number;
  request_id?: string;
}

export interface SocialReportContentRequest {
  target_type: SocialReportTargetType;
  target_post_id?: string;
  target_comment_id?: string;
  reason_code: SocialReportReasonCode;
  details?: string;
}

export interface SocialReportContentResponse {
  success: true;
  report_id: string;
  workflow_status: SocialReportWorkflowStatus;
}

export interface SocialModerateContentRequest {
  target_type: SocialReportTargetType;
  target_post_id?: string;
  target_comment_id?: string;
  action: SocialModerationAction;
  reason_code?: string;
  note?: string;
  report_ids?: string[];
}

export interface SocialModerateContentResponse {
  success: true;
  target_type: SocialReportTargetType;
  target_id: string;
  action: SocialModerationAction;
  moderation_state: ModerationState | null;
  affected_reports: number;
  event_id: string;
}

export interface SocialAdminModerationItem {
  content_type: SocialReportTargetType;
  content_id: string;
  author_id: string | null;
  author_username: string | null;
  category: SocialCategory | null;
  content_text: string | null;
  asset_url: string | null;
  moderation_state: ModerationState;
  moderation_reason: string | null;
  moderation_provider: string | null;
  created_at: string;
  open_reports: number;
  total_reports_24h: number;
  unique_reporters_24h: number;
  unique_viewer_count: number;
  reason_codes: string[];
  last_reported_at: string | null;
  moderation_queued_at: string | null;
  moderation_claimed_at: string | null;
  moderation_completed_at: string | null;
  moderation_attempt_count: number;
  moderation_last_error: string | null;
  raw_like_count: number;
  raw_dislike_count: number;
  admin_like_adjustment: number;
  admin_dislike_adjustment: number;
  effective_like_count: number;
  effective_dislike_count: number;
  author_active_bans: {
    scope: string;
    ends_at: string | null;
    reason: string | null;
  }[];
}

export interface SocialAdminModerationQueueResponse {
  success: true;
  items: SocialAdminModerationItem[];
  pending_count: number;
  flagged_count: number;
  reported_count: number;
  needs_review_count: number;
  processed_count: number;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface SocialReclassifyPostRequest {
  post_id: string;
  category: SocialCategory;
}

export interface SocialReclassifyPostResponse {
  success: true;
  post_id: string;
  previous_category: SocialCategory;
  category: SocialCategory;
  event_id: string;
}

export interface SocialSetReactionRequest {
  post_id: string;
  reaction: SocialReactionState;
}

export interface SocialSetReactionResponse {
  success: true;
  post_id: string;
  viewer_reaction: SocialReactionState;
  like_count: number;
  dislike_count: number;
}

export interface SocialRecordImpressionsRequest {
  post_ids: string[];
  source?: 'feed' | 'detail' | 'comments';
}

export interface SocialRecordImpressionsResponse {
  success: true;
  recorded_count: number;
}

export interface SocialRecordPostViewsRequest {
  post_ids: string[];
}

export interface SocialRecordPostViewsResponse {
  success: true;
  recorded_count: number;
}

export interface SocialReserveUploadRequest {
  mime_type: string;
}

export interface SocialReserveUploadResponse {
  success: true;
  upload_id: string;
  asset_path: string;
  bucket: string;
  mime_type: string;
}

export interface CoachGenerateRequest {
  payload: CoachGuidancePayload;
  persona_key: CoachPersonaKey;
  locale?: string;
  force_refresh?: boolean;
}

export interface CoachGenerateResponse {
  success: true;
  cached: boolean;
  entry_id: string;
  persona_key: CoachPersonaKey;
  prompt_type: CoachGenerationPromptType | null;
  question_key?: CoachQuestionKey | null;
  question_text?: string | null;
  response_version: CoachResponseVersion;
  status: CoachEntryStatus;
  title: string | null;
  body: string | null;
  disclaimer: string;
  cta_label: string | null;
  cta_route: string | null;
  content: CoachStructuredContent | null;
  source: string | null;
  expires_at: string | null;
  response_payload_json: Record<string, unknown>;
  quota?: CoachQuotaStatus | null;
}

export interface CoachGuidanceResult extends CoachGenerateResponse {
  fallback: boolean;
  payload: CoachGuidancePayload;
}

export interface SocialAdminModerateUserRequest {
  target_user_id: string;
  action: 'ban_user' | 'revoke_ban' | 'remove_avatar';
  scope?: 'all' | 'posts' | 'comments' | 'avatar';
  reason?: string;
  duration_hours?: number;
}

export interface SocialAdminModerateUserResponse {
  success: true;
  action: SocialAdminModerateUserRequest['action'];
  target_user_id: string;
  event_id: string | null;
}

export interface SocialAdminEradicateUserRequest {
  target_user_id: string;
  note?: string;
}

export interface SocialAdminEradicateUserResponse {
  success: true;
  target_user_id: string;
  operation_id: string;
  event_id: string;
  post_count: number;
  own_comment_count: number;
  cascaded_comment_count: number;
  resolved_report_count: number;
  ban_created: boolean;
  storage_cleanup_status: 'completed' | 'partial' | 'failed';
  deleted_asset_paths: string[];
  failed_asset_paths: string[];
  deleted_avatar_paths: string[];
  failed_avatar_paths: string[];
}

export interface SocialAdminAdjustPostReactionsRequest {
  post_id: string;
  admin_like_adjustment: number;
  admin_dislike_adjustment: number;
  note?: string;
}

export interface SocialAdminAdjustPostReactionsResponse {
  success: true;
  post_id: string;
  raw_like_count: number;
  raw_dislike_count: number;
  admin_like_adjustment: number;
  admin_dislike_adjustment: number;
  effective_like_count: number;
  effective_dislike_count: number;
  event_id: string;
}
