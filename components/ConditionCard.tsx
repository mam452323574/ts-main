import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';

import { ResultIcon } from '@/components/ResultIcon';
import { DetectedCondition } from '@/types';
import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  localizeQualitativeLevel,
  localizeSuperScanAdviceKey,
  localizeSuperScanCategoryKey,
  localizeSuperScanConditionLabel,
  localizeSuperScanExplanationKey,
} from '@/utils/resultLocalization';
import { formatConditionProbability } from '@/utils/resultViewModels';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import { resolveSuperCategoryIconToken } from '@/utils/resultIconCatalog';
import { PremiumRenderState } from '@/utils/subscription';
import { Squircle } from '@/components/Squircle';

interface ConditionCardProps {
  condition: DetectedCondition;
  isPremium?: boolean;
  premiumRenderState?: PremiumRenderState;
}

type SeverityTone = {
  accent: string;
  border: string;
  scoreSurface: string;
};

const getSeverityTone = (
  severity: DetectedCondition['severity_key'],
  isDark: boolean,
): SeverityTone => {
  if (severity === 'high') {
    return {
      accent: '#FF5A52',
      border: withAlpha('#FF5A52', isDark ? 0.24 : 0.14),
      scoreSurface: withAlpha('#FF5A52', isDark ? 0.12 : 0.07),
    };
  }

  if (severity === 'moderate') {
    return {
      accent: '#FF9F2E',
      border: withAlpha('#FF9F2E', isDark ? 0.22 : 0.13),
      scoreSurface: withAlpha('#FF9F2E', isDark ? 0.11 : 0.065),
    };
  }

  return {
    accent: '#34C97A',
    border: withAlpha('#34C97A', isDark ? 0.2 : 0.12),
    scoreSurface: withAlpha('#34C97A', isDark ? 0.1 : 0.06),
  };
};

function readConditionText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

