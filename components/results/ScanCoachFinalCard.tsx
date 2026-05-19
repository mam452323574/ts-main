import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ArrowRight, Check, Compass } from 'lucide-react-native';
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

interface ScanCoachFinalCardProps {
  intent: ScanCoachIntent;
  accentColor: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function ScanCoachFinalCard({
  intent,
  accentColor,
  onPress,
  disabled = false,
  testID = 'scan-coach-final-card',
}: ScanCoachFinalCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);

  const surfaceChrome = getResultSurfaceChrome({
    colors,
    isDark,
    kind: 'hero',
    accentColor,
    surfaceVariant: 'wellnessPremium',
  });

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

  const backdropGradient = isDark
    ? ([
        withAlpha(accentColor, 0.10),
        withAlpha(accentColor, 0.02),
        'transparent',
      ] as const)
    : ([
        withAlpha(accentColor, 0.08),
        withAlpha(accentColor, 0.02),
        'transparent',
      ] as const);

  const iconShellBackground = isDark
    ? withAlpha(accentColor, 0.16)
    : withAlpha(accentColor, 0.10);
  const iconShellBorder = withAlpha(accentColor, isDark ? 0.24 : 0.14);

  const innerSurface = isDark
    ? withAlpha(colors.white, 0.05)
    : withAlpha(colors.white, 0.7);
  const innerBorder = withAlpha(accentColor, isDark ? 0.18 : 0.1);

  const benefits = [
    t('coach.scan_result_cta.final.benefit_1'),
    t('coach.scan_result_cta.final.benefit_2'),
    t('coach.scan_result_cta.final.benefit_3'),
  ];

  return (
    <View
      style={[styles.card, surfaceChrome, disabled ? styles.disabled : null]}
      testID={testID}
    >
      <LinearGradient
        colors={backdropGradient}
        end={{ x: 0.5, y: 1 }}
        start={{ x: 0.5, y: 0 }}
        style={styles.backdrop}
        pointerEvents="none"
      />

      <View style={styles.eyebrowRow}>
        <Squircle
          style={[
            styles.iconShell,
            {
              backgroundColor: iconShellBackground,
              borderColor: iconShellBorder,
            },
          ]}
        >
          <Compass color={accentColor} size={20} strokeWidth={1.8} />
        </Squircle>
        <Text
          {...RESULT_TEXT_PROPS}
          numberOfLines={1}
          style={[styles.eyebrow, { color: accentColor }]}
        >
          {t('coach.scan_result_cta.final.eyebrow')}
        </Text>
      </View>

      <View style={styles.titleStack}>
        <Text
          {...RESULT_TEXT_PROPS}
          style={[styles.title, { color: colors.primaryText }]}
        >
          {t('coach.scan_result_cta.final.title_lead')}{' '}
          <Text style={[styles.titleHighlight, { color: accentColor }]}>
            {t('coach.scan_result_cta.final.title_highlight')}
          </Text>
        </Text>
        <Text
          {...RESULT_TEXT_PROPS}
          style={[styles.subtitle, { color: colors.gray }]}
        >
          {t('coach.scan_result_cta.final.subtitle')}
        </Text>
      </View>

      {intent.question_text ? (
        <Squircle
          style={[
            styles.questionCard,
            { backgroundColor: innerSurface, borderColor: innerBorder },
          ]}
          testID={`${testID}-question-preview`}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            style={[styles.questionEyebrow, { color: accentColor }]}
          >
            {t('coach.scan_result_cta.final.question_label')}
          </Text>
          <Text
            {...RESULT_TEXT_PROPS}
            style={[styles.questionText, { color: colors.primaryText }]}
          >
            « {intent.question_text} »
          </Text>
        </Squircle>
      ) : null}

      <Squircle
        style={[
          styles.benefitsCard,
          { backgroundColor: innerSurface, borderColor: innerBorder },
        ]}
      >
        {benefits.map((benefit, index) => (
          <View key={index} style={styles.benefitRow}>
            <View
              style={[
                styles.benefitBullet,
                {
                  backgroundColor: withAlpha(accentColor, isDark ? 0.22 : 0.14),
                },
              ]}
            >
              <Check color={accentColor} size={12} strokeWidth={3} />
            </View>
            <Text
              {...RESULT_TEXT_PROPS}
              style={[styles.benefitText, { color: colors.primaryText }]}
            >
              {benefit}
            </Text>
          </View>
        ))}
      </Squircle>

      <TouchableOpacity
        activeOpacity={0.86}
        disabled={disabled}
        onPress={onPress}
        style={styles.actionButtonShell}
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
              shadowColor: accentColor,
            },
          ]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            adjustsFontSizeToFit
            minimumFontScale={0.84}
            numberOfLines={1}
            style={[styles.actionText, { color: ctaColors.primaryForeground }]}
          >
            {t('coach.scan_result_cta.final.cta')}
          </Text>
          <ArrowRight
            color={ctaColors.primaryForeground}
            size={18}
            strokeWidth={2.3}
          />
        </LinearGradient>
      </TouchableOpacity>

      <Text
        {...RESULT_TEXT_PROPS}
        numberOfLines={1}
        style={[styles.footnote, { color: colors.gray }]}
      >
        {t('coach.scan_result_cta.final.footnote')}
      </Text>
    </View>
  );
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    card: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.largeBlockPadding,
      gap: layout.sectionGap,
      overflow: 'hidden',
      position: 'relative', borderCurve: 'continuous',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    disabled: {
      opacity: 0.68,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    iconShell: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    eyebrow: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      includeFontPadding: false,
      flexShrink: 1,
    },
    titleStack: {
      gap: SPACING.xs,
    },
    title: {
      fontSize: layout.heroTitleFontSize + 2,
      lineHeight: layout.heroTitleLineHeight + 2,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    titleHighlight: {
      fontWeight: FONT_WEIGHTS.bold,
    },
    subtitle: {
      fontSize: layout.bodyTextFontSize + 1,
      lineHeight: layout.emphasizedBodyLineHeight,
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
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      includeFontPadding: false,
    },
    questionText: {
      fontSize: layout.bodyTextFontSize + 1,
      lineHeight: layout.emphasizedBodyLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
      fontStyle: 'italic',
    },
    benefitsCard: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: layout.blockPadding,
      gap: SPACING.sm, borderCurve: 'continuous',
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    benefitBullet: {
      width: 22,
      height: 22,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0, borderCurve: 'continuous',
    },
    benefitText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
      flexShrink: 1,
    },
    actionButtonShell: {
      borderRadius: layout.ctaRadius,
      overflow: 'hidden',
      alignSelf: 'stretch',
      width: '100%', borderCurve: 'continuous',
    },
    actionButton: {
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: layout.ctaRadius,
      flexDirection: 'row',
      gap: SPACING.xs,
      justifyContent: 'center',
      minHeight: layout.ctaMinHeight + 4,
      paddingHorizontal: layout.blockPadding,
      paddingVertical: SPACING.md,
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 2, borderCurve: 'continuous',
    },
    actionText: {
      fontSize: layout.bodyTextFontSize + 1,
      lineHeight: layout.emphasizedBodyLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
      flexShrink: 1,
    },
    footnote: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.3,
      textAlign: 'center',
      includeFontPadding: false,
    },
  });

export default ScanCoachFinalCard;
