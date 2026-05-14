import { ReactNode, useMemo } from 'react';
import {
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  BORDER_RADIUS,
  SPACING,
  getVisualMoodGradient,
  getVisualMoodSurface,
  withAlpha,
  type VisualMood,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboardingPalette } from './tokens';

interface OnboardingHeroStageProps {
  children: ReactNode;
  accentColor?: string;
  mood?: VisualMood;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function OnboardingHeroStage({
  children,
  accentColor,
  mood = 'softClinical',
  style,
  contentStyle,
  testID,
}: OnboardingHeroStageProps) {
  const { colors, isDark } = useTheme();
  const palette = useOnboardingPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const heroGradient = useMemo(
    () => getVisualMoodGradient(colors, isDark, mood, accentColor),
    [accentColor, colors, isDark, mood],
  );
  const heroSurface = useMemo(
    () =>
      getVisualMoodSurface(colors, isDark, {
        mood,
        accentColor,
        intensity: 'hero',
      }),
    [accentColor, colors, isDark, mood],
  );

  return (
    <View style={[styles.shell, heroSurface, style]} testID={testID}>
      <LinearGradient
        colors={heroGradient}
        start={{ x: 0.02, y: 0 }}
        end={{ x: 0.98, y: 1 }}
        style={styles.gradient}
      />
      <View
        style={[
          styles.primaryGlow,
          {
            backgroundColor: accentColor
              ? withAlpha(accentColor, isDark ? 0.18 : 0.12)
              : palette.glow,
          },
        ]}
      />
      <View
        style={[
          styles.secondaryGlow,
          {
            backgroundColor: accentColor
              ? withAlpha(accentColor, isDark ? 0.12 : 0.08)
              : palette.glowSecondary,
          },
        ]}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const createStyles = (palette: ReturnType<typeof useOnboardingPalette>) =>
  StyleSheet.create({
    shell: {
      minHeight: 220,
      overflow: 'hidden',
      borderRadius: BORDER_RADIUS.hero,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    gradient: {
      ...StyleSheet.absoluteFillObject,
    },
    primaryGlow: {
      position: 'absolute',
      top: -44,
      right: -16,
      width: 240,
      height: 176,
      borderRadius: 999,
      transform: [{ rotate: '-12deg' }],
    },
    secondaryGlow: {
      position: 'absolute',
      bottom: -54,
      left: -18,
      width: 220,
      height: 168,
      borderRadius: 999,
      transform: [{ rotate: '14deg' }],
    },
    content: {
      flex: 1,
      padding: SPACING.lg,
    },
  });
