import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ArrowRight, Compass } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SPACING,
  getCtaColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ScanCoachIntent } from '@/utils/scanCoachIntent';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import { Squircle } from '@/components/Squircle';

interface ScanCoachCtaCardProps {
  intent: ScanCoachIntent;
  accentColor: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'hero';
  testID?: string;
}

export function ScanCoachCtaCard({
  intent,
  accentColor,
  onPress,
  disabled = false,
  variant = 'default',
  testID = 'scan-coach-cta-card',
}: ScanCoachCtaCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);
  const isHero = variant === 'hero';
  const title = t('coach.scan_result_cta.title');
  const rawSummary =
    intent.user_facing_summary || t('coach.scan_result_cta.body_fallback');
  const summary = rawSummary.toLowerCase().includes('coach')
    ? rawSummary
    : `${rawSummary} ${t('coach.scan_result_cta.body_suffix')}`;
  const priorityLabel = intent.priority_label?.trim() || null;
  const iconBackground = isDark
    ? withAlpha(accentColor, 0.2)
    : withAlpha(accentColor, 0.12);
  const actionBackground = isDark
    ? mixColors(accentColor, colors.background, 0.74)
    : mixColors(accentColor, colors.white, 0.18);
  const ctaColors = getCtaColors(colors, isDark);
  const buttonGradient = isDark
    ? ([
        mixColors(colors.primaryText, colors.secondary ?? colors.primaryText, 0.08),
        ctaColors.primaryBackground,
      ] as const)
    : ([
        mixColors(colors.primaryText, colors.white, 0.08),
        ctaColors.primaryBackground,
      ] as const);

  return (
    <View
      style={[
        styles.card,
        isHero ? styles.cardHero : null,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'feature',
          accentColor,
          surfaceVariant: 'soft',
        }),
        disabled ? styles.disabled : null,
      ]}
      testID={testID}
    >
      <View style={[styles.header, isHero ? styles.headerHero : null]}>
        <View
          style={[
            styles.iconShell,
            isHero ? styles.iconShellHero : null,
            {
              backgroundColor: iconBackground,
              borderColor: withAlpha(accentColor, isDark ? 0.22 : 0.12),
            },
          ]}
        >
          <Compass
            color={accentColor}
            size={isHero ? 22 : 20}
            strokeWidth={1.8}
          />
        </View>

        <View style={styles.copy}>
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={[styles.eyebrow, { color: accentColor }]}
          >
            {t('coach.scan_result_cta.eyebrow')}
          </Text>
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={isHero ? 3 : 2}
            style={[
              styles.title,
              isHero ? styles.titleHero : null,
              { color: colors.primaryText },
            ]}
          >
            {title}
          </Text>
        </View>
      </View>

      {priorityLabel ? (
        <View
          style={[
            styles.priorityPill,
            {
              backgroundColor: withAlpha(accentColor, isDark ? 0.16 : 0.1),
              borderColor: withAlpha(accentColor, isDark ? 0.28 : 0.16),
            },
          ]}
          testID={`${testID}-priority`}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            style={[styles.priorityText, { color: accentColor }]}
          >
            {priorityLabel}
          </Text>
        </View>
      ) : null}

      <Text
        {...RESULT_TEXT_PROPS}
        style={[styles.body, isHero ? styles.bodyHero : null, { color: colors.gray }]}
      >
        {summary}
      </Text>

      {isHero ? (
        <Squircle
          style={[
            styles.questionCard,
            {
              backgroundColor: isDark
                ? withAlpha(colors.white, 0.05)
                : withAlpha(colors.white, 0.74),
              borderColor: withAlpha(accentColor, isDark ? 0.18 : 0.1),
            },
          ]}
          testID={`${testID}-question-preview`}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            style={[styles.questionEyebrow, { color: accentColor }]}
          >
            {t('coach.scan_result_cta.question_label')}
          </Text>
          <Text
            {...RESULT_TEXT_PROPS}
            style={[styles.questionText, { color: colors.primaryText }]}
          >
            {intent.question_text}
          </Text>
        </Squircle>
      ) : null}

      <View style={[styles.footer, isHero ? styles.footerHero : null]}>
        <TouchableOpacity
          activeOpacity={0.86}
          disabled={disabled}
          onPress={onPress}
          style={[
            styles.actionButtonShell,
            isHero ? styles.actionButtonShellHero : null,
          ]}
          testID={`${testID}-button`}
        >
          <LinearGradient
            colors={buttonGradient}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={[
              styles.actionButton,
              {
                borderColor: ctaColors.primaryBorder,
                shadowColor: actionBackground,
              },
            ]}
          >
            <Text
              {...RESULT_TEXT_PROPS}
              adjustsFontSizeToFit
              minimumFontScale={0.84}
              numberOfLines={1}
              style={[
                styles.actionText,
                isHero ? styles.actionTextHero : null,
                {
                  color: ctaColors.primaryForeground,
                },
              ]}
            >
              {t(
                isHero
                  ? 'coach.scan_result_cta.action_direct'
                  : 'coach.scan_result_cta.action',
              )}
            </Text>
            <ArrowRight
              color={ctaColors.primaryForeground}
              size={isHero ? 18 : 17}
              strokeWidth={2.3}
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    card: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.blockPadding,
      gap: SPACING.sm, borderCurve: 'continuous',
    },
    cardHero: {
      padding: layout.largeBlockPadding,
      gap: layout.sectionGap,
    },
    disabled: {
      opacity: 0.68,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerHero: {
      alignItems: 'flex-start',
      gap: SPACING.md,
    },
    iconShell: {
      width: 42,
      height: 42,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    iconShellHero: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.lg, borderCurve: 'continuous',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    eyebrow: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      includeFontPadding: false,
    },
    title: {
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    titleHero: {
      fontSize: layout.heroTitleFontSize,
      lineHeight: layout.heroTitleLineHeight,
    },
    body: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
    bodyHero: {
      fontSize: layout.bodyTextFontSize + 1,
    },
    priorityPill: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs, borderCurve: 'continuous',
    },
    priorityText: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    questionCard: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: layout.blockPadding,
      gap: SPACING.xs, borderCurve: 'continuous',
    },
    questionEyebrow: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      includeFontPadding: false,
    },
    questionText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },
    footerHero: {
      alignItems: 'stretch',
    },
    actionButtonShell: {
      borderRadius: layout.ctaRadius,
      maxWidth: '100%',
      overflow: 'hidden', borderCurve: 'continuous',
    },
    actionButtonShellHero: {
      alignSelf: 'stretch',
      width: '100%',
    },
    actionButton: {
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: layout.ctaRadius,
      flexDirection: 'row',
      gap: SPACING.xs,
      justifyContent: 'center',
      minHeight: layout.ctaMinHeight,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: SPACING.md,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.10,
      shadowRadius: 14,
      elevation: 2, borderCurve: 'continuous',
    },
    actionText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
      flexShrink: 1,
    },
    actionTextHero: {
      fontSize: layout.bodyTextFontSize + 1,
      lineHeight: layout.emphasizedBodyLineHeight,
    },
  });

export default ScanCoachCtaCard;
