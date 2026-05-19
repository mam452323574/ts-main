import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Lock } from 'lucide-react-native';

import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import type { PremiumRenderState } from '@/utils/subscription';
import { Squircle } from '@/components/Squircle';

interface PremiumTeaserCardProps {
  title: string;
  accentColor?: string;
  lineCount?: number;
  onPress?: () => void;
  premiumRenderState?: PremiumRenderState;
  testID?: string;
}

export function PremiumTeaserCard({
  title,
  accentColor,
  lineCount = 3,
  onPress,
  premiumRenderState = 'locked',
  testID = 'premium-teaser-card',
}: PremiumTeaserCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);
  const isLocked = premiumRenderState === 'locked';
  const isLoading = premiumRenderState === 'loading';
  const resolvedAccentColor = accentColor ?? colors.gold;
  const label = isLoading
    ? t('metric_card.loading_label')
    : t('metric_card.premium_label');
  const placeholderLines = Array.from({ length: lineCount }, (_, index) => index);

  const content = (
    <View
      style={[
        styles.card,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'feature',
          accentColor: isLoading ? colors.gray : resolvedAccentColor,
          surfaceVariant: isLocked ? 'wellnessPremium' : 'soft',
        }),
      ]}
      testID={testID}
    >
      <View style={styles.headerRow}>
        <Text
          {...RESULT_TEXT_PROPS}
          numberOfLines={2}
          style={[styles.title, { color: colors.primaryText }]}
        >
          {title}
        </Text>
        <View
          style={[
            styles.statusTag,
            {
              backgroundColor: isLoading
                ? withAlpha(colors.primaryText, isDark ? 0.08 : 0.05)
                : withAlpha(colors.gold, isDark ? 0.15 : 0.18),
              borderColor: isLoading
                ? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08)
                : withAlpha(colors.gold, isDark ? 0.25 : 0.2),
            },
          ]}
        >
          {isLocked ? <Lock color={colors.gold} size={12} /> : null}
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={[styles.statusText, { color: isLocked ? colors.gold : colors.gray }]}
          >
            {label}
          </Text>
        </View>
      </View>

      <Squircle
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.placeholderBlock,
          {
            backgroundColor: isDark
              ? withAlpha(colors.white, 0.06)
              : withAlpha(colors.primaryText, 0.035),
          },
        ]}
      >
        {placeholderLines.map((line) => (
          <View
            key={line}
            style={[
              styles.placeholderLine,
              line === placeholderLines.length - 1 ? styles.placeholderLineShort : null,
              {
                backgroundColor: isDark
                  ? withAlpha(colors.white, line === 0 ? 0.22 : 0.16)
                  : withAlpha(colors.primaryText, line === 0 ? 0.14 : 0.1),
              },
            ]}
          />
        ))}
      </Squircle>
    </View>
  );

  if (isLocked && onPress) {
    return (
      <TouchableOpacity
        accessibilityLabel={`${title}. ${label}`}
        accessibilityRole="button"
        activeOpacity={0.86}
        onPress={onPress}
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
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.blockPadding,
      gap: layout.sectionGap, borderCurve: 'continuous',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    statusTag: {
      minHeight: 26,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      borderRadius: 9999,
      borderWidth: 1,
      paddingHorizontal: SPACING.sm,
      paddingVertical: layout.isCompact ? 3 : 4,
      flexShrink: 0, borderCurve: 'continuous',
    },
    statusText: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 13 : 14,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
      letterSpacing: layout.isCompact ? 0.35 : 0.45,
    },
    placeholderBlock: {
      borderRadius: layout.standardRadius,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      gap: SPACING.xs, borderCurve: 'continuous',
    },
    placeholderLine: {
      width: '88%',
      height: layout.isCompact ? 10 : 11,
      borderRadius: 9999, borderCurve: 'continuous',
    },
    placeholderLineShort: {
      width: '58%',
    },
  });

export default PremiumTeaserCard;
