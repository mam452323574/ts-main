import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Lock } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import { PremiumRenderState } from '@/utils/subscription';
import type { ResolvedResultItemTheme } from '@/utils/resultVisualTheme';
import { Squircle } from '@/components/Squircle';

interface MetricCardProps {
  title: string;
  value: string;
  icon?: React.ReactNode | string;
  isLocked?: boolean;
  premiumRenderState?: PremiumRenderState;
  onPremiumPress?: () => void;
  testID?: string;
  valueVariant?: 'numeric' | 'fraction' | 'text';
  titleMaxLines?: number;
  valueMaxLines?: number;
  theme?: ResolvedResultItemTheme;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  isLocked = false,
  premiumRenderState,
  onPremiumPress,
  testID = 'metric-card-root',
  valueVariant = 'text',
  titleMaxLines = 2,
  valueMaxLines = valueVariant === 'text' ? 3 : 1,
  theme,
}) => {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);
  const premiumLabel = t('metric_card.premium_label');
  const loadingLabel = t('metric_card.loading_label');
  const resolvedPremiumRenderState =
    premiumRenderState ?? (isLocked ? 'locked' : 'unlocked');
  const isLoading = resolvedPremiumRenderState === 'loading';
  const isLockedState = resolvedPremiumRenderState === 'locked';
  const isUnlocked = resolvedPremiumRenderState === 'unlocked';
  const activeTheme = isUnlocked ? theme : undefined;
  const overrideIconColor =
    activeTheme?.iconColor ?? (!isUnlocked ? colors.primaryText : undefined);
  const shouldFitTextValueOnOneLine =
    valueVariant === 'text' && (valueMaxLines <= 2 || value.trim().length <= 18);

  const valueTextProps =
    valueVariant === 'text'
      ? shouldFitTextValueOnOneLine
        ? {
            adjustsFontSizeToFit: true,
            ellipsizeMode: 'tail' as const,
            minimumFontScale: 0.82,
            numberOfLines: 1 as const,
          }
        : {
            ellipsizeMode: 'tail' as const,
            numberOfLines: valueMaxLines,
          }
      : {
          adjustsFontSizeToFit: true,
          ellipsizeMode: 'tail' as const,
          minimumFontScale: valueVariant === 'fraction' ? 0.82 : 0.84,
          numberOfLines: 1 as const,
        };

  const renderIcon = () => {
    if (!icon) {
      return null;
    }

    if (typeof icon === 'string') {
      return (
        <Text
          style={[
            styles.iconText,
            overrideIconColor ? { color: overrideIconColor } : null,
          ]}
        >
          {icon}
        </Text>
      );
    }

    if (React.isValidElement(icon) && typeof icon.type !== 'string') {
      return React.cloneElement(
        icon as React.ReactElement<{
          color?: string;
          size?: number;
          strokeWidth?: number;
        }>,
        {
          color: overrideIconColor,
          size: layout.metricCardIconGlyphSize,
          strokeWidth: layout.metricCardIconStrokeWidth,
        },
      );
    }

    return icon;
  };

  const cardContent = (
    <View
      testID={testID}
      style={[
        styles.container,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'standard',
          accentColor: activeTheme?.accentColor,
          surfaceVariant: activeTheme?.surfaceVariant ?? 'neutral',
        }),
      ]}
    >
      <View style={styles.mainRow}>
        <Squircle
          testID="metric-card-icon-wrap"
          style={[
            styles.iconWrap,
            {
              backgroundColor:
                activeTheme?.iconSurfaceColor ??
                (isDark
                  ? withAlpha(colors.white, 0.06)
                  : withAlpha(colors.primary, 0.08)),
              borderColor: activeTheme?.iconBorderColor ?? 'transparent',
              borderWidth: activeTheme ? 1 : 0,
            },
          ]}
        >
          {renderIcon()}
        </Squircle>

        <View style={styles.content}>
          <Text
            {...RESULT_TEXT_PROPS}
            adjustsFontSizeToFit
            ellipsizeMode="tail"
            minimumFontScale={0.82}
            testID="metric-card-title"
            numberOfLines={titleMaxLines}
            style={[styles.title, { color: colors.secondaryText ?? colors.gray }]}
          >
            {title}
          </Text>

          {isUnlocked ? (
            <Text
              {...RESULT_TEXT_PROPS}
              {...valueTextProps}
              testID="metric-card-value"
              style={[
                styles.value,
                valueVariant === 'text'
                  ? styles.valueText
                  : styles.valueCompact,
                valueVariant === 'text'
                  ? styles.valueTextWeight
                  : styles.valueNumericWeight,
                { color: activeTheme?.valueColor ?? colors.primaryText },
              ]}
            >
              {value}
            </Text>
          ) : (
            <View style={styles.lockedRow}>
              <Squircle
                testID={
                  isLoading
                    ? 'metric-card-loading-overlay'
                    : 'metric-card-blur-overlay'
                }
                accessibilityElementsHidden={isLockedState}
                accessible={false}
                importantForAccessibility={
                  isLockedState ? 'no-hide-descendants' : 'no'
                }
                style={[
                  styles.blurOverlay,
                  {
                    backgroundColor: isDark
                      ? withAlpha(colors.white, 0.08)
                      : colors.grayLight ?? colors.grayMedium,
                  },
                ]}
              >
                <View
                  style={[
                    styles.lockedPlaceholder,
                    {
                      backgroundColor: isDark
                        ? withAlpha(colors.white, 0.22)
                        : withAlpha(colors.primaryText, 0.16),
                    },
                  ]}
                />
              </Squircle>

              {isLockedState ? (
                <Squircle
                  style={[styles.lockBadge, { backgroundColor: colors.gold }]}
                >
                  <Lock color={colors.background} size={12} />
                </Squircle>
              ) : null}
            </View>
          )}
        </View>
      </View>

      {isLockedState ? (
        <View
          testID="metric-card-premium-tag"
          style={[
            styles.statusTag,
            layout.isCompact && styles.statusTagCompactRow,
            {
              backgroundColor: withAlpha(colors.gold, isDark ? 0.14 : 0.18),
              borderColor: withAlpha(colors.gold, isDark ? 0.24 : 0.2),
            },
          ]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={[styles.statusText, { color: colors.gold }]}
          >
            {premiumLabel}
          </Text>
        </View>
      ) : isLoading ? (
        <View
          testID="metric-card-loading-tag"
          style={[
            styles.statusTag,
            layout.isCompact && styles.statusTagCompactRow,
            {
              backgroundColor: isDark
                ? withAlpha(colors.white, 0.08)
                : withAlpha(colors.primaryText, 0.04),
              borderColor: isDark
                ? withAlpha(colors.white, 0.12)
                : withAlpha(colors.primaryText, 0.08),
            },
          ]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={[styles.statusText, { color: colors.gray }]}
          >
            {loadingLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (isLockedState && onPremiumPress) {
    return (
      <TouchableOpacity
        accessibilityLabel={`${title}. ${premiumLabel}`}
        accessibilityRole="button"
        activeOpacity={0.86}
        onPress={onPremiumPress}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return cardContent;
};

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    container: {
      minHeight: layout.metricMinHeight,
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      paddingHorizontal: layout.metricCardPaddingHorizontal,
      paddingVertical: layout.metricCardPaddingVertical,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: layout.metricCardGap, borderCurve: 'continuous',
    },
    mainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.metricCardGap,
      flexBasis: 0,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    iconWrap: {
      width: layout.metricCardIconSize,
      height: layout.metricCardIconSize,
      borderRadius: layout.featureRadius - 6,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xs,
      flexShrink: 0, borderCurve: 'continuous',
    },
    iconText: {
      fontSize: layout.metricCardIconGlyphSize,
      lineHeight: layout.metricCardIconGlyphSize + 1,
      textAlign: 'center',
      includeFontPadding: false,
    },
    content: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      gap: layout.metricCardTextGap,
      justifyContent: 'center',
      alignSelf: 'stretch',
    },
    title: {
      fontSize: layout.metricCardLabelFontSize,
      lineHeight: layout.metricCardLabelLineHeight,
      fontWeight: FONT_WEIGHTS.medium,
      letterSpacing: 0,
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    value: {
      flexShrink: 1,
      minWidth: 0,
      letterSpacing: 0,
      includeFontPadding: false,
    },
    valueCompact: {
      fontSize: layout.metricCardValueFontSize,
      lineHeight: layout.metricCardValueLineHeight,
    },
    valueText: {
      fontSize: layout.metricCardValueFontSize,
      lineHeight: layout.metricCardValueLineHeight,
      alignSelf: 'stretch',
    },
    valueNumericWeight: {
      fontWeight: FONT_WEIGHTS.bold,
    },
    valueTextWeight: {
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    lockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: SPACING.xs,
      minWidth: 0,
    },
    blurOverlay: {
      minWidth: layout.isCompact ? 64 : 72,
      flexShrink: 1,
      paddingHorizontal: SPACING.sm,
      paddingVertical: layout.isCompact ? 2 : 3,
      borderRadius: layout.standardRadius,
      justifyContent: 'center', borderCurve: 'continuous',
    },
    lockedPlaceholder: {
      width: layout.isCompact ? 62 : 72,
      height: layout.isCompact ? 10 : 11,
      borderRadius: 9999, borderCurve: 'continuous',
    },
    lockBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0, borderCurve: 'continuous',
    },
    statusTag: {
      maxWidth: 96,
      borderRadius: 9999,
      paddingHorizontal: SPACING.sm,
      paddingVertical: layout.isCompact ? 2 : 3,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexShrink: 0, borderCurve: 'continuous',
    },
    statusTagCompactRow: {
      flexBasis: '100%',
    },
    statusText: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 13 : 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: layout.isCompact ? 0.35 : 0.45,
      textAlign: 'center',
      includeFontPadding: false,
    },
  });

export default MetricCard;
