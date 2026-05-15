import { useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Utensils,
} from 'lucide-react-native';

import { ChefModeIcon } from '@/components/fridge/ChefModeIcon';
import { OptimizedImage } from '@/components/OptimizedImage';
import { PremiumTeaserCard } from '@/components/results/PremiumTeaserCard';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  type ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { FridgeMealMode, FridgeMealResult } from '@/types/fridgeScan';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
  type ResultLayoutState,
} from '@/utils/resultLayout';
import { resolveChefSurfaceColors as resolveChefSurfaceThemeColors } from '@/utils/scanFlowVisualTheme';
import type { PremiumRenderState } from '@/utils/subscription';

type Translate = (scope: string, options?: Record<string, unknown>) => string;

export type ChefModeTheme = {
  accent: string;
  contrast: string;
  deep: string;
  gradient: [string, string, string];
  soft: string;
};

type ChefResultCardProps = {
  imageUri?: string;
  mealResult: FridgeMealResult;
  onPremiumPress?: () => void;
  premiumRenderState?: PremiumRenderState;
  selectedMode: FridgeMealMode;
  t: Translate;
};

export const resolveChefSurfaceColors = resolveChefSurfaceThemeColors;

function createChefModeTheme(
  options: {
    accent: string;
    contrast: string;
    deep: string;
    base: string;
    colors: ThemeColors;
    isDark: boolean;
  },
): ChefModeTheme {
  const { accent, contrast, deep, base, colors, isDark } = options;
  const cardBase = colors.cardBackground;
  const backgroundBase = colors.background;

  return {
    accent,
    contrast,
    deep,
    gradient: [
      mixColors(base, accent, isDark ? 0.22 : 0.12),
      mixColors(cardBase, deep, isDark ? 0.26 : 0.1),
      backgroundBase,
    ],
    soft: withAlpha(accent, isDark ? 0.16 : 0.12),
  };
}

export function resolveChefModeTheme(
  mode: FridgeMealMode,
  colors: ThemeColors,
  isDark: boolean,
): ChefModeTheme {
  if (mode === 'muscle_gain') {
    return createChefModeTheme({
      accent: isDark ? '#6CA7FF' : colors.primary,
      contrast: isDark ? '#D7ECFF' : '#355D90',
      deep: isDark ? '#1C3C66' : '#B7C7E5',
      base: isDark ? '#081423' : '#EEF5FF',
      colors,
      isDark,
    });
  }

  if (mode === 'gourmand') {
    return createChefModeTheme({
      accent: isDark ? '#F2B85B' : '#D88A24',
      contrast: isDark ? '#FFE6B0' : '#8C5C22',
      deep: isDark ? '#513716' : '#DCC39B',
      base: isDark ? '#1D1408' : '#FFF3E3',
      colors,
      isDark,
    });
  }

  return createChefModeTheme({
    accent: isDark ? '#7BBF9D' : colors.accentGreen,
    contrast: isDark ? '#DDF5EA' : '#44755D',
    deep: isDark ? '#1F4C3D' : '#C3DDCF',
    base: isDark ? '#081812' : '#EFF8F2',
    colors,
    isDark,
  });
}

function buildNutritionTags(mealResult: FridgeMealResult, t: Translate) {
  const tags: string[] = [];

  if (mealResult.nutrition_estimate.calories_band) {
    tags.push(
      `${t('fridge_scan_result.labels.calories')}: ${t(
        `fridge_scan_result.calories_band.${mealResult.nutrition_estimate.calories_band}`,
      )}`,
    );
  }

  if (mealResult.nutrition_estimate.protein_band) {
    tags.push(
      `${t('fridge_scan_result.labels.protein')}: ${t(
        `fridge_scan_result.protein_band.${mealResult.nutrition_estimate.protein_band}`,
      )}`,
    );
  }

  return tags;
}

