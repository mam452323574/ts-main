import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Crown, Sparkles, Timer } from 'lucide-react-native';

import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { CoachConversationQuotaStatus } from '@/shared/coachConversation';

export type CoachQuotaBannerKind =
  | 'premium_normal'
  | 'premium_warning'
  | 'premium_exhausted'
  | 'free_active'
  | 'free_warning'
  | 'free_exhausted';

interface CoachQuotaBannerProps {
  kind: CoachQuotaBannerKind;
  title: string;
  body?: string | null;
  ctaLabel?: string | null;
  onPress?: (() => void) | null;
  testID?: string;
}

export function resolveCoachQuotaBannerKind(
  quota: CoachConversationQuotaStatus | null | undefined,
): CoachQuotaBannerKind | null {
  if (!quota) return null;
  if (quota.tier === 'admin') return null;
  if (quota.tier === 'free') {
    if (quota.free_used) return 'free_exhausted';
    const remaining = quota.free_remaining_messages ?? 0;
    if (remaining <= 1) return 'free_warning';
    return 'free_active';
  }
  const available = quota.premium_today_available ?? 0;
  if (available <= 0) return 'premium_exhausted';
  if (available <= 5) return 'premium_warning';
  return 'premium_normal';
}

function CoachQuotaBannerComponent({
  kind,
  title,
  body,
  ctaLabel,
  onPress,
  testID,
}: CoachQuotaBannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, kind), [colors, kind]);

  const Icon = kind === 'premium_normal' || kind === 'free_active' ? Sparkles : kind === 'premium_exhausted' || kind === 'free_exhausted' ? Crown : Timer;

  const content = (
    <Squircle style={styles.bubble}>
      <View style={styles.iconShell}>
        <Icon color={styles.iconColor.color} size={16} strokeWidth={2.2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {body ? (
          <Text style={styles.body} numberOfLines={2}>
            {body}
          </Text>
        ) : null}
      </View>
      {ctaLabel ? <Text style={styles.cta}>{ctaLabel}</Text> : null}
    </Squircle>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.row}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.row} testID={testID}>
      {content}
    </View>
  );
}

function resolveTone(colors: any, kind: CoachQuotaBannerKind) {
  switch (kind) {
    case 'premium_exhausted':
    case 'free_exhausted':
      return {
        background: withAlpha(colors.gold, 0.16),
        border: withAlpha(colors.gold, 0.34),
        iconColor: colors.gold,
        text: colors.primaryText,
      };
    case 'premium_warning':
    case 'free_warning':
      return {
        background: withAlpha(colors.warning, 0.12),
        border: withAlpha(colors.warning, 0.34),
        iconColor: colors.warning,
        text: colors.primaryText,
      };
    case 'free_active':
      return {
        background: withAlpha(colors.success, 0.08),
        border: withAlpha(colors.success, 0.24),
        iconColor: colors.success,
        text: colors.primaryText,
      };
    case 'premium_normal':
    default:
      return {
        background: withAlpha(colors.primary, 0.08),
        border: withAlpha(colors.primary, 0.22),
        iconColor: colors.primary,
        text: colors.primaryText,
      };
  }
}

const createStyles = (colors: any, kind: CoachQuotaBannerKind) => {
  const tone = resolveTone(colors, kind);
  return StyleSheet.create({
    row: {
      width: '100%',
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xs,
    },
    bubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: tone.background,
      borderWidth: 1,
      borderColor: tone.border,
    },
    iconShell: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tone.iconColor, 0.18),
    },
    iconColor: { color: tone.iconColor },
    copy: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: tone.text,
    },
    body: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: withAlpha(tone.text, 0.7),
    },
    cta: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: tone.iconColor,
    },
  });
};

export const CoachQuotaBanner = memo(CoachQuotaBannerComponent);
