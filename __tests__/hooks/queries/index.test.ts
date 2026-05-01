// Test that all exports are available from the index file
import {
  useDashboard,
  DASHBOARD_QUERY_KEY,
  useAnalytics,
  ANALYTICS_QUERY_KEY,
  useRecipes,
  RECIPES_QUERY_KEY,
  useExercises,
  EXERCISES_QUERY_KEY,
  useScanEligibility,
  useAllScanEligibility,
  SCAN_ELIGIBILITY_QUERY_KEY,
  useNotificationsQuery,
  NOTIFICATIONS_QUERY_KEY,
  usePremiumFeatures,
  PREMIUM_FEATURES_QUERY_KEY,
  usePremiumPotential,
  PREMIUM_POTENTIAL_QUERY_KEY,
  useFeatureFlags,
  FEATURE_FLAGS_QUERY_KEY,
  useSocialFeed,
  SOCIAL_FEED_QUERY_KEY,
  useSocialComments,
  SOCIAL_COMMENTS_QUERY_KEY,
  useSocialMutations,
  useSocialAdminModeration,
  SOCIAL_ADMIN_MODERATION_QUERY_KEY,
  useCoachEntries,
  COACH_ENTRIES_QUERY_KEY,
  useInfiniteCoachHistory,
  COACH_HISTORY_INFINITE_QUERY_KEY,
  useCoachHistorySummary,
  COACH_HISTORY_SUMMARY_QUERY_KEY,
  useLatestReadyCoachEntry,
  COACH_LATEST_READY_ENTRY_QUERY_KEY,
  useGrowthExperience,
  GROWTH_EXPERIENCE_QUERY_KEY,
  useCoachGeneration,
} from '@/hooks/queries';

