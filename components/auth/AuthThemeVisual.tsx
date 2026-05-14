import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { withAlpha } from '@/constants/theme';
import { useAuthPalette } from './tokens';
import { useTheme } from '@/contexts/ThemeContext';

interface AuthThemeVisualProps {
  theme: 'dark' | 'light';
  size?: number;
}

/**
 * Petit badge visuel pour les cartes de sélection de thème (dark/light).
 * Factorise le pattern utilisé dans SignUpScreen et UsernameSetupScreen.
 */
export function AuthThemeVisual({ theme, size = 56 }: AuthThemeVisualProps) {
  const palette = useAuthPalette();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(size, palette, colors), [size, palette, colors]);

  if (theme === 'dark') {
    return (
      <LinearGradient
        colors={[palette.surfaceStrong, palette.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, styles.badgeDark]}
      >
        <Moon color={palette.inverseText} size={size * 0.46} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[withAlpha(colors.white, 0.98), palette.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.badge, styles.badgeLight]}
    >
      <Sun color={colors.primaryText} size={size * 0.46} />
    </LinearGradient>
  );
}

const createStyles = (
  size: number,
  palette: ReturnType<typeof useAuthPalette>,
  colors: any,
) =>
  StyleSheet.create({
    badge: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    badgeDark: {
      borderColor: palette.heroBorder,
    },
    badgeLight: {
      borderColor: withAlpha(colors.primaryText, 0.08),
    },
  });
