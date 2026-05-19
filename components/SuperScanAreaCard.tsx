import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PremiumTeaserCard } from '@/components/results/PremiumTeaserCard';
import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import type { FatDistributionAreaViewModel } from '@/utils/resultViewModels';
import type { ResolvedSuperScanAreaTheme } from '@/utils/superScanVisualTheme';
import type { PremiumRenderState } from '@/utils/subscription';

interface SuperScanAreaCardLabels {
  dominantType: string;
  subcutaneousFat: string;
  waterRetention: string;
  definition: string;
  confidence: string;
  explanation: string;
  advice: string;
}

interface SuperScanAreaCardProps {
  area: FatDistributionAreaViewModel;
  labels: SuperScanAreaCardLabels;
  lockedTitle?: string;
  onPremiumPress?: () => void;
  premiumRenderState?: PremiumRenderState;
  testID?: string;
  theme?: ResolvedSuperScanAreaTheme;
}

export function SuperScanAreaCard({
  area,
  labels,
  lockedTitle,
  onPremiumPress,
  premiumRenderState = 'unlocked',
  testID = 'super-scan-area-card',
  theme,
}: SuperScanAreaCardProps) {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(
    () => createStyles(colors, isDark, layout),
    [colors, isDark, layout],
  );

  if (premiumRenderState !== 'unlocked') {
    return (
      <PremiumTeaserCard
        accentColor={theme?.accentColor ?? colors.primary}
        lineCount={4}
        onPress={premiumRenderState === 'locked' ? onPremiumPress : undefined}
        premiumRenderState={premiumRenderState}
        testID={testID}
        title={lockedTitle ?? labels.explanation}
      />
    );
  }

  return (
    <View
      style={[
        styles.card,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'feature',
          accentColor: theme?.accentColor ?? colors.primary,
        }),
        theme
          ? {
              backgroundColor: theme.cardBackgroundColor,
              borderColor: theme.cardBorderColor,
            }
          : null,
      ]}
      testID={testID}
    >
      <View style={styles.headerRow}>
        <Text
          {...RESULT_TEXT_PROPS}
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          minimumFontScale={0.86}
          numberOfLines={2}
          style={styles.areaName}
          testID={`${testID}-name`}
        >
          {area.areaName}
        </Text>

        <View
          style={[
            styles.dominantBadge,
            theme
              ? {
                  backgroundColor: theme.dominantBadgeBackgroundColor,
                  borderColor: theme.dominantBadgeBorderColor,
              }
              : null,
          ]}
          testID={`${testID}-dominant-badge`}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            adjustsFontSizeToFit
            ellipsizeMode="tail"
            minimumFontScale={0.82}
            numberOfLines={1}
            style={styles.badgeLabel}
          >
            {labels.dominantType}
          </Text>
          <Text
            {...RESULT_TEXT_PROPS}
            adjustsFontSizeToFit
            ellipsizeMode="tail"
            minimumFontScale={0.82}
            numberOfLines={2}
            style={[
              styles.badgeValue,
              theme
                ? {
                    color: theme.dominantBadgeValueColor,
                  }
                : null,
            ]}
            testID={`${testID}-dominant-type`}
          >
            {area.dominantType}
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        {[
          {
            label: labels.subcutaneousFat,
            value: area.subcutaneousFatPercent,
            testID: `${testID}-subcutaneous-fat`,
            tileTheme: theme?.metricThemes.subcutaneousFat,
          },
          {
            label: labels.waterRetention,
            value: area.waterRetentionPercent,
            testID: `${testID}-water-retention`,
            tileTheme: theme?.metricThemes.waterRetention,
          },
          {
            label: labels.definition,
            value: area.definitionPercent,
            testID: `${testID}-definition`,
            tileTheme: theme?.metricThemes.definition,
          },
          {
            label: labels.confidence,
            value: area.confidencePercent,
            testID: `${testID}-confidence`,
            tileTheme: theme?.metricThemes.confidence,
          },
        ].map((metric) => (
          <View
            key={metric.testID}
            style={[
              styles.metricTile,
              metric.tileTheme
                ? {
                    backgroundColor: metric.tileTheme.backgroundColor,
                    borderColor: metric.tileTheme.borderColor,
                  }
                : null,
            ]}
            testID={`${metric.testID}-tile`}
          >
            <Text
              {...RESULT_TEXT_PROPS}
              adjustsFontSizeToFit
              ellipsizeMode="tail"
              minimumFontScale={0.82}
              numberOfLines={1}
              style={styles.metricLabel}
            >
              {metric.label}
            </Text>
            <Text
              {...RESULT_TEXT_PROPS}
              adjustsFontSizeToFit
              ellipsizeMode="tail"
              minimumFontScale={0.82}
              numberOfLines={1}
              style={[
                styles.metricValue,
                metric.tileTheme
                  ? {
                      color: metric.tileTheme.valueColor,
                    }
                  : null,
              ]}
              testID={metric.testID}
            >
              {metric.value}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.sectionCard,
          theme
            ? {
                backgroundColor: theme.sectionBackgroundColor,
                borderColor: theme.sectionBorderColor,
              }
            : null,
        ]}
      >
        <Text
          {...RESULT_TEXT_PROPS}
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          minimumFontScale={0.82}
          numberOfLines={1}
          style={[
            styles.sectionLabel,
            theme
              ? {
                  color: theme.sectionLabelColor,
                }
              : null,
          ]}
        >
          {labels.explanation}
        </Text>
        <Text
          {...RESULT_TEXT_PROPS}
          style={styles.sectionBody}
          testID={`${testID}-explanation`}
        >
          {area.explanation}
        </Text>
      </View>

      <View
        style={[
          styles.sectionCard,
          theme
            ? {
                backgroundColor: theme.sectionBackgroundColor,
                borderColor: theme.sectionBorderColor,
              }
            : null,
        ]}
      >
        <Text
          {...RESULT_TEXT_PROPS}
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          minimumFontScale={0.82}
          numberOfLines={1}
          style={[
            styles.sectionLabel,
            theme
              ? {
                  color: theme.sectionLabelColor,
                }
              : null,
          ]}
        >
          {labels.advice}
        </Text>
        <Text
          {...RESULT_TEXT_PROPS}
          style={styles.sectionBody}
          testID={`${testID}-advice`}
        >
          {area.actionableAdvice}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  layout: ReturnType<typeof getResultLayoutState>,
) =>
  StyleSheet.create({
    card: {
      borderRadius: layout.featureRadius,
      padding: layout.blockPadding,
      gap: layout.sectionGap,
      borderWidth: 1, borderCurve: 'continuous',
    },
    headerRow: {
      flexDirection: layout.useSingleColumnResultCards ? 'column' : 'row',
      alignItems: layout.useSingleColumnResultCards ? 'stretch' : 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    areaName: {
      flex: 1,
      minWidth: 0,
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      flexShrink: 1,
      includeFontPadding: false,
    },
    dominantBadge: {
      minWidth: layout.isCompact ? 112 : 132,
      maxWidth: layout.useSingleColumnResultCards
        ? undefined
        : layout.isCompact
          ? 140
          : 164,
      width: layout.useSingleColumnResultCards ? '100%' : undefined,
      borderRadius: layout.standardRadius,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm,
      backgroundColor: isDark
        ? withAlpha(colors.primary, 0.16)
        : withAlpha(colors.primary, 0.08),
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(colors.primary, 0.32)
        : withAlpha(colors.primary, 0.18),
      gap: 2, borderCurve: 'continuous',
    },
    badgeLabel: {
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: colors.gray,
      textTransform: 'uppercase',
      letterSpacing: 0.55,
      fontWeight: FONT_WEIGHTS.semiBold,
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    badgeValue: {
      fontSize: SIZES.sm,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    metricTile: {
      flexGrow: 1,
      flexBasis: layout.useSingleColumnResultCards ? '100%' : '48%',
      minWidth: layout.useSingleColumnResultCards
        ? 0
        : layout.isCompact
          ? 120
          : 140,
      borderRadius: layout.standardRadius,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm,
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.05)
        : withAlpha(colors.background, 0.88),
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(colors.white, 0.06)
        : withAlpha(colors.primaryText, 0.06),
      gap: 4, borderCurve: 'continuous',
    },
    metricLabel: {
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: colors.gray,
      fontWeight: FONT_WEIGHTS.medium,
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    metricValue: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.bold,
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    sectionCard: {
      borderRadius: layout.standardRadius,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.05)
        : withAlpha(colors.background, 0.86),
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(colors.white, 0.06)
        : withAlpha(colors.primaryText, 0.06),
      gap: SPACING.xs, borderCurve: 'continuous',
    },
    sectionLabel: {
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: colors.gray,
      textTransform: 'uppercase',
      letterSpacing: 0.55,
      fontWeight: FONT_WEIGHTS.semiBold,
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    sectionBody: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      color: colors.primaryText,
      includeFontPadding: false,
    },
  });

export default SuperScanAreaCard;
