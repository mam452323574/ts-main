import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle } from 'lucide-react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { Squircle, SquirclePressable } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getCoachOnMediaTokens,
  getVisualMoodSurface,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getCoachPersona, type CoachPersonaKey } from '@/shared/coachPersonas';
import {
  getCoachPersonaCrop,
  getCoachPersonaVisual,
} from '@/shared/coachPersonaVisuals';

export type CoachConversationHeroVariant =
  | 'free_available'
  | 'free_resume'
  | 'free_exhausted'
  | 'premium_available'
  | 'premium_resume'
  | 'premium_exhausted'
  | 'unknown';

interface CoachConversationHeroCardProps {
  personaKey: CoachPersonaKey;
  variant: CoachConversationHeroVariant;
  title: string;
  subtitle: string;
  ctaLabel: string;
  hint?: string | null;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

const GRADIENT_ANCHOR = '#0F1A2A';
const CARD_MIN_HEIGHT = 286;
const PORTRAIT_WIDTH = 187;
const PORTRAIT_HEIGHT = 280;
const PORTRAIT_SPACER_WIDTH = 165;
const PORTRAIT_HALO_SIZE = 260;

function CoachConversationHeroCardComponent({
  personaKey,
  variant,
  title,
  subtitle,
  ctaLabel,
  hint,
  disabled = false,
  onPress,
  testID = 'coach-conversation-hero-card',
}: CoachConversationHeroCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const visual = getCoachPersonaVisual(personaKey);
  const persona = getCoachPersona(personaKey);
  const heroCrop = getCoachPersonaCrop(visual, 'hero');
  const heroContentPosition = heroCrop.contentPosition ?? 'bottom';
  const heroImageScale = heroCrop.imageScale;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [visual.imageSource]);

  const isLimitState =
    variant === 'free_exhausted' || variant === 'premium_exhausted';
  const accent = isLimitState ? colors.gold : visual.haloTint;

  const tone = useMemo(
    () => buildTone(colors, isDark, accent),
    [colors, isDark, accent],
  );
  const cardSurface = useMemo(
    () =>
      getVisualMoodSurface(colors, isDark, {
        mood: 'obsidian',
        accentColor: accent,
        intensity: 'card',
      }),
    [colors, isDark, accent],
  );
  const styles = useMemo(
    () => createStyles(tone, cardSurface),
    [tone, cardSurface],
  );

  const coachName = t(persona.titleTranslationKey);
  const showWithCoachName =
    variant === 'free_available' || variant === 'premium_available';
  const heroTitle = showWithCoachName
    ? t('coach.conversation_hero.title_with_coach', { coachName })
    : title;

  const accessibilityLabel = [heroTitle, subtitle, hint, ctaLabel]
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
    .join('. ');

  return (
    <Squircle
      style={[styles.shell, disabled ? styles.shellDisabled : null]}
      testID={`${testID}-shell`}
    >
    <SquirclePressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <LinearGradient
        colors={[tone.gradientTop, tone.gradientMid, tone.gradientBottom]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.gradient}
        testID={`${testID}-gradient`}
      />
      <Svg
        width={PORTRAIT_HALO_SIZE}
        height={PORTRAIT_HALO_SIZE}
        style={styles.portraitHalo}
        pointerEvents="none"
        testID={`${testID}-halo`}
      >
        <Defs>
          <RadialGradient id="coachHeroHalo" cx="50%" cy="50%" r="50%">
            <Stop
              offset="0%"
              stopColor={accent}
              stopOpacity={isDark ? 0.55 : 0.45}
            />
            <Stop
              offset="45%"
              stopColor={accent}
              stopOpacity={isDark ? 0.24 : 0.2}
            />
            <Stop offset="100%" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle
          cx={PORTRAIT_HALO_SIZE / 2}
          cy={PORTRAIT_HALO_SIZE / 2}
          r={PORTRAIT_HALO_SIZE / 2}
          fill="url(#coachHeroHalo)"
        />
      </Svg>
      {visual.imageSource && !imageFailed ? (
        <Image
          source={visual.imageSource}
          style={[
            styles.portraitImage,
            heroImageScale ? { transform: [{ scale: heroImageScale }] } : null,
          ]}
          contentFit="contain"
          contentPosition={heroContentPosition}
          onError={() => setImageFailed(true)}
          testID={`${testID}-portrait`}
        />
      ) : (
        <View
          style={styles.portraitFallback}
          testID={`${testID}-portrait-fallback`}
        >
          <CoachPersonaAvatar
            fallbackLabel={visual.fallbackLabel}
            haloTint={visual.haloTint}
            size={90}
            emphasis="featured"
          />
        </View>
      )}
      <View style={styles.surfaceContent} testID={`${testID}-surface`}>
        <View style={styles.portraitSpacer} />
        <View style={styles.rightColumn} testID={`${testID}-content`}>
          <Text
            numberOfLines={2}
            style={styles.title}
            testID={`${testID}-title`}
          >
            {heroTitle}
          </Text>
          <View style={styles.ctaButton} testID={`${testID}-cta`}>
            <MessageCircle
              color={tone.ctaText}
              size={16}
              strokeWidth={2.2}
              testID={`${testID}-cta-icon`}
            />
            <Text numberOfLines={1} style={styles.ctaLabel}>
              Parler au coach
            </Text>
          </View>
        </View>
      </View>
      <View
        style={styles.selectedCoachPill}
        pointerEvents="none"
        testID={`${testID}-selected-coach-pill`}
      >
        <View style={styles.selectedCoachPillInner}>
          <Text style={styles.selectedCoachPillLabel} numberOfLines={1}>
            {t('coach.selected_persona_label')}
          </Text>
          <View style={styles.selectedCoachPillNameLayer}>
            <Text
              style={styles.selectedCoachPillNameGlow}
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {coachName}
            </Text>
            <Text style={styles.selectedCoachPillName} numberOfLines={1}>
              {coachName}
            </Text>
          </View>
        </View>
      </View>
    </SquirclePressable>
    </Squircle>
  );
}

