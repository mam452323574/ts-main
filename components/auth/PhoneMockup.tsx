import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { SHADOWS, SIZES, SPACING } from '@/constants/theme';
import { useOnboardingPalette, type OnboardingPalette } from './tokens';
import { Squircle } from '@/components/Squircle';

interface PhoneMockupProps {
  children: ReactNode;
  /** Hauteur cible du mockup. Sur petits écrans, la maxHeight via le parent peut le rétrécir. */
  height?: number;
  /** Ratio largeur / hauteur du mockup. Par défaut ~0.55 (proportion smartphone moderne). */
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  showStatusBar?: boolean;
  statusBarLabel?: string;
}

/**
 * Cadre smartphone premium pour les onboarding slides.
 * Le `children` représente le contenu d'écran intérieur.
 * Pour insérer un vrai screenshot plus tard :
 *   <PhoneMockup>
 *     <Image source={require('@/assets/onboarding/scanner.png')} style={{flex:1}} resizeMode="cover" />
 *   </PhoneMockup>
 *
 * Le composant utilise `aspectRatio` + `maxHeight: '100%'` pour s'adapter naturellement
 * à l'espace dispo (le parent doit lui donner une hauteur via flex).
 */
export function PhoneMockup({
  children,
  height = 360,
  aspectRatio = 0.55,
  style,
  showStatusBar = true,
  statusBarLabel = '9:41',
}: PhoneMockupProps) {
  const palette = useOnboardingPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View
      style={[
        styles.outer,
        { height, aspectRatio, maxHeight: '100%' },
        style,
      ]}
    >
      <Squircle style={styles.bezel}>
        <View style={styles.notch} />
        <View style={styles.screen}>
          {showStatusBar ? (
            <View style={styles.statusBar}>
              <Text style={styles.statusBarText}>{statusBarLabel}</Text>
              <View style={styles.statusBarRight}>
                <View style={styles.statusBarSignal} />
                <View style={[styles.statusBarSignal, { opacity: 0.6 }]} />
                <View style={styles.statusBarBattery} />
              </View>
            </View>
          ) : null}
          <View style={styles.screenContent}>{children}</View>
        </View>
      </Squircle>
    </View>
  );
}

const createStyles = (palette: OnboardingPalette) =>
  StyleSheet.create({
    outer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    bezel: {
      flex: 1,
      width: '100%',
      borderRadius: 40,
      backgroundColor: '#050910',
      padding: 5,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      ...SHADOWS.soft,
      shadowColor: palette.accent,
      shadowOpacity: 0.22,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 }, borderCurve: 'continuous',
    },
    notch: {
      position: 'absolute',
      top: 9,
      left: '50%',
      width: 56,
      height: 5,
      marginLeft: -28,
      borderRadius: 999,
      backgroundColor: '#02050A',
      zIndex: 2, borderCurve: 'continuous',
    },
    screen: {
      flex: 1,
      borderRadius: 34,
      overflow: 'hidden',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border, borderCurve: 'continuous',
    },
    screenContent: {
      flex: 1,
    },
    statusBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
      height: 28,
    },
    statusBarText: {
      fontSize: SIZES.text10,
      fontWeight: '700',
      color: palette.textSecondary,
      letterSpacing: 0.2,
    },
    statusBarRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    statusBarSignal: {
      width: 3,
      height: 6,
      borderRadius: 1,
      backgroundColor: palette.textSecondary, borderCurve: 'continuous',
    },
    statusBarBattery: {
      width: 14,
      height: 7,
      borderRadius: 2,
      backgroundColor: palette.textSecondary,
      marginLeft: 4, borderCurve: 'continuous',
    },
  });
