import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  LineChart,
  Users,
} from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Button } from '@/components/Button';
import { CoachFeatureIcon } from '@/components/FeatureIcons';
import { OnboardingSlide, PhoneMockup } from '@/components/auth';
import {
  buildOnboardingPalette,
  type OnboardingPalette,
} from '@/components/auth/tokens';
import { FridgeScanIllustration } from '@/components/home/FridgeScanIllustration';
import { NativePagerView } from '@/components/NativePagerView';
import {
  BORDER_RADIUS,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useFeatureFlags, useGrowthExperience } from '@/hooks/queries';
import { usePostSignupOnboardingPending } from '@/hooks/usePostSignupOnboardingPending';
import {
  ensureGrowthExperience,
  shouldPresentEntryOffer,
} from '@/services/growthExperience';
import {
  fetchRevenueCatCustomerInfo,
  hasPremiumEntitlement,
} from '@/services/revenueCatOfferings';
import {
  clearPostSignupOnboardingAvatarHandled,
  clearPostSignupOnboardingPending,
  hasPostSignupOnboardingAvatarHandled,
} from '@/utils/postSignupOnboarding';
import { entryOfferSession } from '@/utils/entryOfferSession';
import { getMinimumBottomInsetPadding } from '@/utils/mobileLayout';

const TOTAL_SLIDES = 5;

interface SlideContent {
  key: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: string[];
  preview: ReactNode;
}