describe('hooks/queries/index', () => {
  it('exports useDashboard hook', () => {
    expect(useDashboard).toBeDefined();
    expect(typeof useDashboard).toBe('function');
  });

  it('exports DASHBOARD_QUERY_KEY', () => {
    expect(DASHBOARD_QUERY_KEY).toBeDefined();
    expect(DASHBOARD_QUERY_KEY).toEqual(['dashboard']);
  });

  it('exports useAnalytics hook', () => {
    expect(useAnalytics).toBeDefined();
    expect(typeof useAnalytics).toBe('function');
  });

  it('exports ANALYTICS_QUERY_KEY', () => {
    expect(ANALYTICS_QUERY_KEY).toBeDefined();
    expect(typeof ANALYTICS_QUERY_KEY).toBe('function');
  });

  it('exports useRecipes hook', () => {
    expect(useRecipes).toBeDefined();
    expect(typeof useRecipes).toBe('function');
  });

  it('exports RECIPES_QUERY_KEY', () => {
    expect(RECIPES_QUERY_KEY).toBeDefined();
    expect(RECIPES_QUERY_KEY).toEqual(['recipes']);
  });

  it('exports useExercises hook', () => {
    expect(useExercises).toBeDefined();
    expect(typeof useExercises).toBe('function');
  });

  it('exports EXERCISES_QUERY_KEY', () => {
    expect(EXERCISES_QUERY_KEY).toBeDefined();
    expect(EXERCISES_QUERY_KEY).toEqual(['exercises']);
  });

  it('exports useScanEligibility hook', () => {
    expect(useScanEligibility).toBeDefined();
    expect(typeof useScanEligibility).toBe('function');
  });

  it('exports useAllScanEligibility hook', () => {
    expect(useAllScanEligibility).toBeDefined();
    expect(typeof useAllScanEligibility).toBe('function');
  });

  it('exports SCAN_ELIGIBILITY_QUERY_KEY', () => {
    expect(SCAN_ELIGIBILITY_QUERY_KEY).toBeDefined();
    expect(typeof SCAN_ELIGIBILITY_QUERY_KEY).toBe('function');
  });

  it('exports useNotificationsQuery hook', () => {
    expect(useNotificationsQuery).toBeDefined();
    expect(typeof useNotificationsQuery).toBe('function');
  });

  it('exports NOTIFICATIONS_QUERY_KEY', () => {
    expect(NOTIFICATIONS_QUERY_KEY).toBeDefined();
    expect(typeof NOTIFICATIONS_QUERY_KEY).toBe('function');
  });

  it('exports usePremiumFeatures hook', () => {
    expect(usePremiumFeatures).toBeDefined();
    expect(typeof usePremiumFeatures).toBe('function');
  });

  it('exports PREMIUM_FEATURES_QUERY_KEY', () => {
    expect(PREMIUM_FEATURES_QUERY_KEY).toBeDefined();
    expect(PREMIUM_FEATURES_QUERY_KEY).toEqual(['premiumFeatures']);
  });

  it('exports usePremiumPotential hook', () => {
    expect(usePremiumPotential).toBeDefined();
    expect(typeof usePremiumPotential).toBe('function');
  });

  it('exports PREMIUM_POTENTIAL_QUERY_KEY', () => {
    expect(PREMIUM_POTENTIAL_QUERY_KEY).toBeDefined();
    expect(typeof PREMIUM_POTENTIAL_QUERY_KEY).toBe('function');
  });

  it('exports useFeatureFlags hook', () => {
    expect(useFeatureFlags).toBeDefined();
    expect(typeof useFeatureFlags).toBe('function');
  });

  it('exports FEATURE_FLAGS_QUERY_KEY', () => {
    expect(FEATURE_FLAGS_QUERY_KEY).toBeDefined();
    expect(FEATURE_FLAGS_QUERY_KEY).toEqual(['appConfig', 'featureFlags']);
  });

  it('exports useSocialFeed hook', () => {
    expect(useSocialFeed).toBeDefined();
    expect(typeof useSocialFeed).toBe('function');
  });

  it('exports SOCIAL_FEED_QUERY_KEY', () => {
    expect(SOCIAL_FEED_QUERY_KEY).toBeDefined();
    expect(typeof SOCIAL_FEED_QUERY_KEY).toBe('function');
  });

  it('exports useSocialComments hook', () => {
    expect(useSocialComments).toBeDefined();
    expect(typeof useSocialComments).toBe('function');
  });

  it('exports useSocialMutations hook', () => {
    expect(useSocialMutations).toBeDefined();
    expect(typeof useSocialMutations).toBe('function');
  });

  it('exports useSocialAdminModeration hook', () => {
    expect(useSocialAdminModeration).toBeDefined();
    expect(typeof useSocialAdminModeration).toBe('function');
  });

  it('exports SOCIAL_COMMENTS_QUERY_KEY', () => {
    expect(SOCIAL_COMMENTS_QUERY_KEY).toBeDefined();
    expect(typeof SOCIAL_COMMENTS_QUERY_KEY).toBe('function');
  });

  it('exports SOCIAL_ADMIN_MODERATION_QUERY_KEY', () => {
    expect(SOCIAL_ADMIN_MODERATION_QUERY_KEY).toBeDefined();
    expect(typeof SOCIAL_ADMIN_MODERATION_QUERY_KEY).toBe('function');
  });

  it('exports useCoachEntries hook', () => {
    expect(useCoachEntries).toBeDefined();
    expect(typeof useCoachEntries).toBe('function');
  });

  it('exports COACH_ENTRIES_QUERY_KEY', () => {
    expect(COACH_ENTRIES_QUERY_KEY).toBeDefined();
    expect(COACH_ENTRIES_QUERY_KEY).toEqual(['coachEntries']);
  });

  it('exports useInfiniteCoachHistory hook', () => {
    expect(useInfiniteCoachHistory).toBeDefined();
    expect(typeof useInfiniteCoachHistory).toBe('function');
  });

  it('exports COACH_HISTORY_INFINITE_QUERY_KEY', () => {
    expect(COACH_HISTORY_INFINITE_QUERY_KEY).toBeDefined();
    expect(COACH_HISTORY_INFINITE_QUERY_KEY).toEqual(['coachHistoryInfinite']);
  });

  it('exports useCoachHistorySummary hook', () => {
    expect(useCoachHistorySummary).toBeDefined();
    expect(typeof useCoachHistorySummary).toBe('function');
  });

  it('exports COACH_HISTORY_SUMMARY_QUERY_KEY', () => {
    expect(COACH_HISTORY_SUMMARY_QUERY_KEY).toBeDefined();
    expect(COACH_HISTORY_SUMMARY_QUERY_KEY).toEqual(['coachHistorySummary']);
  });

  it('exports useLatestReadyCoachEntry hook', () => {
    expect(useLatestReadyCoachEntry).toBeDefined();
    expect(typeof useLatestReadyCoachEntry).toBe('function');
  });

  it('exports COACH_LATEST_READY_ENTRY_QUERY_KEY', () => {
    expect(COACH_LATEST_READY_ENTRY_QUERY_KEY).toBeDefined();
    expect(COACH_LATEST_READY_ENTRY_QUERY_KEY).toEqual(['coachLatestReady']);
  });

  it('exports useGrowthExperience hook', () => {
    expect(useGrowthExperience).toBeDefined();
    expect(typeof useGrowthExperience).toBe('function');
  });

  it('exports GROWTH_EXPERIENCE_QUERY_KEY', () => {
    expect(GROWTH_EXPERIENCE_QUERY_KEY).toBeDefined();
    expect(typeof GROWTH_EXPERIENCE_QUERY_KEY).toBe('function');
  });

  it('exports useCoachGeneration hook', () => {
    expect(useCoachGeneration).toBeDefined();
    expect(typeof useCoachGeneration).toBe('function');
  });
});
