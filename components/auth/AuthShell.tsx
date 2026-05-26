import { ReactNode, useMemo } from 'react';
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import { LanguageSelector } from '@/components/LanguageSelector';
import {
  BORDER_RADIUS,
  SPACING,
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
  scroll = false,
  contentStyle,
  testID,
  backTestID,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(
    () => createStyles(colors, insets),
    [colors, insets],
  );

  return (
    <AppScreen
      scroll={scroll}
      scrollBounces={false}
      keyboard={scroll}
      topInset={false}
      bottomInset={false}
    >
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
) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    backButton: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      left: SPACING.lg,
      zIndex: 10,
      padding: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderCurve: 'continuous',
    },
    languageContainer: {
      position: 'absolute',
      top: insets.top + SPACING.sm,
      right: SPACING.lg,
      zIndex: 10,
      borderRadius: BORDER_RADIUS.full,
      overflow: 'hidden', borderCurve: 'continuous',
    },
    content: {
      flex: 1,
      width: '100%',
      paddingHorizontal: SPACING.lg,
      paddingTop: insets.top + SPACING.xxxl + SPACING.sm,
      paddingBottom:
        getMinimumBottomInsetPadding(insets.bottom, SPACING.sm) + SPACING.lg,
      gap: SPACING.lg,
    },
  });
