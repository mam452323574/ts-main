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

import { AppScreen } from '@/components/AppScreen';
import { LanguageSelector } from '@/components/LanguageSelector';
import { SPACING } from '@/constants/theme';
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
  const { colors } = useTheme();
  const isCompactAndroidLayout =
    Platform.OS === 'android' && windowHeight < 780;
  const styles = useMemo(
    () => createStyles(colors, insets, isCompactAndroidLayout),
    [colors, insets, isCompactAndroidLayout]
  );

  return (
    <AppScreen scroll={scroll} keyboard topInset={false} bottomInset={false}>
      <View style={styles.root} testID={testID ?? 'auth-shell-root'}>
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
  insets: any,
  isCompactAndroidLayout: boolean
) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    backButton: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.lg,
      zIndex: 10,
      padding: SPACING.sm,
    },
    languageContainer: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      right: SPACING.lg,
      zIndex: 10,
    },
    content: {
      flexGrow: 1,
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
    },
  });
