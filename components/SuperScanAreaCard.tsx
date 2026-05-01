import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import type { FatDistributionAreaViewModel } from '@/utils/resultViewModels';
import type { ResolvedSuperScanAreaTheme } from '@/utils/superScanVisualTheme';

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
  testID?: string;
  theme?: ResolvedSuperScanAreaTheme;
}

export function SuperScanAreaCard({
  area,
  labels,
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
            numberOfLines={1}
            style={styles.badgeLabel}
          >
            {labels.dominantType}
          </Text>
          <Text
            {...RESULT_TEXT_PROPS}
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
              numberOfLines={2}
              style={styles.metricLabel}
            >
              {metric.label}
            </Text>
            <Text
              {...RESULT_TEXT_PROPS}
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
      borderWidth: 1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
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
      includeFontPadding: false,
    },
    dominantBadge: {
      minWidth: layout.isCompact ? 112 : 132,
      maxWidth: layout.isCompact ? 140 : 164,
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
      gap: 2,
    },
    badgeLabel: {
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: colors.gray,
      textTransform: 'uppercase',
      letterSpacing: 0.55,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    badgeValue: {
      fontSize: SIZES.sm,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    metricTile: {
      flexGrow: 1,
      flexBasis: layout.isCompact ? '47%' : '48%',
      minWidth: layout.isCompact ? 120 : 140,
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
      gap: 4,
    },
    metricLabel: {
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: colors.gray,
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
    metricValue: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.bold,
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
      gap: SPACING.xs,
    },
    sectionLabel: {
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: colors.gray,
      textTransform: 'uppercase',
      letterSpacing: 0.55,
      fontWeight: FONT_WEIGHTS.semiBold,
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
