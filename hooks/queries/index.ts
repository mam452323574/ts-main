// Hooks de queries React Query
export { useDashboard, DASHBOARD_QUERY_KEY } from './useDashboard';
export { useAnalytics, ANALYTICS_QUERY_KEY } from './useAnalytics';
export { useRecipes, RECIPES_QUERY_KEY } from './useRecipes';
export { useExercises, EXERCISES_QUERY_KEY } from './useExercises';
export { 
  useScanEligibility, 
  useAllScanEligibility, 
  SCAN_ELIGIBILITY_QUERY_KEY 
} from './useScanEligibility';
export { useNotificationsQuery, NOTIFICATIONS_QUERY_KEY, fetchNotifications } from './useNotifications';
export { usePremiumFeatures, PREMIUM_FEATURES_QUERY_KEY } from './usePremiumFeatures';
export { usePremiumPotential, PREMIUM_POTENTIAL_QUERY_KEY } from './usePremiumPotential';
export { useFeatureFlags, FEATURE_FLAGS_QUERY_KEY } from './useFeatureFlags';
export {
  useSocialFeed,
  SOCIAL_FEED_QUERY_KEY,
  flattenSocialFeedPages,
} from './useSocialFeed';
export { useSocialComments, SOCIAL_COMMENTS_QUERY_KEY } from './useSocialComments';
export { useSocialPostDetail, SOCIAL_POST_QUERY_KEY } from './useSocialPostDetail';
export {
  useSocialPublicProfile,
  SOCIAL_PUBLIC_PROFILE_QUERY_KEY,
} from './useSocialPublicProfile';
export { useSocialMutations } from './useSocialMutations';
export {
  useSocialAdminModeration,
  SOCIAL_ADMIN_MODERATION_QUERY_KEY,
} from './useSocialAdminModeration';
export {
  useCoachEntries,
  COACH_ENTRIES_QUERY_KEY,
  getCoachEntriesQueryKey,
} from './useCoachEntries';
export {
  useInfiniteCoachHistory,
  COACH_HISTORY_INFINITE_QUERY_KEY,
  getCoachHistoryInfiniteQueryKey,
} from './useInfiniteCoachHistory';
export {
  useCoachHistorySummary,
  COACH_HISTORY_SUMMARY_QUERY_KEY,
  getCoachHistorySummaryQueryKey,
} from './useCoachHistorySummary';
export {
  useLatestReadyCoachEntry,
  COACH_LATEST_READY_ENTRY_QUERY_KEY,
  getCoachLatestReadyEntryQueryKey,
} from './useLatestReadyCoachEntry';
export {
  useCoachScans,
  COACH_SCANS_QUERY_KEY,
  getCoachScansQueryKey,
} from './useCoachScans';
export {
  useCoachQuota,
  COACH_QUOTA_QUERY_KEY,
  getCoachQuotaQueryKey,
} from './useCoachQuota';
export { useGrowthExperience, GROWTH_EXPERIENCE_QUERY_KEY } from './useGrowthExperience';
export { useCoachGeneration } from './useCoachGeneration';
export {
  useFridgeScanRecord,
  FRIDGE_SCAN_RECORD_QUERY_KEY,
  getFridgeScanRecordQueryKey,
} from './useFridgeScanRecord';
