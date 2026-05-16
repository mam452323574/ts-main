import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CoachFeatureIcon } from '@/components/FeatureIcons';
import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getVisualMoodSurface,
  mixColors,
  softenAccentColor,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';

interface CoachActionComposerProps {
  personaTitle: string;
  promptTitle: string;
  actionLabel: string;
  actionA11yLabel: string;
  personaVisual: CoachPersonaVisual;
  busy?: boolean;
  disabled?: boolean;
  muted?: boolean;
  onPress: () => void;
  testID?: string;
  actionTestID?: string;
}

export function CoachActionComposer({
  personaTitle,
  promptTitle,
  actionLabel,
  actionA11yLabel,
  personaVisual,
  busy = false,
  disabled = false,
  muted = false,
  onPress,
  testID = 'coach-action-composer',
  actionTestID,
}: CoachActionComposerProps) {
  const { colors, isDark } = useTheme();
  const actionChrome = useMemo(
    () => getCoachActionButtonChrome(colors, isDark, personaVisual.haloTint),
    [colors, isDark, personaVisual.haloTint],
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, personaVisual.haloTint, actionChrome),
    [actionChrome, colors, isDark, personaVisual.haloTint],
  );
  const foregroundColor =
    muted || disabled ? colors.primaryText : actionChrome.foregroundColor;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.summary} testID={`${testID}-summary`}>
        <CoachPersonaAvatar
          imageSource={personaVisual.imageSource}
          fallbackLabel={personaVisual.fallbackLabel}
          haloTint={personaVisual.haloTint}
          size={38}
          emphasis="subtle"
          testID={`${testID}-avatar`}
        />
        <View style={styles.summaryCopy}>
          <Text
            numberOfLines={1}
            style={styles.promptTitle}
            testID={`${testID}-prompt-title`}
          >
            {promptTitle}
          </Text>
          <Text
            numberOfLines={1}
            style={styles.metaText}
            testID={`${testID}-persona-title`}
          >
            {personaTitle}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionA11yLabel}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionButton,
          muted || disabled ? styles.actionButtonMuted : null,
          pressed && !disabled ? styles.actionButtonPressed : null,
        ]}
        testID={actionTestID ?? `${testID}-primary`}
      >
        {busy ? (
          <ActivityIndicator color={foregroundColor} size="small" />
        ) : (
          <CoachFeatureIcon
            color={foregroundColor}
            size={16}
            strokeWidth={2.4}
          />
        )}
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.84}
          numberOfLines={1}
          style={[
            styles.actionLabel,
            muted || disabled ? styles.actionLabelMuted : null,
          ]}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function normalizeHexColor(color: string | null | undefined) {
  if (!color || !color.startsWith('#')) {
    return null;
  }

  const hex = color.slice(1);
  if (hex.length === 3) {
    return hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return hex.length === 6 ? hex : null;
}

function getRelativeLuminance(color: string | null | undefined) {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return null;
  }

  const channelToLinear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map((offset) =>
    channelToLinear(Number.parseInt(normalized.slice(offset, offset + 2), 16)),
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(colorA: string, colorB: string) {
  const luminanceA = getRelativeLuminance(colorA);
  const luminanceB = getRelativeLuminance(colorB);
  if (luminanceA === null || luminanceB === null) {
    return null;
  }

  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveReadableButtonForeground(backgroundColor: string, colors: any) {
  const lightForeground = colors.white ?? '#FFFFFF';
  const darkForeground = colors.primaryText ?? '#1C1C1E';
  const backgroundLuminance = getRelativeLuminance(backgroundColor);
  const lightContrast = getContrastRatio(lightForeground, backgroundColor) ?? 0;
  const darkContrast = getContrastRatio(darkForeground, backgroundColor) ?? 0;

  if (
    backgroundLuminance !== null &&
    backgroundLuminance > 0.72 &&
    darkContrast >= 4.5
  ) {
    return darkForeground;
  }

  if (lightContrast >= 4.5 || lightContrast >= darkContrast) {
    return lightForeground;
  }

  return darkForeground;
}

function getCoachActionButtonChrome(
  colors: any,
  isDark: boolean,
  accentColor: string,
) {
  const buttonAccent = softenAccentColor(colors, isDark, accentColor, 'selected');
  const backgroundColor = isDark
    ? mixColors(colors.surfaceElevated ?? colors.cardBackground, buttonAccent, 0.26)
    : mixColors(colors.primaryText, buttonAccent, 0.08);

  return {
    backgroundColor,
    foregroundColor: resolveReadableButtonForeground(backgroundColor, colors),
    accentColor: buttonAccent,
    borderColor: withAlpha(buttonAccent, isDark ? 0.28 : 0.18),
  };
}

const createStyles = (
  colors: any,
  isDark: boolean,
  accentColor: string,
  actionChrome: ReturnType<typeof getCoachActionButtonChrome>,
) => {
  const dockSurface = getVisualMoodSurface(colors, isDark, {
    mood: 'obsidian',
    accentColor,
    intensity: 'card',
  });
  const { backgroundColor: dockBackgroundColor } = dockSurface;
  const isAndroid = Platform.OS === 'android';
  const floatingSurfaceBackground = isDark
    ? withAlpha(
        mixColors(colors.surfaceElevated ?? colors.cardBackground ?? '#121212', accentColor, 0.08),
        isAndroid ? 0.98 : 0.96,
      )
    : withAlpha(
        mixColors(colors.cardBackground ?? dockBackgroundColor, accentColor, 0.025),
        isAndroid ? 0.99 : 0.97,
      );
  const floatingSurfaceBorder = isDark
    ? withAlpha(colors.white ?? colors.primaryText, isAndroid ? 0.14 : 0.12)
    : withAlpha(colors.primaryText, 0.08);
  const floatingShadowStyle = {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };

  return StyleSheet.create({
    container: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: floatingSurfaceBackground,
      borderWidth: 1,
      borderColor: floatingSurfaceBorder,
      ...floatingShadowStyle,
    },
    summary: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    summaryCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    promptTitle: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    metaText: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.medium,
      color: withAlpha(colors.primaryText, 0.68),
    },
    actionButton: {
      minWidth: 124,
      minHeight: 50,
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: actionChrome.backgroundColor,
      borderWidth: 1,
      borderColor: actionChrome.borderColor,
      shadowColor: actionChrome.accentColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.035 : 0.02,
      shadowRadius: 8,
      elevation: 1,
    },
    actionButtonMuted: {
      backgroundColor: isDark
        ? colors.surfaceElevated ?? colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.12)
        : colors.cardBackground ?? colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.04),
      borderColor: colors.borderStrong ?? withAlpha(colors.primaryText, isDark ? 0.18 : 0.1),
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    actionButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    actionLabel: {
      flexShrink: 1,
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: actionChrome.foregroundColor,
      textAlign: 'center',
    },
    actionLabelMuted: {
      color: colors.primaryText,
    },
  });
};
