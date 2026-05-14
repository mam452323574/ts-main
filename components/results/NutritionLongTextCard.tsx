import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Lock } from 'lucide-react-native';

import { ResultIcon } from '@/components/ResultIcon';
import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import type { ResultLongTextSectionViewModel } from '@/utils/resultViewModels';
import type { ResolvedResultItemTheme } from '@/utils/resultVisualTheme';

interface NutritionLongTextCardProps {
  section: ResultLongTextSectionViewModel;
  theme: ResolvedResultItemTheme;
  onPremiumPress?: () => void;
}

const TAG_COLLAPSED_LIMIT = 8;
const BODY_EXPAND_THRESHOLD = 180;

export function NutritionLongTextCard({
  section,
  theme,
  onPremiumPress,
}: NutritionLongTextCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);
  const [isExpanded, setIsExpanded] = useState(false);
  const premiumRenderState = section.premiumRenderState ?? 'unlocked';
  const isLocked = premiumRenderState === 'locked';
  const isLoading = premiumRenderState === 'loading';
  const body = section.body ?? '';
  const tags = section.tags ?? [];
  const canExpand =
    !isLocked &&
    !isLoading &&
    (body.length > BODY_EXPAND_THRESHOLD || tags.length > TAG_COLLAPSED_LIMIT);
  const visibleTags =
    canExpand && !isExpanded ? tags.slice(0, TAG_COLLAPSED_LIMIT) : tags;
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
  const collapsedMaxLines = section.collapsedMaxLines ?? 4;
  const premiumLabel = t('metric_card.premium_label');
  const loadingLabel = t('metric_card.loading_label');

  const content = (
    <View
      testID={`nutrition-long-section-${section.id}`}
      style={[
        styles.card,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'standard',
          accentColor: theme.accentColor,
          surfaceVariant: theme.surfaceVariant,
        }),
      ]}
    >
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: theme.iconSurfaceColor,
              borderColor: theme.iconBorderColor,
            },
          ]}
        >
          <ResultIcon
            color={theme.iconColor}
            size={layout.isCompact ? 17 : 18}
            token={section.icon}
          />
        </View>
        <Text
          {...RESULT_TEXT_PROPS}
          numberOfLines={2}
          style={[styles.title, { color: colors.primaryText }]}
        >
          {section.title}
        </Text>
      </View>

      {isLocked || isLoading ? (
        <View style={styles.lockedContent}>
          <View
            testID={`nutrition-long-section-placeholder-${section.id}`}
            style={[
              styles.placeholder,
              {
                backgroundColor: isDark
                  ? withAlpha(colors.white, 0.08)
                  : withAlpha(colors.primaryText, 0.045),
              },
            ]}
          >
            <View
              style={[
                styles.placeholderLine,
                {
                  backgroundColor: isDark
                    ? withAlpha(colors.white, 0.22)
                    : withAlpha(colors.primaryText, 0.14),
                },
              ]}
            />
            <View
              style={[
                styles.placeholderLineShort,
                {
                  backgroundColor: isDark
                    ? withAlpha(colors.white, 0.16)
                    : withAlpha(colors.primaryText, 0.1),
                },
              ]}
            />
          </View>
          <View
            style={[
              styles.statusTag,
              {
                backgroundColor: isLocked
                  ? withAlpha(colors.gold, isDark ? 0.14 : 0.18)
                  : isDark
                    ? withAlpha(colors.white, 0.08)
                    : withAlpha(colors.primaryText, 0.04),
                borderColor: isLocked
                  ? withAlpha(colors.gold, isDark ? 0.24 : 0.2)
                  : isDark
                    ? withAlpha(colors.white, 0.12)
                    : withAlpha(colors.primaryText, 0.08),
              },
            ]}
          >
            {isLocked ? <Lock color={colors.gold} size={12} /> : null}
            <Text
              {...RESULT_TEXT_PROPS}
              numberOfLines={1}
              style={[
                styles.statusText,
                { color: isLocked ? colors.gold : colors.gray },
              ]}
            >
              {isLocked ? premiumLabel : loadingLabel}
            </Text>
          </View>
        </View>
      ) : (
        <>
          {visibleTags.length > 0 ? (
            <View style={styles.tagRow}>
              {visibleTags.map((tag, index) => (
                <View
                  key={`${tag}-${index}`}
                  style={[
                    styles.tag,
                    {
                      backgroundColor: theme.iconSurfaceColor,
                      borderColor: theme.iconBorderColor,
                    },
                  ]}
                >
                  <Text
                    {...RESULT_TEXT_PROPS}
                    numberOfLines={1}
                    style={[styles.tagText, { color: theme.valueColor }]}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
              {hiddenTagCount > 0 ? (
                <View
                  style={[
                    styles.tag,
                    {
                      backgroundColor: isDark
                        ? withAlpha(colors.white, 0.06)
                        : withAlpha(colors.primaryText, 0.045),
                      borderColor: isDark
                        ? withAlpha(colors.white, 0.1)
                        : withAlpha(colors.primaryText, 0.08),
                    },
                  ]}
                >
                  <Text
                    {...RESULT_TEXT_PROPS}
                    numberOfLines={1}
                    style={[styles.tagText, { color: colors.gray }]}
                  >
                    +{hiddenTagCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {body ? (
            <Text
              {...RESULT_TEXT_PROPS}
              numberOfLines={canExpand && !isExpanded ? collapsedMaxLines : undefined}
              style={[styles.body, { color: colors.gray }]}
              testID={`nutrition-long-section-body-${section.id}`}
            >
              {body}
            </Text>
          ) : null}

          {canExpand ? (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setIsExpanded((current) => !current)}
              style={[
                styles.expandButton,
                {
                  borderColor: withAlpha(theme.accentColor, isDark ? 0.22 : 0.16),
                  backgroundColor: withAlpha(theme.accentColor, isDark ? 0.08 : 0.055),
                },
              ]}
              testID={`nutrition-long-section-toggle-${section.id}`}
            >
              <Text
                {...RESULT_TEXT_PROPS}
                numberOfLines={1}
                style={[styles.expandText, { color: theme.valueColor }]}
              >
                {t(
                  isExpanded
                    ? 'scan.nutrition.long_sections.collapse'
                    : 'scan.nutrition.long_sections.expand',
                )}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );

  if (isLocked && onPremiumPress) {
    return (
      <TouchableOpacity
        accessibilityLabel={`${section.title}. ${premiumLabel}`}
        accessibilityRole="button"
        activeOpacity={0.86}
        onPress={onPremiumPress}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    card: {
      width: '100%',
      minWidth: 0,
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: layout.isCompact ? SPACING.md : SPACING.lg,
      gap: layout.isCompact ? SPACING.sm : SPACING.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      minWidth: 0,
    },
    iconWrap: {
      width: layout.isCompact ? 34 : 38,
      height: layout.isCompact ? 34 : 38,
      borderRadius: layout.standardRadius - 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      flexShrink: 0,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    tag: {
      borderWidth: 1,
      borderRadius: 9999,
      paddingHorizontal: SPACING.sm,
      paddingVertical: layout.isCompact ? 4 : 5,
      maxWidth: '100%',
    },
    tagText: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 14 : 15,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    body: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
    expandButton: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: 9999,
      paddingHorizontal: SPACING.md,
      paddingVertical: layout.isCompact ? 6 : 7,
    },
    expandText: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 14 : 15,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    lockedContent: {
      gap: SPACING.sm,
      alignItems: 'flex-start',
    },
    placeholder: {
      alignSelf: 'stretch',
      borderRadius: layout.standardRadius - 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      gap: SPACING.xs,
    },
    placeholderLine: {
      width: '82%',
      height: layout.isCompact ? 11 : 12,
      borderRadius: 9999,
    },
    placeholderLineShort: {
      width: '56%',
      height: layout.isCompact ? 10 : 11,
      borderRadius: 9999,
    },
    statusTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      borderRadius: 9999,
      borderWidth: 1,
      paddingHorizontal: SPACING.sm,
      paddingVertical: layout.isCompact ? 3 : 4,
    },
    statusText: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 13 : 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
  });

export default NutritionLongTextCard;