// This card is intentionally reserved for legacy super_health_v2 condition results.
export function ConditionCard({
  condition,
  isPremium = false,
  premiumRenderState,
}: ConditionCardProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors: themeColors, isDark } = useTheme();
  const { t, locale } = useLanguage();

  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const tone = getSeverityTone(condition.severity_key, isDark);
  const styles = useMemo(
    () => createStyles(themeColors, isDark, layout),
    [themeColors, isDark, layout],
  );
  const resolvedPremiumRenderState =
    premiumRenderState ?? (isPremium ? 'unlocked' : 'locked');
  const isUnlocked = resolvedPremiumRenderState === 'unlocked';
  const isLocked = resolvedPremiumRenderState === 'locked';
  const isLoading = resolvedPremiumRenderState === 'loading';

  const nameFallbackText = readConditionText(condition.condition_fallback_text);
  const categoryFallbackText = readConditionText(condition.category_fallback_text);
  const explanationFallbackText = readConditionText(condition.explanation_fallback_text);
  const adviceFallbackText = readConditionText(condition.advice_fallback_text);
  const name = nameFallbackText ?? localizeSuperScanConditionLabel(condition.condition_key, t, '-');
  const category = categoryFallbackText ?? localizeSuperScanCategoryKey(condition.category_key, t, '-');
  const categoryIconToken = resolveSuperCategoryIconToken(condition.category_key);
  const severityLabel = localizeQualitativeLevel('severity', condition.severity_key, t, '-');
  const explanation = isUnlocked
    ? explanationFallbackText ??
      localizeSuperScanExplanationKey(condition.explanation_key, t, '-')
    : isLoading
      ? t('condition_card.loading.explanation')
      : t('condition_card.locked.explanation_teaser');
  const advice = isUnlocked
    ? adviceFallbackText ?? localizeSuperScanAdviceKey(condition.advice_key, t, '-')
    : isLoading
      ? t('condition_card.loading.advice')
      : t('condition_card.locked.advice_teaser');
  const probabilityValue = isUnlocked
    ? formatConditionProbability(condition.probability, locale)
    : isLoading
      ? t('metric_card.loading_value')
      : t('metric_card.blurred_text');

  const handleUnlock = () => {
    router.push('/premium-upgrade');
  };

  const renderSectionBody = (
    section: 'explanation' | 'advice',
    value: string,
  ) => {
    if (!isLocked) {
      return (
        <Text
          {...RESULT_TEXT_PROPS}
          style={[
            styles.sectionText,
            isLoading ? styles.loadingSectionText : null,
          ]}
          testID={`condition-card-${section}-text`}
        >
          {value}
        </Text>
      );
    }

    return (
      <TouchableOpacity
        accessibilityLabel={t('condition_card.unlock')}
        accessibilityRole="button"
        activeOpacity={0.9}
        onPress={handleUnlock}
        style={styles.lockedBlock}
        testID={`condition-card-unlock-${section}`}
      >
        <View style={styles.lockedHeader}>
          <View style={styles.lockBadge}>
            <Lock color="#FFFFFF" size={14} />
          </View>
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={styles.lockCtaText}
          >
            {t('condition_card.unlock')}
          </Text>
        </View>
        <Text
          {...RESULT_TEXT_PROPS}
          style={styles.lockedTeaserText}
          testID={`condition-card-${section}-teaser`}
        >
          {value}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      testID="condition-card-root"
      style={[
        styles.card,
        getResultSurfaceChrome({
          colors: themeColors,
          isDark,
          kind: 'feature',
          accentColor: tone.accent,
        }),
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextContainer}>
          <View style={styles.conditionIdentityRow}>
            <View
              style={[
                styles.categoryIconWrap,
                {
                  backgroundColor: tone.scoreSurface,
                  borderColor: tone.border,
                },
              ]}
            >
              <ResultIcon
                color={tone.accent}
                size={layout.isCompact ? 16 : 18}
                testID={`condition-card-category-icon-${categoryIconToken}`}
                token={categoryIconToken}
              />
            </View>
            <Text
              {...RESULT_TEXT_PROPS}
              testID="condition-card-name"
              style={styles.conditionName}
            >
              {name}
            </Text>
          </View>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.severityBadge,
                {
                  borderColor: tone.border,
                  backgroundColor: tone.scoreSurface,
                },
              ]}
            >
              <View
                style={[styles.severityDot, { backgroundColor: tone.accent }]}
              />
              <Text
                {...RESULT_TEXT_PROPS}
                numberOfLines={1}
                style={[styles.severityText, { color: tone.accent }]}
              >
                {severityLabel}
              </Text>
            </View>

            <View style={styles.categoryBadge}>
              <Text
                {...RESULT_TEXT_PROPS}
                numberOfLines={2}
                style={styles.categoryText}
              >
                {category}
              </Text>
            </View>
          </View>
        </View>

        <Squircle
          testID="condition-card-probability-card"
          style={[
            styles.probabilityCard,
            {
              borderColor: tone.border,
              backgroundColor: tone.scoreSurface,
            },
          ]}
        >
          {isLocked ? (
            <Lock
              color={tone.accent}
              size={layout.isCompact ? 12 : 14}
              testID="condition-card-probability-lock"
            />
          ) : null}
          <Text
            {...RESULT_TEXT_PROPS}
            testID="condition-card-probability-value"
            numberOfLines={1}
            style={[styles.probabilityValue, { color: tone.accent }]}
          >
            {probabilityValue}
          </Text>
          {isLocked || isLoading ? (
            <Text
              {...RESULT_TEXT_PROPS}
              numberOfLines={1}
              style={[styles.probabilityPremiumLabel, { color: tone.accent }]}
              testID="condition-card-probability-premium-label"
            >
              {isLoading
                ? t('metric_card.loading_label')
                : t('metric_card.premium_label')}
            </Text>
          ) : null}
          <Text
            {...RESULT_TEXT_PROPS}
            testID="condition-card-probability-label"
            numberOfLines={2}
            style={styles.probabilityLabel}
          >
            {t('common.metrics.probability')}
          </Text>
        </Squircle>
      </View>

      <View style={styles.contentStack}>
        <Squircle style={styles.sectionCard}>
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={styles.sectionTitle}
          >
            {t('common.metrics.explanation')}
          </Text>
          {renderSectionBody('explanation', explanation)}
        </Squircle>

        <Squircle style={styles.sectionCard}>
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={styles.sectionTitle}
          >
            {t('common.metrics.advice')}
          </Text>
          {renderSectionBody('advice', advice)}
        </Squircle>
      </View>
    </View>
  );
}

