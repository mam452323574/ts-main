import { ReactNode, useMemo } from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppScreen } from '@/components/AppScreen';
import { LanguageSelector } from '@/components/LanguageSelector';
import { buildOnboardingPalette, useAuthPalette } from '@/components/auth/tokens';
import {
  BORDER_RADIUS,
  SHADOWS,
  SPACING,
  getVisualMoodGradient,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getMinimumBottomInsetPadding } from '@/utils/mobileLayout';

interface AuthShellProps {
  children: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  showLanguage?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  backTestID?: string;
}

export function AuthShell({
  children,
  showBack = false,
  onBack,
  showLanguage = true,
  scroll = true,
  contentStyle,
  testID,
  backTestID,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const palette = useAuthPalette();
  const onboardingPalette = useMemo(
    () => buildOnboardingPalette(colors, isDark),
    [colors, isDark],
  );
  const isCompactAndroidLayout =
    Platform.OS === 'android' && windowHeight < 780;
  const backgroundGradient = useMemo(
    () =>
      getVisualMoodGradient(
        colors,
        isDark,
        'softClinical',
        onboardingPalette.accent,
      ),
    [colors, isDark, onboardingPalette.accent],
  );
  const styles = useMemo(
    () =>
      createStyles(
        colors,
        palette,
        onboardingPalette,
        insets,
        isCompactAndroidLayout,
        isDark,
      ),
    [colors, palette, onboardingPalette, insets, isCompactAndroidLayout, isDark]
  );

  return (
    <AppScreen scroll={scroll} keyboard topInset={false} bottomInset={false}>
      <View style={styles.root} testID={testID ?? 'auth-shell-root'}>
        <LinearGradient
          colors={backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backgroundGradient}
        />
        <LinearGradient
          colors={[
            onboardingPalette.heroScrimSoft,
            withAlpha(onboardingPalette.background, 0),
          ]}
          start={{ x: 0.85, y: 0 }}
          end={{ x: 0.15, y: 1 }}
          style={styles.topWash}
        />
        <LinearGradient
          colors={[
            withAlpha(onboardingPalette.background, 0),
            onboardingPalette.heroScrimSoft,
          ]}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.bottomWash}
        />
        <View style={styles.primaryGlow} />
        <View style={styles.secondaryGlow} />
        {showBack ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onBack}
            style={styles.backButton}
            testID={backTestID}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ArrowLeft color={colors.primaryText} size={22} />
          </TouchableOpacity>
        ) : null}
        {showLanguage ? (
          <View style={styles.languageContainer}>
            <LanguageSelector />
          </View>
        ) : null}
        <View style={[styles.content, contentStyle]} testID="auth-shell-content">
          {children}
        </View>
      </View>
    </AppScreen>
  );
}

const createStyles = (
  colors: any,
  palette: ReturnType<typeof useAuthPalette>,
  onboardingPalette: ReturnType<typeof buildOnboardingPalette>,
  insets: any,
  isCompactAndroidLayout: boolean,
  isDark: boolean,
) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.background,
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    topWash: {
      position: 'absolute',
      top: -34,
      left: -24,
      right: -24,
      height: 210,
      borderBottomLeftRadius: 68,
      borderBottomRightRadius: 68,
      opacity: 0.95,
    },
    bottomWash: {
      position: 'absolute',
      bottom: -42,
      left: -24,
      right: -24,
      height: 220,
      borderTopLeftRadius: 72,
      borderTopRightRadius: 72,
      opacity: 0.9,
    },
    primaryGlow: {
      position: 'absolute',
      top: -84,
      right: -36,
      width: 240,
      height: 240,
      borderRadius: 999,
      backgroundColor: palette.heroGlowPrimary,
    },
    secondaryGlow: {
      position: 'absolute',
      bottom: -100,
      left: -52,
      width: 280,
      height: 280,
      borderRadius: 999,
      backgroundColor: palette.heroGlowSecondary,
    },
    backButton: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.lg,
      zIndex: 10,
      padding: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(palette.surfaceStrong, isDark ? 0.82 : 0.92),
      borderWidth: 1,
      borderColor: palette.heroBorder,
    },
    languageContainer: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      right: SPACING.lg,
      zIndex: 10,
      borderRadius: BORDER_RADIUS.full,
      overflow: 'hidden',
    },
    content: {
      flexGrow: 1,
      width: '100%',
      maxWidth: 580,
      alignSelf: 'center',
      paddingHorizontal: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
      paddingTop:
        insets.top +
        (isCompactAndroidLayout
          ? SPACING.xxl + SPACING.md
          : SPACING.xxxl + SPACING.lg),
      paddingBottom:
        getMinimumBottomInsetPadding(insets.bottom, SPACING.sm) +
        (isCompactAndroidLayout ? SPACING.lg : SPACING.xl),
      gap: isCompactAndroidLayout ? SPACING.lg : SPACING.xl,
      justifyContent: isCompactAndroidLayout ? 'flex-start' : 'center',
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: onboardingPalette.surfaceGlass,
      borderWidth: 1,
      borderColor: onboardingPalette.borderStrong,
      ...SHADOWS.soft,
      shadowColor: onboardingPalette.shadowColor,
      shadowOpacity: isDark ? 0.18 : 0.1,
      shadowRadius: isDark ? 28 : 18,
      shadowOffset: { width: 0, height: isDark ? 16 : 10 },
      elevation: 4,
      overflow: 'hidden',
    },
  });
