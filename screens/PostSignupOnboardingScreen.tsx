import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';

import { AuthHero, AuthShell } from '@/components/auth';
import { Button } from '@/components/Button';
import { Squircle } from '@/components/Squircle';
import { BORDER_RADIUS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useFeatureFlags } from '@/hooks/queries/useFeatureFlags';
import { useGrowthExperience } from '@/hooks/queries/useGrowthExperience';
import { usePostSignupOnboardingPending } from '@/hooks/usePostSignupOnboardingPending';
import {
  ensureGrowthExperience,
  shouldPresentEntryOffer,
} from '@/services/growthExperience';
import {
  fetchRevenueCatCustomerInfo,
  hasPremiumEntitlement,
} from '@/services/revenueCatOfferings';
import { clearPostSignupOnboardingPending } from '@/utils/postSignupOnboarding';
import { entryOfferSession } from '@/utils/entryOfferSession';

export default function PostSignupOnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { user, userProfile, isEmailVerified, markTutorialSeen } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  const { data: growthExperience } = useGrowthExperience();
  const { isPending, isLoading: isPendingLoading } =
    usePostSignupOnboardingPending(user?.id);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => true,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isPendingLoading || completing) {
      return;
    }
    if (!user || !isEmailVerified || !userProfile?.username) {
      return;
    }
    if (!isPending || userProfile.has_seen_tutorial) {
      router.replace('/(tabs)');
    }
  }, [
    completing,
    isEmailVerified,
    isPending,
    isPendingLoading,
    router,
    user,
    userProfile?.has_seen_tutorial,
    userProfile?.username,
  ]);

  const handleEnterApp = async () => {
    if (!user?.id || completing) {
      return;
    }

    try {
      setCompleting(true);
      setError(null);
      await markTutorialSeen();
      await clearPostSignupOnboardingPending(user.id);

      const ensuredGrowthExperience =
        growthExperience ??
        (await ensureGrowthExperience(featureFlags.entry_offer_offering_id));
      const customerInfo = await fetchRevenueCatCustomerInfo();
      const shouldOpenEntryOffer = shouldPresentEntryOffer({
        featureFlags,
        growthExperience: ensuredGrowthExperience,
        userProfile: {
          id: user.id,
          account_tier: userProfile?.account_tier ?? 'free',
        },
        hasActiveEntitlement: hasPremiumEntitlement(customerInfo),
      });

      if (shouldOpenEntryOffer) {
        entryOfferSession.markAutoPresentationStarted(user.id);
      }
      router.replace((shouldOpenEntryOffer ? '/entry-offer' : '/(tabs)') as any);
    } catch (completionError) {
      console.error(
        '[PostSignupOnboarding] Failed to complete onboarding:',
        completionError,
      );
      setError(t('common.error'));
    } finally {
      setCompleting(false);
    }
  };

  if (isPendingLoading || !userProfile?.username) {
    return (
      <AuthShell showLanguage={false}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell showLanguage={false} testID="post-signup-finalization">
      <View style={styles.page} testID="post-signup-content">
        <View style={styles.body}>
          <Squircle style={styles.statusIcon}>
            <Check color={colors.primary} size={30} />
          </Squircle>
          <AuthHero
            variant="status"
            brand="HEALTH SCAN"
            title={t('onboarding.final_title')}
            subtitle={t('onboarding.final_subtitle')}
          />
          <Squircle style={styles.profileSummary}>
            <Text style={styles.profileLabel}>{t('onboarding.profile_ready_label')}</Text>
            <Text style={styles.username}>@{userProfile.username}</Text>
          </Squircle>
          {error ? (
            <Squircle style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </Squircle>
          ) : null}
        </View>
        <Button
          title={t('onboarding.enter_app')}
          onPress={handleEnterApp}
          loading={completing}
          disabled={completing}
          variant="primary"
          size="lg"
          flat
        />
      </View>
    </AuthShell>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    page: {
      flex: 1,
      justifyContent: 'space-between',
      gap: SPACING.xl,
    },
    body: {
      flex: 1,
      justifyContent: 'center',
      gap: SPACING.lg,
    },
    statusIcon: {
      alignSelf: 'center',
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryLight,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.12),
      borderCurve: 'continuous',
    },
    profileSummary: {
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderCurve: 'continuous',
    },
    profileLabel: {
      color: colors.gray,
      fontSize: SIZES.text12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    username: {
      color: colors.primaryText,
      fontSize: SIZES.lg,
      fontWeight: '700',
    },
    errorContainer: {
      backgroundColor: withAlpha(colors.error, 0.1),
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      borderCurve: 'continuous',
    },
    errorText: {
      color: colors.error,
      fontSize: SIZES.sm,
      textAlign: 'center',
    },
  });
