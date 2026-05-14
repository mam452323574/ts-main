import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
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
import {
  OnboardingHeroStage,
  OnboardingSlide,
  PhoneMockup,
} from '@/components/auth';
import {
  buildOnboardingPalette,
  type OnboardingPalette,
} from '@/components/auth/tokens';
import { FridgeScanIllustration } from '@/components/home/FridgeScanIllustration';
import { NativePagerView } from '@/components/NativePagerView';
import {
  BORDER_RADIUS,
  FONT_FAMILIES,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import {
  getOnboardingPromoAsset,
  type OnboardingPromoSlideKey,
} from '@/constants/onboardingPromoAssets';
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
import {
  clearPostSignupOnboardingPending,
} from '@/utils/postSignupOnboarding';
import { entryOfferSession } from '@/utils/entryOfferSession';
import { getMinimumBottomInsetPadding } from '@/utils/mobileLayout';

const TOTAL_SLIDES = 5;

interface SlideContent {
  key: OnboardingPromoSlideKey;
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
        windowHeight,
      ),
    [
      colors,
      insets,
      isCompactAndroidLayout,
      isDark,
      onboardingPalette,
      windowHeight,
    ],
  );
  const gradientColors = useMemo<[string, string, string]>(
    () => onboardingPalette.backgroundGradient,
    [onboardingPalette.backgroundGradient],
  );
  const onboardingThemeVariant = isDark ? 'dark' : 'light';
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
  const currentSlide = slides[currentPage];
  const shouldShowSocialAvatarPrompt =
    currentSlide?.key === 'social' && !hasAvatar;

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

  const handlePrimaryAction = async () => {
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

  const renderSlide = (slide: SlideContent) => {
    const promoAsset = getOnboardingPromoAsset(onboardingThemeVariant, slide.key);

    return (
      <View
        key={slide.key}
        style={[
          styles.pageShell,
          promoAsset ? styles.pageShellPromo : null,
        ]}
      >
        {promoAsset ? (
          <PromoHeroSlide
            slide={slide}
            source={promoAsset}
            colors={colors}
            isDark={isDark}
            palette={onboardingPalette}
            styles={styles}
          />
        ) : (
          <View
            style={styles.fallbackSlideWrap}
            testID={`post-signup-fallback-slide-${slide.key}`}
          >
            <OnboardingSlide
              eyebrow={slide.eyebrow}
              title={slide.title}
              subtitle={slide.subtitle}
              bullets={slide.bullets}
              visual={<PhoneMockup>{slide.preview}</PhoneMockup>}
            />
          </View>
        )}
      </View>
    );
  };

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
    isPendingLoading || !userProfile?.username
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
          <View
            style={[
              styles.header,
              styles.headerSlides,
            ]}
          >
            <Text
              style={[
                styles.brand,
                styles.brandSlides,
              ]}
            >
              HEALTH SCAN
            </Text>
            {currentPage < TOTAL_SLIDES - 1 ? (
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
                <Text
                  style={[
                    styles.skipSlidesLabel,
                    styles.skipSlidesLabelSlides,
                  ]}
                >
                  {t('common.skip')}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>

          <View style={styles.pagerWrap}>{renderSlidesStep()}</View>

          <View
            style={[
              styles.footer,
              styles.footerSlides,
            ]}
          >
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

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {shouldShowSocialAvatarPrompt && user ? (
              <LinearGradient
                colors={onboardingPalette.cardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.socialAvatarPrompt}
                testID="post-signup-social-avatar-prompt"
              >
                <View style={styles.socialAvatarPromptCopy}>
                  <Text style={styles.socialAvatarPromptTitle}>
                    {t('onboarding.social_avatar_prompt_title')}
                  </Text>
                  <Text style={styles.socialAvatarPromptSubtitle}>
                    {t('onboarding.social_avatar_prompt_subtitle')}
                  </Text>
                </View>
                <AvatarPicker
                  userId={user.id}
                  currentAvatarUrl={
                    selectedAvatarReference ?? userProfile?.avatar_url
                  }
                  onAvatarSelected={handleAvatarSelected}
                  size={88}
                />
              </LinearGradient>
            ) : null}

            <Button
              title={
                currentPage === TOTAL_SLIDES - 1
                  ? t('onboarding.enter_app')
                  : t('common.next')
              }
              onPress={handlePrimaryAction}
              loading={completing}
              disabled={completing}
              variant="premium"
              size="lg"
            />
          </View>
        </View>
      </LinearGradient>
    </AppScreen>
  );
}

interface PromoHeroSlideProps {
  slide: SlideContent;
  source: ImageSourcePropType;
  colors: any;
  isDark: boolean;
  palette: OnboardingPalette;
  styles: ReturnType<typeof createStyles>;
}

function PromoHeroSlide({
  slide,
  source,
  colors,
  isDark,
  palette,
  styles,
}: PromoHeroSlideProps) {
  const accentColor = getPromoHeroAccent(slide.key, colors);
  const assetMetadata = Image.resolveAssetSource(source);
  const assetRatio =
    assetMetadata?.width && assetMetadata?.height
      ? assetMetadata.width / assetMetadata.height
      : 0.56;
  const heroImageScale = assetRatio >= 0.63 ? 1.025 : 1.045;
  const topFadeColors: [string, string, string] = isDark
    ? [
        withAlpha(palette.background, 0.74),
        withAlpha(palette.background, 0.32),
        withAlpha(palette.background, 0),
      ]
    : [
        withAlpha(palette.background, 0.52),
        withAlpha(palette.background, 0.18),
        withAlpha(palette.background, 0),
      ];
  const bottomFadeColors: [string, string, string] = isDark
    ? [
        withAlpha(palette.background, 0),
        withAlpha(palette.background, 0.54),
        withAlpha(palette.background, 0.88),
      ]
    : [
        withAlpha(palette.background, 0),
        withAlpha(palette.background, 0.38),
        withAlpha(palette.background, 0.72),
      ];

  return (
    <View
      style={styles.promoHeroWrap}
      testID={`post-signup-promo-slide-${slide.key}`}
    >
      <Image
        source={source}
        resizeMode="cover"
        blurRadius={34}
        style={[
          styles.promoHeroBackdropImage,
          { opacity: isDark ? 0.3 : 0.22 },
        ]}
      />
      <View
        style={[
          styles.promoHeroGlow,
          {
            backgroundColor: withAlpha(accentColor, isDark ? 0.28 : 0.16),
          },
        ]}
      />
      <LinearGradient
        colors={[
          withAlpha(accentColor, isDark ? 0.2 : 0.12),
          withAlpha(palette.background, 0),
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.promoHeroAmbientGradient}
      />

      <OnboardingHeroStage
        accentColor={accentColor}
        style={styles.promoHeroStage}
        contentStyle={styles.promoHeroStageContent}
      >
        <Image
          source={source}
          resizeMode="cover"
          testID={`post-signup-promo-hero-image-${slide.key}`}
          style={[
            styles.promoHeroImage,
            { transform: [{ scale: heroImageScale }] },
          ]}
        />
        <LinearGradient
          colors={topFadeColors}
          locations={[0, 0.58, 1]}
          style={styles.promoHeroTopFade}
        />
        <LinearGradient
          colors={bottomFadeColors}
          locations={[0, 0.52, 1]}
          style={styles.promoHeroBottomFade}
        />
        <View style={styles.promoHeroCopy}>
          <Text style={[styles.promoHeroEyebrow, { color: accentColor }]}>
            {slide.eyebrow}
          </Text>
          <Text
            style={styles.promoHeroTitle}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {slide.title}
          </Text>
          <Text style={styles.promoHeroSubtitle} numberOfLines={2}>
            {slide.subtitle}
          </Text>
          <View style={styles.promoHeroBulletRow}>
            {slide.bullets.map((bullet) => (
              <View key={bullet} style={styles.promoHeroBullet}>
                <Text style={styles.promoHeroBulletText} numberOfLines={1}>
                  {bullet}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </OnboardingHeroStage>
    </View>
  );
}

function getPromoHeroAccent(slideKey: OnboardingPromoSlideKey, colors: any) {
  switch (slideKey) {
    case 'coach':
      return colors.secondary;
    case 'social':
      return colors.accentGreen;
    case 'analytics':
      return colors.secondary;
    case 'fridge':
      return colors.warning;
    case 'scanner':
    default:
      return colors.primary;
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
        <FridgeScanIllustration size={104} colors={colors} isDark={isDark} />
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
  windowHeight: number,
) => {
  const contentTopPadding =
    insets.top + (isCompactAndroidLayout ? SPACING.lg : SPACING.xl);
  const contentBottomPadding =
    getMinimumBottomInsetPadding(insets.bottom, SPACING.sm) +
    (isCompactAndroidLayout ? SPACING.lg : SPACING.xl);
  const headerHeight = 32;
  const headerSlideMargin = isCompactAndroidLayout ? SPACING.xs : SPACING.sm;
  const footerSlidesPaddingTop = isCompactAndroidLayout ? SPACING.sm : SPACING.md;
  const footerSlidesGap = isCompactAndroidLayout ? SPACING.sm : SPACING.md;
  const footerEstimatedHeight =
    footerSlidesPaddingTop + 3 + footerSlidesGap + 60;
  const heroSafetyGap = isCompactAndroidLayout ? SPACING.xs : SPACING.sm;
  const availableHeroHeight = Math.max(
    280,
    windowHeight -
      contentTopPadding -
      contentBottomPadding -
      headerHeight -
      headerSlideMargin -
      footerEstimatedHeight -
      heroSafetyGap,
  );
  const promoHeroMinHeight = Math.min(
    Math.round(windowHeight * (isCompactAndroidLayout ? 0.46 : 0.5)),
    availableHeroHeight,
  );
  const promoHeroMaxHeight = Math.round(
    windowHeight * (isCompactAndroidLayout ? 0.68 : 0.72),
  );
  const promoHeroTargetHeight = clampNumber(
    Math.round(availableHeroHeight),
    promoHeroMinHeight,
    promoHeroMaxHeight,
  );

  return StyleSheet.create({
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
      paddingTop: contentTopPadding,
      paddingBottom: contentBottomPadding,
      paddingHorizontal: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.lg,
      minHeight: 32,
    },
    headerSlides: {
      marginBottom: isCompactAndroidLayout ? SPACING.xs : SPACING.sm,
    },
    brand: {
      fontSize: SIZES.text12,
      fontWeight: '700',
      fontFamily: FONT_FAMILIES.display,
      letterSpacing: 2.4,
      color: palette.accentSecondary,
    },
    brandSlides: {
      opacity: 0.72,
    },
    headerSpacer: {
      width: 1,
      height: 1,
    },
    skipSlidesButton: {
      minHeight: 36,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: palette.secondaryActionFill,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder,
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
    skipSlidesLabelSlides: {
      opacity: 0.82,
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
    pageShellPromo: {
      paddingTop: 0,
    },
    promoHeroWrap: {
      flex: 1,
      minHeight: 0,
      marginHorizontal: isCompactAndroidLayout ? -SPACING.sm : -SPACING.md,
      paddingTop: isCompactAndroidLayout ? 0 : SPACING.xs,
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'hidden',
    },
    promoHeroBackdropImage: {
      position: 'absolute',
      top: -72,
      right: -48,
      bottom: -56,
      left: -48,
      transform: [{ scale: 1.14 }],
    },
    promoHeroGlow: {
      position: 'absolute',
      top: '9%',
      left: '12%',
      width: '76%',
      height: '58%',
      borderRadius: 999,
      transform: [{ scaleX: 1.16 }],
    },
    promoHeroAmbientGradient: {
      position: 'absolute',
      top: -12,
      right: 0,
      left: 0,
      height: '64%',
      opacity: isDark ? 0.9 : 0.72,
    },
    promoHeroStage: {
      width: '100%',
      height: promoHeroTargetHeight,
      minHeight: promoHeroMinHeight,
      maxHeight: '100%',
      borderRadius: isCompactAndroidLayout ? 18 : 22,
    },
    promoHeroStageContent: {
      padding: 0,
    },
    promoHeroImage: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
    },
    promoHeroTopFade: {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      height: '34%',
    },
    promoHeroBottomFade: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      height: '42%',
    },
    promoHeroCopy: {
      position: 'absolute',
      right: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
      bottom: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
      left: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
      gap: isCompactAndroidLayout ? SPACING.xs : SPACING.sm,
    },
    promoHeroEyebrow: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    promoHeroTitle: {
      fontSize: isCompactAndroidLayout ? 28 : 32,
      lineHeight: isCompactAndroidLayout ? 32 : 36,
      fontFamily: FONT_FAMILIES.display,
      color: palette.textPrimary,
      letterSpacing: -0.3,
    },
    promoHeroSubtitle: {
      fontSize: isCompactAndroidLayout ? SIZES.sm : SIZES.md,
      lineHeight: isCompactAndroidLayout ? 19 : 22,
      fontWeight: '500',
      color: palette.textSecondary,
      maxWidth: 420,
    },
    promoHeroBulletRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: SPACING.xs,
      maxWidth: 420,
    },
    promoHeroBullet: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: withAlpha(palette.surfaceGlass, isDark ? 0.84 : 0.74),
      borderWidth: 1,
      borderColor: withAlpha(palette.textPrimary, isDark ? 0.12 : 0.08),
    },
    promoHeroBulletText: {
      fontSize: SIZES.xs,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: palette.textPrimary,
    },
    fallbackSlideWrap: {
      flex: 1,
    },
    socialAvatarPrompt: {
      paddingHorizontal: isCompactAndroidLayout ? SPACING.md : SPACING.lg,
      paddingVertical: isCompactAndroidLayout ? SPACING.md : SPACING.lg,
      borderRadius: BORDER_RADIUS.hero,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      backgroundColor: palette.surfaceGlass,
      alignItems: 'center',
      gap: SPACING.md,
      ...SHADOWS.soft,
      shadowColor: palette.accent,
      shadowOpacity: isDark ? 0.16 : 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      overflow: 'hidden',
    },
    socialAvatarPromptCopy: {
      gap: SPACING.xs,
      alignItems: 'center',
    },
    socialAvatarPromptTitle: {
      fontSize: isCompactAndroidLayout ? SIZES.lg : SIZES.xl,
      lineHeight: isCompactAndroidLayout ? 24 : 28,
      fontFamily: FONT_FAMILIES.display,
      color: palette.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.2,
    },
    socialAvatarPromptSubtitle: {
      fontSize: SIZES.sm,
      lineHeight: 20,
      color: palette.textSecondary,
      textAlign: 'center',
    },
    footer: {
      gap: isCompactAndroidLayout ? SPACING.md : SPACING.lg,
      paddingTop: isCompactAndroidLayout ? SPACING.md : SPACING.lg,
      paddingHorizontal: isCompactAndroidLayout ? SPACING.xs : SPACING.sm,
    },
    footerSlides: {
      gap: isCompactAndroidLayout ? SPACING.sm : SPACING.md,
      paddingTop: isCompactAndroidLayout ? SPACING.sm : SPACING.md,
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignSelf: 'center',
      gap: 6,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: palette.secondaryActionFill,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder,
    },
    progressDot: {
      width: 14,
      height: 4,
      borderRadius: 999,
      backgroundColor: palette.progressInactive,
    },
    progressDotActive: {
      width: 28,
      backgroundColor: palette.progressActive,
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
};

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