export default function PostSignupOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const {
    user,
    userProfile,
    isEmailVerified,
    markTutorialSeen,
    updateAvatarUrl,
  } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  const { data: growthExperience } = useGrowthExperience();
  const { isPending, isLoading: isPendingLoading } =
    usePostSignupOnboardingPending(user?.id);

  const [stage, setStage] = useState<'avatar' | 'slides'>('avatar');
  const [isAvatarHandledLoading, setIsAvatarHandledLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [selectedAvatarReference, setSelectedAvatarReference] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const pagerRef = useRef<any>(null);

  const onboardingPalette = useMemo(
    () => buildOnboardingPalette(colors, isDark),
    [colors, isDark],
  );
  const isCompactAndroidLayout =
    Platform.OS === 'android' && windowHeight < 760;
  const styles = useMemo(
    () =>
      createStyles(
        colors,
        insets,
        isDark,
        onboardingPalette,
        isCompactAndroidLayout,
      ),
    [colors, insets, isCompactAndroidLayout, isDark, onboardingPalette],
  );
  const gradientColors = useMemo<[string, string, string]>(
    () => onboardingPalette.backgroundGradient,
    [onboardingPalette.backgroundGradient],
  );
  const topWashColors = useMemo<[string, string, string]>(
    () =>
      [
        withAlpha(colors.primary, 0.18),
        withAlpha(colors.secondary, 0.08),
        withAlpha(onboardingPalette.background, 0),
      ],
    [colors.primary, colors.secondary, onboardingPalette.background],
  );
  const bottomWashColors = useMemo<[string, string, string]>(
    () =>
      [
        withAlpha(colors.secondary, 0.14),
        withAlpha(colors.primary, 0.08),
        withAlpha(onboardingPalette.background, 0),
      ],
    [colors.primary, colors.secondary, onboardingPalette.background],
  );

  const slides = useMemo<SlideContent[]>(
    () => [
      {
        key: 'scanner',
        eyebrow: t('onboarding.slide_1_eyebrow'),
        title: t('onboarding.slide_1_title'),
        subtitle: t('onboarding.slide_1_subtitle'),
        bullets: [
          t('onboarding.slide_1_bullet_1'),
          t('onboarding.slide_1_bullet_2'),
          t('onboarding.slide_1_bullet_3'),
        ],
        preview: (
          <ScannerPreview
            colors={colors}
            isDark={isDark}
            palette={onboardingPalette}
          />
        ),
      },
      {
        key: 'coach',
        eyebrow: t('onboarding.slide_2_eyebrow'),
        title: t('onboarding.slide_2_title'),
        subtitle: t('onboarding.slide_2_subtitle'),
        bullets: [
          t('onboarding.slide_2_bullet_1'),
          t('onboarding.slide_2_bullet_2'),
          t('onboarding.slide_2_bullet_3'),
        ],
        preview: (
          <CoachPreview
            colors={colors}
            isDark={isDark}
            palette={onboardingPalette}
          />
        ),
      },
      {
        key: 'social',
        eyebrow: t('onboarding.slide_3_eyebrow'),
        title: t('onboarding.slide_3_title'),
        subtitle: t('onboarding.slide_3_subtitle'),
        bullets: [
          t('onboarding.slide_3_bullet_1'),
          t('onboarding.slide_3_bullet_2'),
          t('onboarding.slide_3_bullet_3'),
        ],
        preview: (
          <SocialPreview
            colors={colors}
            isDark={isDark}
            palette={onboardingPalette}
          />
        ),
      },
      {
        key: 'analytics',
        eyebrow: t('onboarding.slide_4_eyebrow'),
        title: t('onboarding.slide_4_title'),
        subtitle: t('onboarding.slide_4_subtitle'),
        bullets: [
          t('onboarding.slide_4_bullet_1'),
          t('onboarding.slide_4_bullet_2'),
          t('onboarding.slide_4_bullet_3'),
        ],
        preview: (
          <AnalyticsPreview
            colors={colors}
            isDark={isDark}
            palette={onboardingPalette}
          />
        ),
      },
      {
        key: 'fridge',
        eyebrow: t('onboarding.slide_5_eyebrow'),
        title: t('onboarding.slide_5_title'),
        subtitle: t('onboarding.slide_5_subtitle'),
        bullets: [
          t('onboarding.slide_5_bullet_1'),
          t('onboarding.slide_5_bullet_2'),
          t('onboarding.slide_5_bullet_3'),
        ],
        preview: (
          <FridgePreview
            colors={colors}
            isDark={isDark}
            palette={onboardingPalette}
          />
        ),
      },
    ],
    [colors, isDark, onboardingPalette, t],
  );

  const hasAvatar = Boolean(
    selectedAvatarReference ?? userProfile?.avatar_url,
  );
  const isAvatarStage = stage === 'avatar';

  useEffect(() => {
    let isMounted = true;

    const loadAvatarHandledState = async () => {
      if (!user?.id) {
        if (isMounted) {
          setIsAvatarHandledLoading(false);
        }
        return;
      }

      try {
        const avatarHandled = await hasPostSignupOnboardingAvatarHandled(
          user.id,
        );
        if (!isMounted) {
          return;
        }

        if (avatarHandled) {
          setStage('slides');
          setCurrentPage(0);
        }
      } catch (avatarHandledError) {
        console.error(
          '[PostSignupOnboarding] Failed to read avatar handled flag:',
          avatarHandledError,
        );
      } finally {
        if (isMounted) {
          setIsAvatarHandledLoading(false);
        }
      }
    };

    void loadAvatarHandledState();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => true,
    );

    return () => {
      subscription.remove();
    };
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
    isEmailVerified,
    isPending,
    isPendingLoading,
    completing,
    router,
    user,
    userProfile?.has_seen_tutorial,
    userProfile?.username,
  ]);

  const goToPage = (nextPage: number) => {
    setCurrentPage(nextPage);

    if (Platform.OS !== 'web') {
      pagerRef.current?.setPage(nextPage);
    }
  };

  const handleAvatarStepContinue = () => {
    if (updatingAvatar || !hasAvatar) {
      return;
    }

    setError(null);
    setCurrentPage(0);
    setStage('slides');
  };

  const handleAvatarStepSkip = () => {
    if (updatingAvatar) {
      return;
    }

    setError(null);
    setCurrentPage(0);
    setStage('slides');
  };

  const handlePrimaryAction = async () => {
    if (isAvatarStage) {
      handleAvatarStepContinue();
      return;
    }

    if (currentPage < TOTAL_SLIDES - 1) {
      goToPage(currentPage + 1);
      return;
    }

    if (!user?.id || completing) {
      return;
    }

    try {
      setCompleting(true);
      setError(null);

      await markTutorialSeen();
      await clearPostSignupOnboardingPending(user.id);
      await clearPostSignupOnboardingAvatarHandled(user.id);

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

  const handleSkipSlides = () => {
    if (completing) {
      return;
    }
    goToPage(TOTAL_SLIDES - 1);
  };

  const handleAvatarSelected = async (avatarReference: string) => {
    try {
      setUpdatingAvatar(true);
      setError(null);
      await updateAvatarUrl(avatarReference);
      setSelectedAvatarReference(avatarReference);
    } catch (avatarError) {
      console.error(
        '[PostSignupOnboarding] Failed to update avatar:',
        avatarError,
      );
      setError(t('components.avatar.error_download'));
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const renderSlide = (slide: SlideContent) => (
    <View key={slide.key} style={styles.pageShell}>
      <OnboardingSlide
        eyebrow={slide.eyebrow}
        title={slide.title}
        subtitle={slide.subtitle}
        bullets={slide.bullets}
        visual={<PhoneMockup>{slide.preview}</PhoneMockup>}
      />
    </View>
  );

  const renderAvatarStep = () => (
    <View style={styles.stepWrap} testID="post-signup-avatar-step">
      <LinearGradient
        colors={onboardingPalette.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.profileCard}
      >
        <Text style={styles.profileCardTitle}>
          {hasAvatar
            ? t('onboarding.avatar_change_title')
            : t('onboarding.avatar_title')}
        </Text>
        <Text style={styles.profileCardSubtitle}>
          {hasAvatar
            ? t('onboarding.avatar_change_subtitle')
            : t('onboarding.avatar_subtitle')}
        </Text>
        {user ? (
          <AvatarPicker
            userId={user.id}
            currentAvatarUrl={selectedAvatarReference ?? userProfile?.avatar_url}
            onAvatarSelected={handleAvatarSelected}
            size={140}
          />
        ) : null}
      </LinearGradient>
    </View>
  );

  const renderSlidesStep = () => (
    <View style={styles.stepWrap} testID="post-signup-slides-step">
      {Platform.OS === 'web' ? (
        renderSlide(slides[currentPage])
      ) : (
        <NativePagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          scrollEnabled
          onPageSelected={(event: { nativeEvent: { position: number } }) =>
            setCurrentPage(event.nativeEvent.position)
          }
        >
          {slides.map((slide) => (
            <View key={slide.key} style={styles.nativePage}>
              {renderSlide(slide)}
            </View>
          ))}
        </NativePagerView>
      )}
    </View>
  );

  if (
    isPendingLoading ||
    isAvatarHandledLoading ||
    !userProfile?.username
  ) {
    return (
      <AppScreen style={styles.container} topInset={false} bottomInset={false}>
        <LinearGradient colors={gradientColors} style={styles.gradient}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={onboardingPalette.accent} />
          </View>
        </LinearGradient>
      </AppScreen>
    );
  }

  return (
    <AppScreen style={styles.container} topInset={false} bottomInset={false}>
      <LinearGradient colors={gradientColors} style={styles.gradient}>
        <LinearGradient
          colors={topWashColors}
          start={{ x: 0.85, y: 0 }}
          end={{ x: 0.15, y: 1 }}
          style={styles.topWash}
        />
        <LinearGradient
          colors={bottomWashColors}
          start={{ x: 0.1, y: 1 }}
          end={{ x: 0.9, y: 0 }}
          style={styles.bottomWash}
        />

        <View style={styles.content} testID="post-signup-content">
          <View style={styles.header}>
            <Text style={styles.brand}>HEALTH SCAN</Text>
            {!isAvatarStage && currentPage < TOTAL_SLIDES - 1 ? (
              <Pressable
                onPress={handleSkipSlides}
                disabled={completing}
                style={({ pressed }) => [
                  styles.skipSlidesButton,
                  pressed && styles.skipSlidesPressed,
                ]}
                accessibilityRole="button"
                testID="post-signup-skip-slides"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.skipSlidesLabel}>
                  {t('common.skip')}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>

          <View style={styles.pagerWrap}>
            {isAvatarStage ? renderAvatarStep() : renderSlidesStep()}
          </View>

          <View style={styles.footer}>
            {!isAvatarStage ? (
              <View style={styles.progressRow}>
                {slides.map((slide, index) => (
                  <View
                    key={slide.key}
                    style={[
                      styles.progressDot,
                      index === currentPage && styles.progressDotActive,
                    ]}
                  />
                ))}
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {isAvatarStage && !hasAvatar ? (
              <Pressable
                accessibilityRole="button"
                disabled={updatingAvatar}
                onPress={handleAvatarStepSkip}
                style={({ pressed }) => [
                  styles.skipAvatarButton,
                  pressed && styles.skipAvatarPressed,
                ]}
                testID="post-signup-skip-avatar"
              >
                <Text style={styles.skipAvatarLabel}>
                  {t('onboarding.avatar_skip')}
                </Text>
              </Pressable>
            ) : null}

            <Button
              title={
                !isAvatarStage && currentPage === TOTAL_SLIDES - 1
                  ? t('onboarding.enter_app')
                  : t('common.next')
              }
              onPress={handlePrimaryAction}
              loading={!isAvatarStage && completing}
              disabled={isAvatarStage && (updatingAvatar || !hasAvatar)}
              variant="premium"
              size="lg"
            />
          </View>
        </View>
      </LinearGradient>
    </AppScreen>
  );
}

interface PreviewProps {
  colors: any;
  isDark: boolean;
  palette: OnboardingPalette;
}

function PreviewFrame({
  colors,
  isDark,
  palette,
  children,
  sectionLabel,
}: PreviewProps & { children: ReactNode; sectionLabel: string }) {
  const previewStyles = useMemo(
    () => createPreviewStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );
  return (
    <LinearGradient
      colors={palette.cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={previewStyles.frame}
    >
      <View style={previewStyles.sectionLabelRow}>
        <View style={previewStyles.sectionDot} />
        <Text style={previewStyles.sectionLabel}>{sectionLabel}</Text>
      </View>
      <View style={previewStyles.body}>{children}</View>
    </LinearGradient>
  );
}

function ScannerPreview({ colors, isDark, palette }: PreviewProps) {
  const styles = useMemo(
    () => createPreviewStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );
  return (
    <PreviewFrame
      colors={colors}
      isDark={isDark}
      palette={palette}
      sectionLabel="SCANNER"
    >
      <View style={styles.heroIconWrap}>
        <Camera color={palette.accentStrong} size={56} strokeWidth={1.6} />
      </View>
      <View style={styles.chipsRow}>
        <View style={[styles.chip, styles.chipFilled]}>
          <Text style={styles.chipFilledText}>FOOD</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>FACE</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>BODY</Text>
        </View>
      </View>
      <View style={styles.captureBar}>
        <View style={styles.captureRing}>
          <View style={styles.captureCore} />
        </View>
      </View>
    </PreviewFrame>
  );
}

function CoachPreview({ colors, isDark, palette }: PreviewProps) {
  const styles = useMemo(
    () => createPreviewStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );
  return (
    <PreviewFrame
      colors={colors}
      isDark={isDark}
      palette={palette}
      sectionLabel="COACH"
    >
      <View style={styles.coachAvatar}>
        <CoachFeatureIcon color={palette.accentStrong} size={28} strokeWidth={1.8} />
      </View>
      <View style={styles.bubbleAssistant}>
        <View style={[styles.bubbleLine, { width: '88%' }]} />
        <View style={[styles.bubbleLine, { width: '64%' }]} />
        <View style={[styles.bubbleLine, { width: '76%' }]} />
      </View>
      <View style={styles.bubbleUser}>
        <View
          style={[
            styles.bubbleLine,
            styles.bubbleLineInverse,
            { width: '52%' },
          ]}
        />
      </View>
    </PreviewFrame>
  );
}

function SocialPreview({ colors, isDark, palette }: PreviewProps) {
  const styles = useMemo(
    () => createPreviewStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );
  return (
    <PreviewFrame
      colors={colors}
      isDark={isDark}
      palette={palette}
      sectionLabel="COMMUNITY"
    >
      <View style={styles.heroIconWrap}>
        <Users color={palette.accentStrong} size={48} strokeWidth={1.6} />
      </View>
      <View style={styles.avatarsRow}>
        <View style={[styles.communityAvatar, { left: 0 }]} />
        <View
          style={[
            styles.communityAvatar,
            styles.communityAvatarSecondary,
            { left: 22 },
          ]}
        />
        <View
          style={[
            styles.communityAvatar,
            styles.communityAvatarTertiary,
            { left: 44 },
          ]}
        />
        <View style={[styles.communityAvatarMore, { left: 66 }]}>
          <Text style={styles.communityAvatarMoreText}>+8</Text>
        </View>
      </View>
      <View style={styles.feedRow}>
        <View style={styles.feedDot} />
        <View style={[styles.bubbleLine, { width: '68%' }]} />
      </View>
      <View style={styles.feedRow}>
        <View style={styles.feedDot} />
        <View style={[styles.bubbleLine, { width: '54%' }]} />
      </View>
    </PreviewFrame>
  );
}

function AnalyticsPreview({ colors, isDark, palette }: PreviewProps) {
  const styles = useMemo(
    () => createPreviewStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );
  return (
    <PreviewFrame
      colors={colors}
      isDark={isDark}
      palette={palette}
      sectionLabel="ANALYTICS"
    >
      <View style={styles.tabsRow}>
        <View style={[styles.tab, styles.tabActive]}>
          <Text style={styles.tabActiveText}>7D</Text>
        </View>
        <View style={styles.tab}>
          <Text style={styles.tabText}>30D</Text>
        </View>
        <View style={styles.tab}>
          <Text style={styles.tabText}>1Y</Text>
        </View>
      </View>
      <View style={styles.chartWrap}>
        <LineChart
          color={withAlpha(palette.textSecondary, 0.42)}
          size={64}
          strokeWidth={1.4}
          style={styles.chartIcon}
        />
        <View style={styles.bars}>
          {[0.4, 0.55, 0.5, 0.7, 0.62, 0.85, 0.8].map((h, idx) => (
            <View
              key={idx}
              style={[
                styles.bar,
                { height: `${h * 100}%` },
                idx === 5 ? styles.barActive : null,
              ]}
            />
          ))}
        </View>
      </View>
      <View style={styles.metricRow}>
        <Text style={styles.metricBig}>+12%</Text>
        <Text style={styles.metricSmall}>vs last week</Text>
      </View>
    </PreviewFrame>
  );
}

function FridgePreview({ colors, isDark, palette }: PreviewProps) {
  const styles = useMemo(
    () => createPreviewStyles(colors, isDark, palette),
    [colors, isDark, palette],
  );
  return (
    <PreviewFrame
      colors={colors}
      isDark={isDark}
      palette={palette}
      sectionLabel="FRIDGE"
    >
      <View style={styles.fridgeIllustrationShell}>
        <FridgeScanIllustration size={104} colors={colors} isDark />
      </View>
      <View style={styles.recipeRow}>
        <View style={styles.recipeThumb} />
        <View style={styles.recipeBody}>
          <View style={[styles.bubbleLine, { width: '70%' }]} />
          <View style={[styles.bubbleLine, { width: '40%' }]} />
        </View>
      </View>
      <View style={styles.toggleRow}>
        <View style={[styles.toggleChip, styles.toggleChipActive]}>
          <Text style={styles.toggleChipActiveText}>Indulgent</Text>
        </View>
        <View style={styles.toggleChip}>
          <Text style={styles.toggleChipText}>Light</Text>
        </View>
      </View>
    </PreviewFrame>
  );
}

const createStyles = (
  colors: any,
  insets: any,
  isDark: boolean,
  palette: OnboardingPalette,
  isCompactAndroidLayout: boolean,
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.background,
    },
    gradient: {
      flex: 1,
    },
    topWash: {
      position: 'absolute',
      top: -24,
      left: -24,
      right: -24,
      height: 190,
      borderBottomLeftRadius: 56,
      borderBottomRightRadius: 56,
      opacity: 0.95,
    },
    bottomWash: {
      position: 'absolute',
      bottom: -42,
      left: -24,
      right: -24,
      height: 190,
      borderTopLeftRadius: 56,
      borderTopRightRadius: 56,
      opacity: 0.9,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      flex: 1,
      paddingTop: insets.top + (isCompactAndroidLayout ? SPACING.lg : SPACING.xl),
      paddingBottom:
        getMinimumBottomInsetPadding(insets.bottom, SPACING.sm) +
        (isCompactAndroidLayout ? SPACING.lg : SPACING.xl),
      paddingHorizontal: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.lg,
      minHeight: 32,
    },
    brand: {
      fontSize: SIZES.text12,
      fontWeight: '700',
      letterSpacing: 3,
      color: palette.textSecondary,
    },
    headerSpacer: {
      width: 1,
      height: 1,
    },
    skipSlidesButton: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.pill,
    },
    skipSlidesPressed: {
      backgroundColor: palette.accentSofter,
    },
    skipSlidesLabel: {
      fontSize: SIZES.sm,
      fontWeight: '600',
      letterSpacing: 0.5,
      color: palette.textSecondary,
    },
    pagerWrap: {
      flex: 1,
      minHeight: 0,
    },
    stepWrap: {
      flex: 1,
      minHeight: 0,
    },
    pager: {
      flex: 1,
    },
    nativePage: {
      flex: 1,
    },
    pageShell: {
      flex: 1,
      paddingTop: isCompactAndroidLayout ? SPACING.xs : SPACING.md,
    },
    profileCard: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
      paddingVertical: isCompactAndroidLayout ? SPACING.xxl : SPACING.xxxl,
      borderRadius: BORDER_RADIUS.hero,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      backgroundColor: palette.surface,
      alignItems: 'center',
      gap: SPACING.lg,
      ...SHADOWS.soft,
      shadowColor: palette.accent,
      shadowOpacity: isDark ? 0.2 : 0.18,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      overflow: 'hidden',
    },
    profileCardTitle: {
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '700',
      color: palette.textPrimary,
      textAlign: 'center',
      letterSpacing: 0,
    },
    profileCardSubtitle: {
      fontSize: SIZES.lg,
      lineHeight: 28,
      color: palette.textSecondary,
      textAlign: 'center',
      maxWidth: 420,
    },
    skipAvatarButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      alignSelf: 'center',
      borderRadius: BORDER_RADIUS.pill,
    },
    skipAvatarPressed: {
      backgroundColor: palette.accentSofter,
    },
    skipAvatarLabel: {
      color: palette.textSecondary,
      fontSize: SIZES.sm,
      fontWeight: '600',
    },
    footer: {
      gap: isCompactAndroidLayout ? SPACING.md : SPACING.lg,
      paddingTop: isCompactAndroidLayout ? SPACING.md : SPACING.lg,
    },
    progressRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    progressDot: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: palette.inactive,
    },
    progressDotActive: {
      backgroundColor: palette.accent,
    },
    errorContainer: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: withAlpha(colors.error, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.error, 0.2),
    },
    errorText: {
      color: colors.error,
      fontSize: SIZES.sm,
      textAlign: 'center',
    },
  });

