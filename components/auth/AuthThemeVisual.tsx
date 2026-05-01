import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';

import { withAlpha } from '@/constants/theme';

interface AuthThemeVisualProps {
  theme: 'dark' | 'light';
  size?: number;
}

/**
 * Petit badge visuel pour les cartes de sélection de thème (dark/light).
 * Factorise le pattern utilisé dans SignUpScreen et UsernameSetupScreen.
 */
export function AuthThemeVisual({ theme, size = 56 }: AuthThemeVisualProps) {
  const styles = useMemo(() => createStyles(size), [size]);

  if (theme === 'dark') {
    return (
      <View style={[styles.badge, styles.badgeDark]}>
        <Moon color="#FFFFFF" size={size * 0.46} />
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.badgeLight]}>
      <Sun color="#1D1D1F" size={size * 0.46} />
    </View>
  );
}

const createStyles = (size: number) =>
  StyleSheet.create({
    badge: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeDark: {
      backgroundColor: '#0B0B0E',
    },
    badgeLight: {
      backgroundColor: '#F4F5F7',
      borderWidth: 1,
      borderColor: withAlpha('#000000', 0.06),
    },
  });
