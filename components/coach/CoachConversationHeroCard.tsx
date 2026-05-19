import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, MessageCircle, Sparkles } from 'lucide-react-native';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { COACH_CONVERSATION_FREE_USER_LIMIT } from '@/shared/coachConversation';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';

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
  const visual = getCoachPersonaVisual(personaKey);
  const styles = useMemo(
    () => createStyles(colors, isDark, variant, visual.haloTint),
    [colors, isDark, variant, visual.haloTint],
  );
  const MetaIcon =
    variant === 'free_exhausted' || variant === 'premium_exhausted'
      ? Sparkles
      : MessageCircle;
  const metaLabel = resolveMetaLabel(variant, hint);
  const accessibilityLabel = [title, subtitle, hint, ctaLabel]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('. ');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && !disabled ? styles.pressed : null]}
      testID={testID}
    >
      <Squircle
        style={[styles.card, disabled ? styles.cardDisabled : null]}
        testID={`${testID}-surface`}
      >
        <CoachPersonaAvatar
          imageSource={visual.imageSource}
          fallbackLabel={visual.fallbackLabel}
          haloTint={visual.haloTint}
          size={42}
          emphasis="subtle"
          testID={`${testID}-avatar`}
        />
        <View style={styles.copy}>
          <View style={styles.metaPill} testID={`${testID}-meta`}>
            <MetaIcon
              color={styles.iconColor.color}
              size={13}
              strokeWidth={2.2}
              testID={`${testID}-meta-icon`}
            />
            <Text numberOfLines={1} style={styles.metaText}>
              {metaLabel}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.title} testID={`${testID}-title`}>
            {title}
          </Text>
          <View style={styles.subtitleRow}>
            <Text
              numberOfLines={2}
              style={styles.subtitle}
              testID={`${testID}-subtitle`}
            >
              {subtitle}
            </Text>
            {hint && !metaLabel.includes(hint) ? (
              <Text numberOfLines={1} style={styles.hint} testID={`${testID}-hint`}>
                {hint}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.actionIconShell} testID={`${testID}-action`}>
          <ChevronRight
            color={styles.actionIconColor.color}
            size={18}
            strokeWidth={2.5}
            testID={`${testID}-action-icon`}
          />
        </View>
      </Squircle>
    </Pressable>
  );
}

function resolveMetaLabel(variant: CoachConversationHeroVariant, hint?: string | null) {
  switch (variant) {
    case 'free_available':
      return `Conversation gratuite • ${COACH_CONVERSATION_FREE_USER_LIMIT} questions incluses`;
    case 'free_resume':
    case 'premium_resume':
      return hint ? `Conversation en cours • ${hint}` : 'Conversation en cours';
    case 'free_exhausted':
      return 'Limite gratuite atteinte';
    case 'premium_available':
      return hint ? `Premium • ${hint}` : 'Parler au coach';
    case 'premium_exhausted':
      return 'Limite quotidienne atteinte';
    case 'unknown':
    default:
      return 'Parler au coach';
  }
}

function resolveTone(
  colors: any,
  isDark: boolean,
  variant: CoachConversationHeroVariant,
  personaAccent: string,
) {
  const accent =
    variant === 'free_exhausted' || variant === 'premium_exhausted'
      ? colors.gold
      : personaAccent ?? colors.primary;
  const baseSurface = isDark
    ? colors.surfaceElevated ?? colors.cardBackground ?? '#121212'
    : colors.cardBackground ?? '#FFFFFF';
  const neutralBorder = isDark
    ? withAlpha(colors.white ?? colors.primaryText, 0.1)
    : withAlpha(colors.primaryText, 0.07);
  const backgroundMix =
    variant === 'free_exhausted' || variant === 'premium_exhausted'
      ? isDark ? 0.06 : 0.025
      : isDark ? 0.04 : 0.016;
  const metaAlpha =
    variant === 'free_exhausted' || variant === 'premium_exhausted'
      ? isDark ? 0.15 : 0.1
      : isDark ? 0.12 : 0.07;

  return {
    background: mixColors(baseSurface, accent, backgroundMix),
    border: neutralBorder,
    iconColor: accent,
    metaBackground: withAlpha(accent, metaAlpha),
    actionBackground: isDark
      ? withAlpha(colors.white ?? colors.primaryText, 0.055)
      : withAlpha(colors.primaryText, 0.035),
    actionBorder: isDark
      ? withAlpha(colors.white ?? colors.primaryText, 0.1)
      : withAlpha(colors.primaryText, 0.06),
    shadowColor: isDark ? accent : mixColors(colors.gray ?? colors.primaryText, accent, 0.16),
  };
}

const createStyles = (
  colors: any,
  isDark: boolean,
  variant: CoachConversationHeroVariant,
  personaAccent: string,
) => {
  const tone = resolveTone(colors, isDark, variant, personaAccent);
  return StyleSheet.create({
    pressable: {
      width: '100%',
    },
    pressed: {
      opacity: 0.92,
      transform: [{ scale: 0.995 }],
    },
    card: {
      minHeight: 86,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm + 2,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: tone.background,
      borderWidth: 1,
      borderColor: tone.border,
      shadowColor: tone.shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.04 : 0.025,
      shadowRadius: 10,
      elevation: 1,
    },
    cardDisabled: {
      opacity: 0.68,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    metaPill: {
      maxWidth: '100%',
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: tone.metaBackground,
    },
    metaText: {
      flexShrink: 1,
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: tone.iconColor,
    },
    iconColor: { color: tone.iconColor },
    actionIconColor: {
      color: colors.primaryText,
    },
    title: {
      fontSize: SIZES.text16,
      lineHeight: 21,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    subtitleRow: {
      gap: 2,
    },
    subtitle: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.medium,
      color: withAlpha(colors.primaryText, isDark ? 0.7 : 0.62),
    },
    hint: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: tone.iconColor,
    },
    actionIconShell: {
      width: 34,
      height: 34,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: tone.actionBackground,
      borderWidth: 1,
      borderColor: tone.actionBorder,
    },
  });
};

export const CoachConversationHeroCard = memo(CoachConversationHeroCardComponent);