const createPreviewStyles = (
  colors: any,
  isDark: boolean,
  palette: OnboardingPalette,
) => {
  const communityOne = mixColors(palette.surfaceElevated, colors.primary, 0.38);
  const communityTwo = mixColors(palette.surfaceElevated, colors.secondary, 0.36);
  const communityThree = mixColors(palette.surfaceElevated, colors.accentGreen, 0.22);

  return StyleSheet.create({
    frame: {
      flex: 1,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      gap: SPACING.sm,
      overflow: 'hidden',
    },
    sectionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sectionDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: palette.accent,
    },
    sectionLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.5,
      color: palette.textMuted,
    },
    body: {
      flex: 1,
      gap: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIconWrap: {
      width: 92,
      height: 92,
      borderRadius: 46,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSofter,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    chipsRow: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: withAlpha(palette.surfaceElevated, 0.72),
    },
    chipText: {
      fontSize: 8,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: palette.textSecondary,
    },
    chipFilled: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    chipFilledText: {
      fontSize: 8,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: palette.textPrimary,
    },
    captureBar: {
      marginTop: SPACING.xs,
      alignItems: 'center',
    },
    captureRing: {
      width: 38,
      height: 38,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: withAlpha(palette.accent, 0.42),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSofter,
    },
    captureCore: {
      width: 24,
      height: 24,
      borderRadius: 999,
      backgroundColor: palette.accent,
    },
    coachAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSecondarySoft,
      borderWidth: 1,
      borderColor: withAlpha(palette.accentSecondary, 0.34),
      alignSelf: 'flex-start',
    },
    bubbleAssistant: {
      alignSelf: 'flex-start',
      maxWidth: '90%',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      borderTopLeftRadius: 4,
      backgroundColor: palette.surfaceGlass,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    bubbleUser: {
      alignSelf: 'flex-end',
      maxWidth: '70%',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      borderTopRightRadius: 4,
      backgroundColor: palette.ctaFill,
      gap: 4,
    },
    bubbleLine: {
      height: 4,
      borderRadius: 4,
      backgroundColor: withAlpha(palette.textSecondary, 0.58),
    },
    bubbleLineInverse: {
      backgroundColor: withAlpha(palette.textPrimary, 0.74),
    },
    avatarsRow: {
      width: 100,
      height: 28,
      position: 'relative',
    },
    communityAvatar: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: communityOne,
      borderWidth: 2,
      borderColor: palette.surface,
    },
    communityAvatarSecondary: {
      backgroundColor: communityTwo,
    },
    communityAvatarTertiary: {
      backgroundColor: communityThree,
    },
    communityAvatarMore: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: palette.ctaFill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: palette.surface,
    },
    communityAvatarMoreText: {
      fontSize: 8,
      fontWeight: '700',
      color: palette.textPrimary,
    },
    feedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      paddingHorizontal: 8,
    },
    feedDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: palette.accent,
    },
    tabsRow: {
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 4,
    },
    tab: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: withAlpha(palette.surfaceElevated, 0.5),
      borderWidth: 1,
      borderColor: palette.border,
    },
    tabActive: {
      backgroundColor: palette.ctaFill,
      borderColor: palette.accent,
    },
    tabText: {
      fontSize: 9,
      fontWeight: '700',
      color: palette.textMuted,
      letterSpacing: 0.5,
    },
    tabActiveText: {
      fontSize: 9,
      fontWeight: '700',
      color: palette.textPrimary,
      letterSpacing: 0.5,
    },
    chartWrap: {
      width: '100%',
      height: 90,
      borderRadius: 12,
      backgroundColor: withAlpha(palette.background, 0.48),
      borderWidth: 1,
      borderColor: palette.border,
      padding: 8,
      position: 'relative',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    },
    chartIcon: {
      position: 'absolute',
      top: 4,
      right: 4,
      opacity: 0.42,
    },
    bars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      height: '78%',
      width: '100%',
    },
    bar: {
      flex: 1,
      borderRadius: 3,
      backgroundColor: withAlpha(palette.textSecondary, 0.24),
    },
    barActive: {
      backgroundColor: palette.accent,
    },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      paddingHorizontal: 4,
    },
    metricBig: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.accentStrong,
      letterSpacing: 0,
    },
    metricSmall: {
      fontSize: 9,
      fontWeight: '500',
      color: palette.textMuted,
    },
    fridgeIllustrationShell: {
      width: 112,
      height: 112,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSofter,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    recipeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 4,
      width: '100%',
    },
    recipeThumb: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: withAlpha(colors.warning, 0.22),
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.34),
    },
    recipeBody: {
      flex: 1,
      gap: 5,
    },
    toggleRow: {
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 4,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    toggleChip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: withAlpha(palette.surfaceElevated, 0.54),
    },
    toggleChipText: {
      fontSize: 9,
      fontWeight: '600',
      color: palette.textSecondary,
    },
    toggleChipActive: {
      backgroundColor: palette.ctaFill,
      borderColor: palette.accent,
    },
    toggleChipActiveText: {
      fontSize: 9,
      fontWeight: '600',
      color: palette.textPrimary,
    },
  });
};
