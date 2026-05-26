import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';

import { DARK_COLORS, LIGHT_COLORS, withAlpha } from '@/constants/theme';
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(size, colors), [size, colors]);

  if (theme === 'dark') {
    return (
      <View
        style={[styles.badge, styles.badgeDark]}
      >
        <Moon color={DARK_COLORS.primaryText} size={size * 0.46} />
      </View>
    );
  }

  return (
    <View
      style={[styles.badge, styles.badgeLight]}
    >
      <Sun color={LIGHT_COLORS.primary} size={size * 0.46} />
    </View>
  );
}

const createStyles = (
  size: number,
  colors: any,
) =>
  StyleSheet.create({
    badge: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1, borderCurve: 'continuous',
    },
    badgeDark: {
      backgroundColor: DARK_COLORS.surfaceElevated,
      borderColor: DARK_COLORS.borderSubtle,
    },
    badgeLight: {
      backgroundColor: LIGHT_COLORS.cardBackground,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
  });