function buildTone(colors: any, isDark: boolean, accent: string) {
  const gradientTop = GRADIENT_ANCHOR;
  const gradientMid = mixColors(gradientTop, accent, 0.25);
  const gradientBottom = mixColors(gradientTop, accent, 0.5);
  const onMedia = getCoachOnMediaTokens(isDark);

  return {
    gradientTop,
    gradientMid,
    gradientBottom,
    ctaBg: mixColors(accent, GRADIENT_ANCHOR, isDark ? 0.42 : 0.3),
    ctaBorder: withAlpha(colors.white, isDark ? 0.34 : 0.28),
    ctaText: onMedia.textPrimary,
    ctaTextShadow: onMedia.textShadowColor,
    titleColor: withAlpha(colors.white, 0.96),
    shadowColor: accent,
    cardBorder: withAlpha(colors.white, isDark ? 0.22 : 0.16),
    // Pill background stays tinted with GRADIENT_ANCHOR (the card's own
    // palette) rather than pure black — keeps the look cohesive with the
    // hero gradient while remaining opaque enough for contrast.
    selectedPillBg: withAlpha(GRADIENT_ANCHOR, isDark ? 0.78 : 0.7),
    selectedPillBorder: withAlpha(accent, isDark ? 0.45 : 0.4),
    selectedPillLabel: onMedia.textSecondary,
    selectedPillNameColor: onMedia.textPrimary,
    selectedPillGlow: withAlpha(accent, isDark ? 0.85 : 0.55),
    selectedPillHalo: onMedia.textShadowColor,
    selectedPillLabelShadow: onMedia.textShadowColor,
  };
}

const createStyles = (
  tone: ReturnType<typeof buildTone>,
  cardSurface: ReturnType<typeof getVisualMoodSurface>,
) =>
  StyleSheet.create({
    shell: {
      width: '100%',
      borderRadius: BORDER_RADIUS.hero,
      ...cardSurface,
    },
    shellDisabled: {
      opacity: 0.55,
    },
    card: {
      width: '100%',
      minHeight: CARD_MIN_HEIGHT,
      borderRadius: BORDER_RADIUS.hero,
      borderWidth: 1,
      borderColor: tone.cardBorder,
      backgroundColor: tone.gradientTop,
      overflow: 'hidden',
    },
    pressed: {
      opacity: 0.92,
      transform: [{ scale: 0.995 }],
    },
    gradient: {
      ...StyleSheet.absoluteFillObject,
    },
    portraitHalo: {
      position: 'absolute',
      left: PORTRAIT_WIDTH / 2 - PORTRAIT_HALO_SIZE / 2 - 4,
      bottom: PORTRAIT_HEIGHT / 2 - PORTRAIT_HALO_SIZE / 2 - 8,
    },
    portraitImage: {
      position: 'absolute',
      left: -10,
      bottom: 0,
      width: PORTRAIT_WIDTH,
      height: PORTRAIT_HEIGHT,
    },
    portraitFallback: {
      position: 'absolute',
      left: SPACING.md,
      top: 0,
      bottom: 0,
      width: PORTRAIT_SPACER_WIDTH - SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    surfaceContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    portraitSpacer: {
      width: PORTRAIT_SPACER_WIDTH,
      flexShrink: 0,
    },
    rightColumn: {
      flex: 1,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.lg + 40,
      paddingRight: SPACING.md,
      gap: SPACING.sm,
      justifyContent: 'center',
    },
    title: {
      fontSize: SIZES.text18,
      lineHeight: 23,
      fontWeight: FONT_WEIGHTS.bold,
      color: tone.titleColor,
    },
    ctaButton: {
      marginTop: 4,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: tone.ctaBg,
      borderWidth: 1,
      borderColor: tone.ctaBorder,
    },
    ctaLabel: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: tone.ctaText,
      letterSpacing: 0.2,
      textShadowColor: tone.ctaTextShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    selectedCoachPill: {
      position: 'absolute',
      bottom: SPACING.sm + 2,
      right: SPACING.md,
      zIndex: 5,
      elevation: 5,
    },
    selectedCoachPillInner: {
      minWidth: 112,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: tone.selectedPillBg,
      borderWidth: 1,
      borderColor: tone.selectedPillBorder,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
    selectedCoachPillLabel: {
      fontSize: 9,
      lineHeight: 11,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: tone.selectedPillLabel,
      textAlign: 'center',
      textShadowColor: tone.selectedPillLabelShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    selectedCoachPillNameLayer: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 18,
    },
    selectedCoachPillNameGlow: {
      ...StyleSheet.absoluteFillObject,
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: 'transparent',
      textAlign: 'center',
      letterSpacing: 0.3,
      textShadowColor: tone.selectedPillGlow,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 12,
    },
    selectedCoachPillName: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: tone.selectedPillNameColor,
      textAlign: 'center',
      letterSpacing: 0.3,
      textShadowColor: tone.selectedPillHalo,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 4,
    },
  });

export const CoachConversationHeroCard = memo(CoachConversationHeroCardComponent);
