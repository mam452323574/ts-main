import { ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BORDER_RADIUS, FONT_FAMILIES, SIZES, SPACING } from '@/constants/theme';
import { useOnboardingPalette, type OnboardingPalette } from './tokens';

interface OnboardingSlideProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  bullets?: string[];
  visual: ReactNode;
}

export function OnboardingSlide({
  eyebrow,
  title,
  subtitle,
  bullets,
  visual,
}: OnboardingSlideProps) {
  const palette = useOnboardingPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.container}>
      <View style={styles.visualWrap}>
        <LinearGradient
          colors={palette.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.visualStage}
        >
          <View style={styles.visualWashTop} />
          <View style={styles.visualWashBottom} />
          {visual}
        </LinearGradient>
      </View>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {bullets && bullets.length > 0 ? (
          <View style={styles.bullets}>
            {bullets.map((bullet) => (
              <View key={bullet} style={styles.bullet}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (palette: OnboardingPalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: SPACING.md,
      gap: SPACING.lg,
    },
    visualWrap: {
      flex: 1,
      minHeight: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    visualStage: {
      flex: 1,
      width: '100%',
      maxWidth: 430,
      minHeight: 260,
      borderRadius: BORDER_RADIUS.hero,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    visualWashTop: {
      position: 'absolute',
      top: -24,
      right: -56,
      width: 220,
      height: 84,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: palette.glow,
      transform: [{ rotate: '-18deg' }],
    },
    visualWashBottom: {
      position: 'absolute',
      bottom: -34,
      left: -54,
      width: 210,
      height: 92,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: palette.glowSecondary,
      transform: [{ rotate: '16deg' }],
    },
    copy: {
      gap: SPACING.sm,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      fontWeight: '700',
      letterSpacing: 2,
      color: palette.accentStrong,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 28,
      lineHeight: 34,
      fontFamily: FONT_FAMILIES.display,
      color: palette.textPrimary,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: SIZES.md,
      lineHeight: 22,
      color: palette.textSecondary,
      maxWidth: 460,
    },
    bullets: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    bullet: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: palette.secondaryActionFill,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder,
    },
    bulletDot: {
      width: 5,
      height: 5,
      borderRadius: 999,
      backgroundColor: palette.accent,
    },
    bulletText: {
      fontSize: SIZES.text12,
      fontWeight: '600',
      color: palette.textPrimary,
      letterSpacing: 0.1,
    },
  });