const createStyles = (
  themeColors: any,
  isDark: boolean,
  layout: ReturnType<typeof getResultLayoutState>,
) =>
  StyleSheet.create({
    card: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.blockPadding,
      marginBottom: SPACING.md,
      gap: layout.blockPadding, borderCurve: 'continuous',
    },
    headerRow: {
      flexDirection: layout.isCompact ? 'column' : 'row',
      alignItems: layout.isCompact ? 'stretch' : 'flex-start',
      justifyContent: 'space-between',
      gap: layout.sectionGap,
    },
    headerTextContainer: {
      flex: 1,
      minWidth: 0,
      gap: SPACING.sm,
    },
    conditionIdentityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.isCompact ? SPACING.xs + 2 : SPACING.sm,
      minWidth: 0,
    },
    categoryIconWrap: {
      width: layout.isCompact ? 32 : 36,
      height: layout.isCompact ? 32 : 36,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      flexShrink: 0, borderCurve: 'continuous',
    },
    conditionName: {
      fontSize: layout.isCompact ? SIZES.lg : SIZES.lg + 1,
      lineHeight: layout.isCompact ? 24 : 25,
      fontWeight: FONT_WEIGHTS.bold,
      color: themeColors.primaryText,
      letterSpacing: 0,
      flex: 1,
      flexShrink: 1,
      includeFontPadding: false,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: SPACING.xs,
      minWidth: 0,
    },
    severityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 9999,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 1,
      maxWidth: '100%', borderCurve: 'continuous',
    },
    severityDot: {
      width: 7,
      height: 7,
      borderRadius: 9999, borderCurve: 'continuous',
    },
    severityText: {
      fontSize: SIZES.xs,
      fontWeight: FONT_WEIGHTS.semiBold,
      textTransform: 'uppercase',
      letterSpacing: layout.isCompact ? 0.35 : 0.5,
      flexShrink: 1,
      includeFontPadding: false,
    },
    categoryBadge: {
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '100%',
      borderRadius: 9999,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 1,
      backgroundColor: isDark
        ? withAlpha(themeColors.white, 0.08)
        : withAlpha(themeColors.primaryText, 0.05), borderCurve: 'continuous',
    },
    categoryText: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 16 : 15,
      color: themeColors.gray,
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
    probabilityCard: {
      minWidth: layout.isCompact ? undefined : 92,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      paddingHorizontal: SPACING.md,
      paddingVertical: layout.isCompact ? SPACING.sm : SPACING.sm + 2,
      alignSelf: layout.isCompact ? 'flex-start' : undefined,
      maxWidth: layout.isCompact ? '100%' : undefined, borderCurve: 'continuous',
    },
    probabilityValue: {
      fontSize: layout.isCompact ? SIZES.xl : SIZES.xl + 1,
      lineHeight: layout.isCompact ? 27 : 28,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
      includeFontPadding: false,
    },
    probabilityPremiumLabel: {
      fontSize: SIZES.xs,
      lineHeight: 12,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: layout.isCompact ? 0.25 : 0.35,
      includeFontPadding: false,
    },
    probabilityLabel: {
      marginTop: 2,
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: themeColors.gray,
      textAlign: 'center',
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
    contentStack: {
      gap: layout.sectionGap,
    },
    sectionCard: {
      borderRadius: layout.standardRadius,
      padding: layout.cardPadding + 2,
      backgroundColor: isDark
        ? withAlpha(themeColors.white, 0.06)
        : withAlpha(themeColors.background, 0.75),
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(themeColors.white, 0.05)
        : withAlpha(themeColors.primaryText, 0.06),
      gap: SPACING.xs + 2,
      minHeight: layout.summaryMinHeight - 24, borderCurve: 'continuous',
    },
    sectionTitle: {
      fontSize: SIZES.xs,
      fontWeight: FONT_WEIGHTS.semiBold,
      textTransform: 'uppercase',
      letterSpacing: layout.isCompact ? 0.55 : 0.8,
      color: themeColors.gray,
      includeFontPadding: false,
    },
    sectionText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      color: themeColors.primaryText,
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
    loadingSectionText: {
      color: themeColors.gray,
    },
    lockedBlock: {
      borderRadius: layout.standardRadius,
      padding: layout.cardPadding,
      backgroundColor: isDark
        ? withAlpha(themeColors.white, 0.05)
        : withAlpha(themeColors.primaryText, 0.04),
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(themeColors.white, 0.08)
        : withAlpha(themeColors.primaryText, 0.08),
      gap: SPACING.sm, borderCurve: 'continuous',
    },
    lockedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
    },
    lockBadge: {
      width: 24,
      height: 24,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: themeColors.primary,
      flexShrink: 0, borderCurve: 'continuous',
    },
    lockCtaText: {
      fontSize: SIZES.sm,
      lineHeight: layout.bodyTextLineHeight,
      color: themeColors.primary,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
      flexShrink: 1,
    },
    lockedTeaserText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      color: themeColors.gray,
      includeFontPadding: false,
    },
  });

export default ConditionCard;
