import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Gift, Sparkles } from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import { Button } from '@/components/Button';
import { EntryOfferWheel } from '@/components/entryOffer/EntryOfferWheel';
import { GROWTH_EXPERIENCE_QUERY_KEY, useFeatureFlags, useGrowthExperience } from '@/hooks/queries';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { trackEvent } from '@/services/analytics';
import {
  ensureGrowthExperience,
  markEntryOfferDismissed,
  markEntryOfferShown,
  shouldPresentEntryOffer,
} from '@/services/growthExperience';
import {
  fetchRevenueCatCustomerInfo,
  hasPremiumEntitlement,
  resolveEntryOfferOffering,
} from '@/services/revenueCatOfferings';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';

export default function EntryOfferScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { userProfile } = useAuth();
  const { alertElement, showAlert } = useCustomAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: featureFlags } = useFeatureFlags();
  const { data: growthExperience } = useGrowthExperience();
  const [revealed, setRevealed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [hasActiveEntitlement, setHasActiveEntitlement] = useState(false);
  const [resolvedOffering, setResolvedOffering] = useState<Awaited<
    ReturnType<typeof resolveEntryOfferOffering>
  > | null>(null);
  const hasMarkedShownRef = useRef(false);
  const hasOpenedPaywallRef = useRef(false);

  const canDisplayOffer = shouldPresentEntryOffer({
    featureFlags,
    growthExperience,
    userProfile,
    hasActiveEntitlement,
  });

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    let isMounted = true;

    const loadOffering = async () => {
      setLoadingOffering(true);

      try {
        const [customerInfo, offering] = await Promise.all([
          fetchRevenueCatCustomerInfo(),
          resolveEntryOfferOffering(featureFlags.entry_offer_offering_id),
        ]);

        if (isMounted) {
          setHasActiveEntitlement(hasPremiumEntitlement(customerInfo));
          setResolvedOffering(offering);
        }
      } catch (error) {
        if (isMounted) {
          setHasActiveEntitlement(false);
          setResolvedOffering(null);
        }
        console.error('[EntryOffer] Failed to load offering:', error);
      } finally {
        if (isMounted) {
          setLoadingOffering(false);
        }
      }
    };

    void loadOffering();

    return () => {
      isMounted = false;
    };
  }, [featureFlags.entry_offer_offering_id]);

  useEffect(() => {
    if (!loadingOffering && hasActiveEntitlement) {
      handleClose();
    }
  }, [handleClose, hasActiveEntitlement, loadingOffering]);

  const persistShownState = useCallback(async () => {
    const ensuredGrowth =
      growthExperience ??
      (await ensureGrowthExperience(featureFlags.entry_offer_offering_id));

    if (ensuredGrowth?.entry_offer_shown_at) {
      return false;
    }

    await markEntryOfferShown(featureFlags.entry_offer_offering_id);
    if (userProfile?.id) {
      await queryClient.invalidateQueries({
        queryKey: GROWTH_EXPERIENCE_QUERY_KEY(userProfile.id),
      });
    }

    return true;
  }, [
    featureFlags.entry_offer_offering_id,
    growthExperience,
    queryClient,
    userProfile?.id,
  ]);

  const trackShownEvent = useCallback(
    (fallbackReason?: string | null) => {
      trackEvent('entry_offer_shown', {
        offering_id:
          resolvedOffering?.offering?.identifier ??
          featureFlags.entry_offer_offering_id ??
          'missing',
        package_id: resolvedOffering?.selectedPackage?.identifier,
        package_type: resolvedOffering?.packageType,
        has_intro: resolvedOffering?.hasIntro ?? false,
        intro_eligibility: resolvedOffering?.introEligibility ?? 'unknown',
        fallback_reason: fallbackReason ?? undefined,
        source: 'entry_offer',
      });
    },
    [featureFlags.entry_offer_offering_id, resolvedOffering],
  );

  useEffect(() => {
    if (
      !canDisplayOffer ||
      !userProfile?.id ||
      hasMarkedShownRef.current ||
      !resolvedOffering?.canShowPromo
    ) {
      return;
    }

    hasMarkedShownRef.current = true;

    const syncShownState = async () => {
      const didPersist = await persistShownState();
      if (!didPersist) {
        return;
      }

      trackShownEvent();
    };

    void syncShownState();
  }, [
    canDisplayOffer,
    persistShownState,
    resolvedOffering,
    trackShownEvent,
    userProfile?.id,
  ]);

  const openStandardPaywall = useCallback(
    async (options?: {
      consumeEntryOffer?: boolean;
      fallbackReason?: string | null;
    }) => {
      if (hasOpenedPaywallRef.current) {
        return;
      }

      hasOpenedPaywallRef.current = true;

      if (options?.consumeEntryOffer) {
        try {
          if (!hasMarkedShownRef.current) {
            hasMarkedShownRef.current = true;
            await persistShownState();
          }

          trackShownEvent(options.fallbackReason);
        } catch (error) {
          console.error('[EntryOffer] Failed to persist shown state:', error);
        }
      }

      trackEvent('entry_offer_paywall_open', {
        offering_id:
          resolvedOffering?.offering?.identifier ??
          featureFlags.entry_offer_offering_id ??
          'missing',
        package_id: resolvedOffering?.selectedPackage?.identifier,
        package_type: resolvedOffering?.packageType,
        has_intro: resolvedOffering?.hasIntro ?? false,
        intro_eligibility: resolvedOffering?.introEligibility ?? 'unknown',
        fallback_reason: options?.fallbackReason ?? undefined,
        source: 'entry_offer',
      });

      router.replace({
        pathname: '/premium-upgrade' as any,
        params: {
          source: 'entry_offer',
          offeringId:
            resolvedOffering?.offering?.identifier ??
            featureFlags.entry_offer_offering_id ??
            undefined,
          packageId: resolvedOffering?.selectedPackage?.identifier ?? undefined,
          returnTo: '/(tabs)',
        },
      });
    },
    [
      featureFlags.entry_offer_offering_id,
      persistShownState,
      resolvedOffering,
      router,
      trackShownEvent,
    ],
  );

  useEffect(() => {
    if (
      loadingOffering ||
      !canDisplayOffer ||
      !resolvedOffering?.shouldFallbackToPaywall ||
      !resolvedOffering.consumeOnFallback
    ) {
      return;
    }

    void openStandardPaywall({
      consumeEntryOffer: true,
      fallbackReason: resolvedOffering.fallbackReason,
    });
  }, [canDisplayOffer, loadingOffering, openStandardPaywall, resolvedOffering]);

  const handleReveal = () => {
    if (revealed || !resolvedOffering?.selectedPackage) {
      return;
    }

    setRevealed(true);
    trackEvent('entry_offer_result', {
      offering_id:
        resolvedOffering.offering?.identifier ??
        featureFlags.entry_offer_offering_id ??
        'missing',
      package_id: resolvedOffering.selectedPackage.identifier,
      package_type: resolvedOffering.packageType,
      has_intro: resolvedOffering.hasIntro,
      has_discount: resolvedOffering.hasDiscount,
      discount_percentage: resolvedOffering.discountPercentage ?? undefined,
      intro_eligibility: resolvedOffering.introEligibility,
      source: 'entry_offer',
    });
  };

  const handleDismiss = async () => {
    try {
      if (canDisplayOffer) {
        await markEntryOfferDismissed(featureFlags.entry_offer_offering_id);
        if (userProfile?.id) {
          await queryClient.invalidateQueries({
            queryKey: GROWTH_EXPERIENCE_QUERY_KEY(userProfile.id),
          });
        }
      }

      trackEvent('entry_offer_dismissed', {
        offering_id:
          resolvedOffering?.offering?.identifier ??
          featureFlags.entry_offer_offering_id ??
          'missing',
        package_id: resolvedOffering?.selectedPackage?.identifier,
        source: 'entry_offer',
      });
    } catch (error) {
      console.error('[EntryOffer] Failed to persist dismissal:', error);
    } finally {
      handleClose();
    }
  };

  const handleClaim = async () => {
    if (!resolvedOffering?.selectedPackage || claiming) {
      return;
    }

    try {
      setClaiming(true);
      await openStandardPaywall();
    } catch (error) {
      console.error('[EntryOffer] Failed to open paywall:', error);
      showAlert(
        t('entry_offer.error_title'),
        t('entry_offer.open_paywall_error'),
        [{ text: t('common.ok') }],
      );
    } finally {
      setClaiming(false);
    }
  };

  const packagePrice =
    resolvedOffering?.displayPrice ??
    t('entry_offer.fallback_price');
  const rewardHeadline =
    resolvedOffering?.headline ?? t('entry_offer.reward_title');
  const rewardBody =
    resolvedOffering?.subheadline ?? t('entry_offer.reward_body');
  const rewardBadge =
    resolvedOffering?.badge ?? t('entry_offer.reward_badge');
  const revealCaption =
    resolvedOffering?.revealLabel ?? t('entry_offer.reveal_caption');
  const claimLabel =
    resolvedOffering?.claimLabel ?? t('entry_offer.claim_cta');
  const rewardMeta = resolvedOffering?.introLabel ?? resolvedOffering?.billingLabel;

  return (
    <AppScreen scroll style={styles.container} contentContainerStyle={styles.content}>
      {alertElement}

      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Gift color={colors.white} size={28} />
          <View style={styles.sparkleBadge}>
            <Sparkles color={colors.white} size={14} />
          </View>
        </View>

        <Text style={styles.eyebrow}>{t('entry_offer.eyebrow')}</Text>
        <Text style={styles.title}>{t('entry_offer.title')}</Text>
        <Text style={styles.body}>{t('entry_offer.body')}</Text>
      </View>

      {loadingOffering ? (
        <View style={styles.stateCard} testID="entry-offer-loading-state">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : canDisplayOffer && resolvedOffering?.canShowPromo && resolvedOffering.selectedPackage ? (
        <>
          <View style={styles.wheelCard}>
            <Text style={styles.sectionTitle}>{t('entry_offer.reveal_title')}</Text>
            <Text style={styles.sectionBody}>{t('entry_offer.reveal_body')}</Text>

            <EntryOfferWheel
              labels={[
                t('entry_offer.wheel_label_1'),
                t('entry_offer.wheel_label_2'),
                t('entry_offer.wheel_label_3'),
                t('entry_offer.wheel_label_4'),
                t('entry_offer.wheel_label_5'),
                t('entry_offer.wheel_label_6'),
              ]}
              centerLabel={t('entry_offer.spin_label')}
              spinningCenterLabel={t('entry_offer.spinning_label')}
              idleCaption={revealCaption}
              spinningCaption={t('entry_offer.revealing_caption')}
              onSpinStart={() => {
                trackEvent('entry_offer_spin', {
                  offering_id:
                    resolvedOffering.offering?.identifier ??
                    featureFlags.entry_offer_offering_id ??
                    'missing',
                  package_id: resolvedOffering.selectedPackage?.identifier,
                  package_type: resolvedOffering.packageType,
                  source: 'entry_offer',
                });
              }}
              onSpinEnd={handleReveal}
              disabled={revealed}
              testID="entry-offer-wheel"
            />
          </View>

          <View style={styles.rewardCard} testID="entry-offer-reward-card">
            <View style={styles.rewardHeader}>
              <Text style={styles.rewardBadge}>{rewardBadge}</Text>
              <Text style={styles.rewardPrice}>{packagePrice}</Text>
            </View>
            <Text style={styles.rewardTitle}>{rewardHeadline}</Text>
            <Text style={styles.rewardBody}>{rewardBody}</Text>
            {rewardMeta ? (
              <Text style={styles.rewardMeta}>{rewardMeta}</Text>
            ) : null}

            <Button
              title={claimLabel}
              onPress={() => {
                void handleClaim();
              }}
              loading={claiming}
              disabled={!revealed || claiming}
            />
          </View>
        </>
      ) : (
        <View style={styles.stateCard} testID="entry-offer-fallback-state">
          <Text style={styles.sectionTitle}>{t('entry_offer.unavailable_title')}</Text>
          <Text style={styles.sectionBody}>{t('entry_offer.unavailable_body')}</Text>
          {!hasActiveEntitlement ? (
            <Button
              title={t('entry_offer.open_standard_paywall_cta')}
              onPress={() => {
                void openStandardPaywall({
                  consumeEntryOffer: false,
                  fallbackReason: resolvedOffering?.fallbackReason ?? null,
                });
              }}
            />
          ) : null}
        </View>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => {
          void handleDismiss();
        }}
        style={styles.dismissButton}
        testID="entry-offer-dismiss-button"
      >
        <Text style={styles.dismissButtonLabel}>{t('entry_offer.dismiss_cta')}</Text>
      </TouchableOpacity>
    </AppScreen>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.xl,
    },
    hero: {
      gap: SPACING.sm,
      alignItems: 'center',
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      position: 'relative',
    },
    sparkleBadge: {
      position: 'absolute',
      right: -2,
      top: -2,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.warning,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    title: {
      fontSize: SIZES.xl,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    body: {
      fontSize: SIZES.text14,
      lineHeight: 24,
      color: colors.gray,
      textAlign: 'center',
    },
    wheelCard: {
      gap: SPACING.md,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.08),
    },
    rewardCard: {
      gap: SPACING.md,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.08),
    },
    rewardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    rewardBadge: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    rewardPrice: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    rewardTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    rewardBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: colors.gray,
    },
    rewardMeta: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    stateCard: {
      gap: SPACING.sm,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    sectionBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: colors.gray,
      textAlign: 'center',
    },
    dismissButton: {
      minHeight: 48,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primaryText, 0.06),
    },
    dismissButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
  });
