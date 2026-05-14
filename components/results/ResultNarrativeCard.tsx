import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import type { ResultSurfaceVariant } from '@/utils/resultVisualTheme';

interface ResultNarrativeCardProps {
  accentColor: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  children?: ReactNode;
  surfaceVariant?: ResultSurfaceVariant;
}

export function ResultNarrativeCard({
  accentColor,
  eyebrow,
  title,
  body,
  children,
  surfaceVariant = 'soft',
}: ResultNarrativeCardProps) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);

  return (
    <View
      style={[
        styles.card,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'feature',
          accentColor,
          surfaceVariant,
        }),
      ]}
    >
      {eyebrow ? (
        <Text
          {...RESULT_TEXT_PROPS}
          numberOfLines={1}
          style={[styles.eyebrow, { color: accentColor }]}
        >
          {eyebrow}
        </Text>
      ) : null}
      {title ? (
        <Text
          {...RESULT_TEXT_PROPS}
          style={[styles.title, { color: colors.primaryText }]}
        >
          {title}
        </Text>
      ) : null}
      {body ? (
        <Text
          {...RESULT_TEXT_PROPS}
          style={[styles.body, { color: colors.gray }]}
        >
          {body}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    card: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.blockPadding,
      gap: SPACING.xs + 2,
    },
    eyebrow: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: layout.isCompact ? 0.45 : 0.6,
      textTransform: 'uppercase',
      includeFontPadding: false,
    },
    title: {
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    body: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
  });

export default ResultNarrativeCard;