function ChefPill({
  children,
  icon,
  variant = 'subtle',
}: {
  children: string;
  icon?: ReactNode;
  variant?: 'accent' | 'subtle';
}) {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const styles = useMemo(() => createPillStyles(colors, isDark), [colors, isDark]);

  return (
    <View
      style={[
        styles.pill,
        variant === 'accent' ? styles.pillAccent : styles.pillSubtle,
      ]}
    >
      {icon}
      <Text
        {...RESULT_TEXT_PROPS}
        numberOfLines={1}
        style={[
          styles.pillText,
          variant === 'accent' ? styles.pillTextAccent : null,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function Section({
  children,
  layout,
  modeTheme,
  testID,
  title,
}: {
  children: ReactNode;
  layout: ResultLayoutState;
  modeTheme: ChefModeTheme;
  testID?: string;
  title: string;
}) {
  const { colors, isDark } = useTheme();
  const surfaceColors = useMemo(
    () => resolveChefSurfaceColors(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createSectionStyles(surfaceColors, layout),
    [layout, surfaceColors],
  );

  return (
    <View
      style={[
        styles.section,
        getResultSurfaceChrome({
          colors: surfaceColors,
          isDark,
          kind: 'feature',
          accentColor: modeTheme.accent,
          surfaceVariant: 'soft',
        }),
      ]}
      testID={testID}
    >
      <Text {...RESULT_TEXT_PROPS} style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function BulletList({
  accent,
  items,
}: {
  accent: string;
  items: string[];
}) {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const listStyles = useMemo(() => createListStyles(colors), [colors]);

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={listStyles.stack}>
      {items.map((item, index) => (
        <View key={`${index}-${item}`} style={listStyles.bulletRow}>
          <View style={[listStyles.bulletDot, { backgroundColor: accent }]} />
          <Text {...RESULT_TEXT_PROPS} style={listStyles.bulletText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StepList({
  accent,
  steps,
}: {
  accent: string;
  steps: string[];
}) {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const listStyles = useMemo(() => createListStyles(colors), [colors]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <View style={listStyles.stack}>
      {steps.map((step, index) => (
        <View key={`${index}-${step}`} style={listStyles.stepRow}>
          <View style={[listStyles.stepIndex, { backgroundColor: accent }]}>
            <Text {...RESULT_TEXT_PROPS} style={listStyles.stepIndexText}>
              {index + 1}
            </Text>
          </View>
          <Text {...RESULT_TEXT_PROPS} style={listStyles.stepText}>
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ChipList({
  accent,
  compact = false,
  items,
}: {
  accent: string;
  compact?: boolean;
  items: string[];
}) {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const listStyles = useMemo(() => createListStyles(colors), [colors]);

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={listStyles.chipWrap}>
      {items.map((item, index) => (
        <View
          key={`${index}-${item}`}
          style={[
            listStyles.chip,
            compact ? listStyles.chipCompact : null,
            { backgroundColor: withAlpha(accent, compact ? 0.1 : 0.15) },
          ]}
        >
          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={2}
            style={[
              listStyles.chipText,
              compact ? listStyles.chipTextCompact : null,
            ]}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ChefResultCard({
  imageUri,
  mealResult,
  onPremiumPress,
  premiumRenderState = 'unlocked',
  selectedMode,
  t,
}: ChefResultCardProps) {
  const { colors: themeColors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const modeTheme = useMemo(
    () => resolveChefModeTheme(selectedMode, colors, isDark),
    [colors, isDark, selectedMode],
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, layout, modeTheme),
    [colors, isDark, layout, modeTheme],
  );
  const modeLabel = t(`fridge_scan.mode_labels.${selectedMode}`);
  const nutritionTags = useMemo(
    () => buildNutritionTags(mealResult, t),
    [mealResult, t],
  );
  const hasNutritionSection =
    nutritionTags.length > 0 || !!mealResult.nutrition_estimate.note;
  const hasAdviceSection = mealResult.tips.length > 0;
  const hasSubstitutionSection = mealResult.substitutions.length > 0;
  const hasAdditionsSection = mealResult.optional_additions.length > 0;
  const isUnlocked = premiumRenderState === 'unlocked';
  const isLocked = premiumRenderState === 'locked';
  const renderPremiumTeaser = (
    title: string,
    testID: string,
    lineCount = 3,
  ) => (
    <PremiumTeaserCard
      accentColor={modeTheme.accent}
      lineCount={lineCount}
      onPress={isLocked ? onPremiumPress : undefined}
      premiumRenderState={premiumRenderState}
      testID={testID}
      title={title}
    />
  );
  const renderGatedSection = (
    title: string,
    testID: string,
    children: ReactNode,
    lineCount = 3,
  ) => (
    isUnlocked ? (
      <Section
        layout={layout}
        modeTheme={modeTheme}
        title={title}
        testID={testID}
      >
        {children}
      </Section>
    ) : renderPremiumTeaser(title, testID, lineCount)
  );

  return (
    <View style={styles.stack} testID="chef-result-card">
      <View
        style={styles.hiddenMarker}
        testID={`chef-result-mode-${selectedMode}`}
      />

      <LinearGradient
        colors={modeTheme.gradient}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[
          styles.headerCard,
          getResultSurfaceChrome({
            colors,
            isDark,
            kind: 'hero',
            accentColor: modeTheme.accent,
          }),
        ]}
        testID="chef-result-header-card"
      >
        <View style={styles.headerTopRow}>
          <View style={styles.chefIdentity}>
            <View style={styles.avatarShell}>
              <View style={styles.avatarHalo} />
              <View style={styles.avatarRing}>
                <ChefModeIcon
                  color={modeTheme.contrast}
                  mode={selectedMode}
                  size={layout.isCompact ? 24 : 26}
                  strokeWidth={2.35}
                />
              </View>
            </View>
            <View style={styles.chefCopy}>
              <Text {...RESULT_TEXT_PROPS} numberOfLines={1} style={styles.eyebrow}>
                {t('fridge_scan_result.labels.chef')}
              </Text>
              <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.modeTitle}>
                {modeLabel}
              </Text>
            </View>
          </View>

          <ChefPill
            icon={
              <ShieldCheck
                color={modeTheme.contrast}
                size={13}
                strokeWidth={2.4}
              />
            }
          >
            {t('fridge_scan_result.labels.non_medical')}
          </ChefPill>
        </View>

        <View style={styles.statusPills}>
          <ChefPill variant="accent">
            {t(`fridge_scan_result.goal_badges.${selectedMode}`)}
          </ChefPill>
          <ChefPill
            icon={
              <CheckCircle2
                color={modeTheme.accent}
                size={13}
                strokeWidth={2.4}
              />
            }
          >
            {t(`fridge_scan_result.proposal_status.${mealResult.proposal_status}`)}
          </ChefPill>
        </View>
      </LinearGradient>

      <View
        style={[
          styles.cookCard,
          getResultSurfaceChrome({
            colors,
            isDark,
            kind: 'feature',
            accentColor: modeTheme.accent,
            surfaceVariant: 'emphasis',
          }),
        ]}
        testID="chef-result-cook-card"
      >
        <View style={styles.cardLabelRow}>
          <Utensils color={modeTheme.accent} size={17} strokeWidth={2.35} />
          <Text {...RESULT_TEXT_PROPS} style={styles.cardLabel}>
            {t('fridge_scan_result.labels.to_cook')}
          </Text>
        </View>

        <View style={styles.cookMainRow}>
          {imageUri ? (
            <OptimizedImage
              source={{ uri: imageUri }}
              style={styles.mealImage}
              recyclingKey={imageUri}
              testID="chef-result-image"
            />
          ) : null}
          <View style={styles.cookCopy}>
            <Text
              {...RESULT_TEXT_PROPS}
              style={styles.recipeTitle}
              testID="chef-result-recipe-title"
            >
              {mealResult.recipe_title}
            </Text>
            <Text
              {...RESULT_TEXT_PROPS}
              style={styles.summary}
              testID="chef-result-summary"
            >
              {mealResult.short_summary}
            </Text>
          </View>
        </View>

        {isUnlocked && nutritionTags.length > 0 ? (
          <View style={styles.tagWrap} testID="chef-result-nutrition-tags">
            {nutritionTags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text {...RESULT_TEXT_PROPS} numberOfLines={1} style={styles.tagText}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {renderGatedSection(
        t('fridge_scan_result.sections.why'),
        'chef-result-section-why',
        <BulletList
          accent={modeTheme.accent}
          items={mealResult.why_this_fits_the_goal}
        />,
        3,
      )}

      {renderGatedSection(
        t('fridge_scan_result.sections.ingredients'),
        'chef-result-section-ingredients',
        <>
          <Text {...RESULT_TEXT_PROPS} style={styles.subLabel}>
            {t('fridge_scan_result.labels.used')}
          </Text>
          <ChipList accent={modeTheme.accent} items={mealResult.ingredients_used} />

          <Text {...RESULT_TEXT_PROPS} style={[styles.subLabel, styles.subLabelSpacing]}>
            {t('fridge_scan_result.labels.detected')}
          </Text>
          <ChipList
            accent={modeTheme.accent}
            compact
            items={mealResult.ingredients_detected}
          />
        </>,
        4,
      )}

      {hasNutritionSection || !isUnlocked ? (
        isUnlocked ? (
          <Section
            layout={layout}
            modeTheme={modeTheme}
            title={t('fridge_scan_result.sections.nutrition')}
            testID="chef-result-section-nutrition"
          >
          {nutritionTags.length > 0 ? (
            <View style={styles.nutritionGrid}>
              {nutritionTags.map((tag) => {
                const [label, ...valueParts] = tag.split(': ');
                const value = valueParts.join(': ');

                return (
                  <View key={tag} style={styles.nutritionCard}>
                    <Text {...RESULT_TEXT_PROPS} style={styles.nutritionLabel}>
                      {label}
                    </Text>
                    <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.nutritionValue}>
                      {value}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          {mealResult.nutrition_estimate.note ? (
            <Text {...RESULT_TEXT_PROPS} style={styles.noteText}>
              {mealResult.nutrition_estimate.note}
            </Text>
          ) : null}
          </Section>
        ) : renderPremiumTeaser(
          t('fridge_scan_result.sections.nutrition'),
          'chef-result-section-nutrition',
          3,
        )
      ) : null}

      {renderGatedSection(
        t('fridge_scan_result.sections.preparation'),
        'chef-result-section-preparation',
        <StepList
          accent={modeTheme.accent}
          steps={mealResult.preparation_steps}
        />,
        4,
      )}

      {hasAdviceSection ? (
        renderGatedSection(
          t('fridge_scan_result.sections.advice'),
          'chef-result-section-advice',
          <BulletList accent={modeTheme.accent} items={mealResult.tips} />,
          3,
        )
      ) : null}

      {hasAdditionsSection ? (
        renderGatedSection(
          t('fridge_scan_result.sections.additions'),
          'chef-result-section-additions',
          <ChipList
            accent={modeTheme.accent}
            items={mealResult.optional_additions}
          />,
          2,
        )
      ) : null}

      {hasSubstitutionSection ? (
        renderGatedSection(
          t('fridge_scan_result.sections.substitutions'),
          'chef-result-section-substitutions',
          <BulletList accent={modeTheme.accent} items={mealResult.substitutions} />,
          3,
        )
      ) : null}

      {mealResult.caution_note ? (
        isUnlocked ? (
          <View style={styles.cautionCard} testID="chef-result-caution">
          <AlertCircle
            color={modeTheme.accent}
            size={18}
            strokeWidth={2.2}
          />
          <View style={styles.cautionCopy}>
            <Text {...RESULT_TEXT_PROPS} style={styles.cautionLabel}>
              {t('fridge_scan_result.labels.caution')}
            </Text>
            <Text {...RESULT_TEXT_PROPS} style={styles.cautionText}>
              {mealResult.caution_note}
            </Text>
          </View>
          </View>
        ) : renderPremiumTeaser(
          t('fridge_scan_result.labels.caution'),
          'chef-result-caution',
          2,
        )
      ) : null}
    </View>
  );
}

const createPillStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    pill: {
      maxWidth: '100%',
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 5,
    },
    pillSubtle: {
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.07)
        : withAlpha(colors.primaryText, 0.08),
      borderColor: isDark
        ? withAlpha(colors.white, 0.1)
        : withAlpha(colors.primaryText, 0.08),
    },
    pillAccent: {
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.1)
        : withAlpha(colors.primaryText, 0.1),
      borderColor: isDark
        ? withAlpha(colors.white, 0.16)
        : withAlpha(colors.primaryText, 0.1),
    },
    pillText: {
      flexShrink: 1,
      minWidth: 0,
      color: isDark ? withAlpha(colors.white, 0.84) : colors.primaryText,
      fontSize: 11,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    pillTextAccent: {
      color: isDark ? colors.white : colors.primaryText,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.35,
    },
  });

const createSectionStyles = (
  colors: ThemeColors,
  layout: ResultLayoutState,
) =>
  StyleSheet.create({
    section: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.blockPadding,
      gap: layout.sectionGap,
    },
    sectionTitle: {
      color: colors.primaryText,
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
  });

const createStyles = (
  colors: ThemeColors,
  isDark: boolean,
  layout: ResultLayoutState,
  modeTheme: ChefModeTheme,
) =>
  StyleSheet.create({
    stack: {
      gap: layout.contentGap,
    },
    hiddenMarker: {
      width: 0,
      height: 0,
      opacity: 0,
    },
    headerCard: {
      borderRadius: layout.heroRadius,
      borderWidth: 1,
      padding: layout.largeBlockPadding,
      overflow: 'hidden',
      gap: layout.sectionGap,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    chefIdentity: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    avatarShell: {
      width: layout.isCompact ? 54 : 58,
      height: layout.isCompact ? 54 : 58,
      borderRadius: layout.isCompact ? 27 : 29,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    avatarHalo: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(modeTheme.accent, 0.22),
      transform: [{ scale: 1.08 }],
    },
    avatarRing: {
      width: layout.isCompact ? 48 : 52,
      height: layout.isCompact ? 48 : 52,
      borderRadius: layout.isCompact ? 24 : 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(modeTheme.deep, 0.78),
      borderWidth: 1,
      borderColor: withAlpha(modeTheme.accent, 0.32),
    },
    chefCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    eyebrow: {
      color: modeTheme.contrast,
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.45,
      includeFontPadding: false,
    },
    modeTitle: {
      color: colors.primaryText,
      fontSize: layout.isCompact ? SIZES.text18 : SIZES.text20,
      lineHeight: layout.isCompact ? 23 : 25,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    statusPills: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    cookCard: {
      borderRadius: layout.featureRadius,
      borderWidth: 1,
      padding: layout.blockPadding,
      gap: layout.sectionGap,
    },
    cardLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    cardLabel: {
      color: modeTheme.contrast,
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.45,
      includeFontPadding: false,
    },
    cookMainRow: {
      flexDirection: layout.isNarrow ? 'column' : 'row',
      gap: layout.sectionGap,
      alignItems: layout.isNarrow ? 'stretch' : 'center',
    },
    mealImage: {
      width: layout.isNarrow ? '100%' : 88,
      height: layout.isNarrow ? 150 : 112,
      borderRadius: layout.standardRadius,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.12 : 0.08),
    },
    cookCopy: {
      flex: 1,
      minWidth: 0,
      gap: SPACING.xs,
    },
    recipeTitle: {
      color: colors.primaryText,
      fontSize: layout.heroTitleFontSize,
      lineHeight: layout.heroTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    summary: {
      color: withAlpha(colors.primaryText, 0.78),
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
    tagWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    tag: {
      maxWidth: '100%',
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 6,
      backgroundColor: modeTheme.soft,
      borderWidth: 1,
      borderColor: withAlpha(modeTheme.accent, 0.22),
    },
    tagText: {
      color: colors.primaryText,
      fontSize: SIZES.text12,
      lineHeight: 15,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    subLabel: {
      color: withAlpha(colors.primaryText, 0.62),
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.35,
      includeFontPadding: false,
    },
    subLabelSpacing: {
      marginTop: SPACING.xs,
    },
    nutritionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    nutritionCard: {
      flexGrow: 1,
      flexBasis: layout.isCompact ? '47%' : '48%',
      minWidth: layout.isNarrow ? 120 : 132,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: layout.standardRadius,
      backgroundColor: withAlpha(modeTheme.accent, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(modeTheme.accent, 0.2),
      gap: 4,
    },
    nutritionLabel: {
      color: withAlpha(colors.primaryText, 0.58),
      fontSize: SIZES.text12,
      lineHeight: 15,
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
    nutritionValue: {
      color: colors.primaryText,
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    noteText: {
      color: withAlpha(colors.primaryText, 0.72),
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      includeFontPadding: false,
    },
    cautionCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      padding: layout.blockPadding,
      borderRadius: layout.featureRadius,
      backgroundColor: withAlpha(modeTheme.accent, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(modeTheme.accent, 0.22),
    },
    cautionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    cautionLabel: {
      color: modeTheme.contrast,
      fontSize: SIZES.text12,
      lineHeight: 15,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.35,
      includeFontPadding: false,
    },
    cautionText: {
      color: withAlpha(colors.primaryText, 0.76),
      fontSize: SIZES.text12,
      lineHeight: 18,
      includeFontPadding: false,
    },
  });

const createListStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  stack: {
    gap: SPACING.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    minWidth: 0,
    color: withAlpha(colors.primaryText, 0.8),
    fontSize: SIZES.text14,
    lineHeight: 21,
    includeFontPadding: false,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepIndexText: {
    color: colors.background,
    fontSize: SIZES.text12,
    lineHeight: 15,
    fontWeight: FONT_WEIGHTS.bold,
    includeFontPadding: false,
  },
  stepText: {
    flex: 1,
    minWidth: 0,
    color: withAlpha(colors.primaryText, 0.82),
    fontSize: SIZES.text14,
    lineHeight: 21,
    includeFontPadding: false,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  chip: {
    maxWidth: '100%',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  chipCompact: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chipText: {
    color: colors.primaryText,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: FONT_WEIGHTS.semiBold,
    includeFontPadding: false,
  },
  chipTextCompact: {
    color: withAlpha(colors.primaryText, 0.72),
    fontSize: SIZES.text12,
    lineHeight: 16,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
