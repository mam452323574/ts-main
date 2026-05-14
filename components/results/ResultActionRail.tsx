import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  FONT_WEIGHTS,
  SPACING,
  getCtaColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
} from '@/utils/resultLayout';
import { LinearGradient } from 'expo-linear-gradient';

interface ResultActionRailProps {
  primaryLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  secondaryDisabled?: boolean;
  accentColor?: string;
  primaryTestID?: string;
  secondaryTestID?: string;
}

export function ResultActionRail({
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
  secondaryDisabled = false,
  accentColor,
  primaryTestID = 'scan-result-back-button',
  secondaryTestID = 'scan-result-share-button',
}: ResultActionRailProps) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);
  const ctaColors = getCtaColors(colors, isDark);
  const resolvedAccent = accentColor ?? colors.primary;
  const primaryGradient = isDark
    ? ([
        mixColors(colors.primaryText, colors.secondary ?? colors.primaryText, 0.08),
        ctaColors.primaryBackground,
      ] as const)
    : ([
        mixColors(colors.primaryText, colors.white, 0.08),
        ctaColors.primaryBackground,
      ] as const);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        testID={primaryTestID}
        activeOpacity={0.86}
        onPress={onPrimaryPress}
        style={styles.primaryButtonShell}
      >
        <LinearGradient
          colors={primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.primaryButton,
            {
              borderColor: ctaColors.primaryBorder,
              shadowColor: mixColors(
                resolvedAccent,
                colors.background,
                isDark ? 0.82 : 0.74,
              ),
            },
          ]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            adjustsFontSizeToFit
            minimumFontScale={0.84}
            numberOfLines={2}
            style={[styles.primaryText, { color: ctaColors.primaryForeground }]}
          >
            {primaryLabel}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {secondaryLabel && onSecondaryPress ? (
        <TouchableOpacity
          testID={secondaryTestID}
          activeOpacity={0.82}
          disabled={secondaryDisabled}
          onPress={onSecondaryPress}
          style={[
            styles.secondaryButton,
            {
              backgroundColor: isDark
                ? withAlpha(resolvedAccent, 0.14)
                : withAlpha(resolvedAccent, 0.06),
              borderColor: resolvedAccent,
              opacity: secondaryDisabled ? 0.72 : 1,
            },
          ]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            adjustsFontSizeToFit
            minimumFontScale={0.84}
            numberOfLines={2}
            style={[
              styles.secondaryText,
              {
                color: isDark
                  ? mixColors(resolvedAccent, colors.primaryText, 0.24)
                  : mixColors(resolvedAccent, colors.primaryText, 0.18),
              },
            ]}
          >
            {secondaryLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    container: {
      gap: SPACING.sm + 2,
    },
    primaryButtonShell: {
      borderRadius: layout.ctaRadius,
      overflow: 'hidden',
    },
    primaryButton: {
      minHeight: layout.ctaMinHeight,
      borderRadius: layout.ctaRadius,
      borderWidth: 1,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#0B1220',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 4,
    },
    secondaryButton: {
      minHeight: layout.ctaMinHeight,
      borderRadius: layout.ctaRadius,
      borderWidth: 1,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      textAlign: 'center',
      flexShrink: 1,
      includeFontPadding: false,
    },
    secondaryText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      textAlign: 'center',
      flexShrink: 1,
      includeFontPadding: false,
    },
  });

export default ResultActionRail;
