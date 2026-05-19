import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { FONT_WEIGHTS, SPACING, mixColors, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import type { ResultSurfaceVariant } from '@/utils/resultVisualTheme';
import { Squircle } from '@/components/Squircle';

interface ResultHeroSurfaceProps {
  accentColor: string;
  title: string;
  subtitle?: string;
  headerContent?: ReactNode;
  visual: ReactNode;
  insight?: string;
  footerContent?: ReactNode;
  surfaceVariant?: ResultSurfaceVariant;
  backgroundMediaUri?: string | null;
}

export function ResultHeroSurface({
  accentColor,
  title,
  subtitle,
  headerContent,
  visual,
  insight,
  footerContent,
  surfaceVariant = 'wellnessPremium',
}: ResultHeroSurfaceProps) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);
  const shouldSplitHero = layout.canSplitHero;

  return (
    <View
      testID="result-hero-surface"
      style={[
        styles.card,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'hero',
          accentColor,
          surfaceVariant,
        }),
      ]}
    >
      <View
        pointerEvents="none"
        style={styles.abstractBackdrop}
        testID="result-hero-abstract-backdrop"
      >
        <LinearGradient
          testID="result-hero-base-gradient"
          colors={[
            mixColors(colors.cardBackground, colors.background, isDark ? 0.32 : 0.14),
            mixColors(
              colors.cardBackground,
              colors.surfaceElevated ?? colors.cardBackground,
              isDark ? 0.18 : 0.08,
            ),
            mixColors(colors.cardBackground, colors.primaryText, isDark ? 0.024 : 0.01),
          ]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.abstractLayer}
        />
        <LinearGradient
          testID="result-hero-accent-gradient"
          colors={[
            withAlpha(accentColor, isDark ? 0.045 : 0.022),
            withAlpha(colors.primary, isDark ? 0.026 : 0.014),
            'transparent',
          ]}
          end={{ x: 0.92, y: 1 }}
          start={{ x: 0.08, y: 0 }}
          style={styles.abstractLayer}
        />
        <View
          style={[
            styles.abstractSheen,
            {
              borderColor: withAlpha(colors.white, isDark ? 0.06 : 0.24),
            },
          ]}
        />
      </View>

      {headerContent ? <View style={styles.headerRow}>{headerContent}</View> : null}

      <View
        testID="result-hero-body"
        style={[styles.bodyRow, shouldSplitHero ? styles.bodySplit : styles.bodyStacked]}
      >
        <View
          testID="result-hero-copy"
          style={[styles.copyBlock, shouldSplitHero ? styles.copyBlockSplit : null]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            adjustsFontSizeToFit
            ellipsizeMode="tail"
            minimumFontScale={0.86}
            numberOfLines={2}
            style={[
              styles.title,
              shouldSplitHero ? styles.titleSplit : null,
              { color: colors.primaryText },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              {...RESULT_TEXT_PROPS}
              style={[
                styles.subtitle,
                shouldSplitHero ? styles.subtitleSplit : null,
                { color: colors.gray },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View
          testID="result-hero-visual-column"
          style={[styles.visualColumn, shouldSplitHero ? styles.visualColumnSplit : null]}
        >
          <Squircle
            testID="result-hero-visual-shell"
            style={[
              styles.visualShell,
              {
                backgroundColor: isDark
                  ? withAlpha(colors.white, 0.04)
                  : withAlpha(colors.white, 0.78),
                borderColor: isDark
                  ? withAlpha(colors.white, 0.08)
                  : withAlpha(colors.primaryText, 0.06),
              },
            ]}
          >
            <View style={styles.visualWrap}>{visual}</View>
          </Squircle>
        </View>
      </View>

      {insight ? (
        <Squircle
          style={[
            styles.insightStrip,
            {
              backgroundColor: isDark
                ? withAlpha(colors.white, 0.05)
                : withAlpha(colors.primaryText, 0.04),
              borderColor: withAlpha(accentColor, isDark ? 0.14 : 0.08),
            },
          ]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            style={[styles.insightText, { color: colors.primaryText }]}
          >
            {insight}
          </Text>
        </Squircle>
      ) : null}

      {footerContent}
    </View>
  );
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    card: {
      borderRadius: layout.heroRadius,
      borderWidth: 1,
      padding: layout.largeBlockPadding,
      gap: layout.sectionGap,
      overflow: 'hidden',
      position: 'relative', borderCurve: 'continuous',
    },
    abstractBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    abstractLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    abstractSheen: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      borderTopWidth: 1,
    },
    headerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    bodyRow: {
      gap: layout.sectionGap,
    },
    bodyStacked: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    bodySplit: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    copyBlock: {
      gap: SPACING.xs,
      alignItems: 'center',
      alignSelf: 'stretch',
      minWidth: 0,
    },
    copyBlockSplit: {
      flex: 1,
      maxWidth: '56%',
      alignItems: 'flex-start',
      alignSelf: 'auto',
    },
    title: {
      fontSize: layout.heroTitleFontSize,
      lineHeight: layout.heroTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
      letterSpacing: 0,
      alignSelf: 'stretch',
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    titleSplit: {
      textAlign: 'left',
    },
    subtitle: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      textAlign: 'center',
      alignSelf: 'stretch',
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    subtitleSplit: {
      textAlign: 'left',
      maxWidth: '96%',
    },
    visualColumn: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
    },
    visualColumnSplit: {
      minWidth: 188,
      alignItems: 'flex-end',
      alignSelf: 'auto',
      flexShrink: 0,
    },
    visualShell: {
      minWidth: layout.scoreGaugeSize + layout.cardPadding * 2,
      minHeight: layout.scoreGaugeSize + layout.cardPadding * 2,
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.cardPadding,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    visualWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightStrip: {
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      paddingHorizontal: layout.cardPadding,
      paddingVertical: layout.cardPadding, borderCurve: 'continuous',
    },
    insightText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      textAlign: 'center',
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
  });

export default ResultHeroSurface;
