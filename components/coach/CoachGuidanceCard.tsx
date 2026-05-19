import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Minus,
} from 'lucide-react-native';

import { Button } from '@/components/Button';
import {
  CoachStructuredContentSections,
  hasRenderableCoachStructuredContent,
  type CoachStructuredContentLabels,
} from '@/components/coach/CoachStructuredContentSections';
import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getCoachPaperSurface,
  withAlpha,
} from '@/constants/theme';
import type { CoachStructuredContent } from '@/shared/coachContent';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { Squircle } from '@/components/Squircle';

export type CoachGuidanceCardVariant = 'compact' | 'fresh';

export type CoachGuidanceSectionLabels = CoachStructuredContentLabels;

export interface CoachGuidanceMetricBadge {
  label: string;
  directionLabel: string;
  direction: 'up' | 'down' | 'stable';
  interpretation: 'positive' | 'negative' | 'neutral';
}

interface CoachGuidanceCardProps {
  variant: CoachGuidanceCardVariant;
  eyebrow: string;
  statusLabel: string;
  fallbackLabel?: string | null;
  modeLabel?: string | null;
  timestampLabel?: string | null;
  personaKey: CoachPersonaKey;
  personaLabel: string;
  personaValue: string;
  personaTagline?: string | null;
  personaAvatarSource?: CoachPersonaVisual['imageSource'];
  personaAvatarFallbackLabel: string;
  personaAvatarHaloTint: string;
  title: string;
  body: string;
  content?: CoachStructuredContent | null;
  sectionLabels?: CoachGuidanceSectionLabels;
  metricBadge?: CoachGuidanceMetricBadge | null;
  disclaimerLabel: string;
  disclaimerPillLabel: string;
  disclaimer: string;
  expandLabel: string;
  collapseLabel: string;
  continuationHintLabel: string;
  ctaLabel?: string | null;
  onCtaPress?: (() => void) | null;
  defaultExpanded?: boolean;
  testID?: string;
  disclaimerTestID?: string;
}

type GuidancePreviewConfig = {
  previewLines: number;
  previewParagraphs: number;
  previewChars: number;
};

type CoachResponseTheme = {
  accent: string;
  accentAlt: string;
  accentDeep: string;
  contrast: string;
};

const GUIDANCE_PREVIEW_CONFIG: Record<
  CoachGuidanceCardVariant,
  GuidancePreviewConfig
> = {
  compact: {
    previewLines: 3,
    previewParagraphs: 1,
    previewChars: 120,
  },
  fresh: {
    previewLines: 4,
    previewParagraphs: 1,
    previewChars: 220,
  },
};

const COACH_RESPONSE_THEMES: Record<CoachPersonaKey, CoachResponseTheme> = {
  gentle_supportive: {
    accent: '#8AAFD0',
    accentAlt: '#82B5C0',
    accentDeep: '#263E5A',
    contrast: '#D5E5F4',
  },
  strict_tough: {
    accent: '#A8916A',
    accentAlt: '#8A7B61',
    accentDeep: '#2B2C31',
    contrast: '#E8D6A6',
  },
  motivational_energetic: {
    accent: '#C29372',
    accentAlt: '#C9AE7A',
    accentDeep: '#4B3422',
    contrast: '#EAD0A7',
  },
  patient_calm: {
    accent: '#82AFA6',
    accentAlt: '#7EA9C4',
    accentDeep: '#244842',
    contrast: '#D5ECE8',
  },
  analytical_precise: {
    accent: '#9AA8C9',
    accentAlt: '#8090C0',
    accentDeep: '#30395D',
    contrast: '#DEE5F6',
  },
  playful_light: {
    accent: '#C99290',
    accentAlt: '#C29F7C',
    accentDeep: '#52313D',
    contrast: '#F0D8D5',
  },
};

function splitBodyIntoParagraphs(body: string) {
  const normalizedBody = body.trim();
  if (!normalizedBody) {
    return [];
  }

  const blocks = normalizedBody
    .split(/\r?\n\s*\r?\n/g)
    .map((value) => value.trim())
    .filter(Boolean);

  if (blocks.length === 1 && normalizedBody.includes('\n')) {
    return normalizedBody
      .split(/\r?\n/g)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return blocks;
}

function clampParagraphByWord(paragraph: string, maxChars: number) {
  const trimmedParagraph = paragraph.trim();
  if (trimmedParagraph.length <= maxChars) {
    return trimmedParagraph;
  }

  const rawSlice = trimmedParagraph.slice(0, maxChars).trimEnd();
  const lastWhitespaceIndex = rawSlice.lastIndexOf(' ');

  if (lastWhitespaceIndex >= 24) {
    return rawSlice.slice(0, lastWhitespaceIndex).trimEnd();
  }

  return rawSlice;
}

function resolveCollapsedPreview(
  paragraphs: string[],
  variant: CoachGuidanceCardVariant,
) {
  const config = GUIDANCE_PREVIEW_CONFIG[variant];
  const visibleParagraphs = paragraphs.slice(0, config.previewParagraphs);
  const previewParts: string[] = [];
  let consumedChars = 0;
  let hasOverflow = paragraphs.length > visibleParagraphs.length;

  visibleParagraphs.forEach((paragraph) => {
    if (consumedChars >= config.previewChars) {
      hasOverflow = true;
      return;
    }

    const remainingChars = config.previewChars - consumedChars;
    const truncatedParagraph = clampParagraphByWord(paragraph, remainingChars);
    previewParts.push(truncatedParagraph);
    consumedChars += truncatedParagraph.length;

    if (truncatedParagraph.length < paragraph.trim().length) {
      hasOverflow = true;
    }
  });

  const previewText = previewParts.join('\n\n');

  return {
    previewLines: config.previewLines,
    previewText,
    hasOverflow,
  };
}

function resolveMetricColor(
  metricBadge: CoachGuidanceMetricBadge,
  colors: any,
) {
  if (metricBadge.interpretation === 'positive') {
    return colors.success;
  }

  if (metricBadge.interpretation === 'negative') {
    return colors.warning;
  }

  return colors.gray;
}

export function CoachGuidanceCard({
  variant,
  eyebrow,
  statusLabel,
  fallbackLabel,
  modeLabel,
  timestampLabel,
  personaKey,
  personaLabel,
  personaValue,
  personaTagline,
  personaAvatarSource,
  personaAvatarFallbackLabel,
  personaAvatarHaloTint,
  title,
  body,
  content,
  sectionLabels,
  metricBadge,
  disclaimerLabel,
  disclaimerPillLabel,
  disclaimer,
  expandLabel,
  collapseLabel,
  continuationHintLabel,
  ctaLabel,
  onCtaPress,
  defaultExpanded = false,
  testID = 'coach-guidance-card',
  disclaimerTestID = 'coach-guidance-disclaimer',
}: CoachGuidanceCardProps) {
  const { colors, isDark } = useTheme();
  const responseTheme = COACH_RESPONSE_THEMES[personaKey];
  const paper = useMemo(() => getCoachPaperSurface(isDark), [isDark]);
  const styles = useMemo(
    () => createStyles(colors, responseTheme, paper),
    [colors, paper, responseTheme],
  );
  const hasStructuredSections = useMemo(
    () =>
      hasRenderableCoachStructuredContent(content, {
        showSummary: true,
      }),
    [content],
  );
  const paragraphs = useMemo(
    () => (hasStructuredSections ? [] : splitBodyIntoParagraphs(body)),
    [body, hasStructuredSections],
  );
  const preview = useMemo(
    () => resolveCollapsedPreview(paragraphs, variant),
    [paragraphs, variant],
  );
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [body, content, defaultExpanded, variant]);

  const hasExtendedStructuredBlocks =
    !!content &&
    ((content.daily_schedule?.length ?? 0) > 0 ||
      (content.micro_routine?.length ?? 0) > 0 ||
      !!content.meal_template ||
      (content.meal_swaps?.length ?? 0) > 0 ||
      (content.shopping_list?.length ?? 0) > 0 ||
      !!content.quick_recipe ||
      !!content.knowledge_card ||
      (content.habit_tracker?.length ?? 0) > 0 ||
      (content.reminders?.length ?? 0) > 0 ||
      !!content.next_scan_suggestion ||
      (content.signal_watch?.length ?? 0) > 0 ||
      !!content.streak_celebration);
  // `data_gaps` n'est plus rendu côté UI et ne doit donc plus déclencher
  // l'affordance « Voir plus ». Toutes les actions sont regroupées dans la
  // section « À faire maintenant », plus de tuile héro isolée au-dessus.
  const structuredOverflowCount =
    (content?.context_notes.length ?? 0) +
    (content?.priorities.length ?? 0) +
    (content?.action_steps.length ?? 0) +
    (content?.warnings.length ?? 0) +
    (content?.encouragement ? 1 : 0) +
    (hasExtendedStructuredBlocks ? 1 : 0);
  const showStructuredExpansion =
    hasStructuredSections && !!content && structuredOverflowCount > 0;
  const showExpansionControl = hasStructuredSections
    ? showStructuredExpansion
    : preview.hasOverflow;
  const renderFullBody = !showExpansionControl || expanded;
  const toggleLabel = expanded ? collapseLabel : expandLabel;
  const metricColor = metricBadge
    ? resolveMetricColor(metricBadge, colors)
    : paper.inkMuted;

  const renderExpandedStructuredContent = () => {
    if (!content) {
      return null;
    }

    return (
      <View
        style={styles.structuredDetails}
        testID="coach-guidance-expanded-structured-content"
      >
        <CoachStructuredContentSections
          content={content}
          labels={sectionLabels}
          showSummary={false}
          skipFirstActionStep={false}
          actionStepsStyle="numbered"
          accentColor={responseTheme.accent}
        />
      </View>
    );
  };

  const guidanceContent = (
    <>
      <Text
        style={[
          styles.title,
          variant === 'compact' ? styles.titleCompact : null,
        ]}
      >
        {title}
      </Text>

      {hasStructuredSections && content ? (
        <View style={styles.sectionsWrap} testID="coach-guidance-structured-content">
          {content.summary ? (
            <View style={styles.summaryQuoteWrap} testID="coach-guidance-summary-wrap">
              <Squircle style={styles.summaryQuoteRule} />
              <Text
                numberOfLines={expanded ? undefined : 4}
                style={[
                  styles.summaryQuoteText,
                  variant === 'compact' ? styles.summaryQuoteTextCompact : null,
                ]}
                testID="coach-guidance-summary"
              >
                {content.summary}
              </Text>
            </View>
          ) : null}

          {renderFullBody ? renderExpandedStructuredContent() : null}
        </View>
      ) : renderFullBody ? (
        paragraphs.map((paragraph, index) => (
          <Text
            key={`${index}-${paragraph.slice(0, 24)}`}
            style={[
              styles.bodyParagraph,
              variant === 'compact' ? styles.bodyParagraphCompact : null,
            ]}
          >
            {paragraph}
          </Text>
        ))
      ) : (
        <View style={styles.previewWrap}>
          <Text
            numberOfLines={preview.previewLines}
            style={[
              styles.bodyParagraph,
              variant === 'compact' ? styles.bodyParagraphCompact : null,
            ]}
            testID="coach-guidance-preview"
          >
            {preview.previewText}
          </Text>
        </View>
      )}

      {showExpansionControl ? (
        <View style={styles.toggleRow}>
          {!expanded ? (
            <Text
              numberOfLines={1}
              style={styles.continuationHint}
              testID="coach-guidance-continuation-hint"
            >
              {continuationHintLabel}
            </Text>
          ) : (
            <View />
          )}

          <View style={styles.togglePill}>
            <Text style={styles.toggleLabel}>{toggleLabel}</Text>
            {expanded ? (
              <ChevronUp color={paper.inkMuted} size={14} />
            ) : (
              <ChevronDown color={paper.inkMuted} size={14} />
            )}
          </View>
        </View>
      ) : null}
    </>
  );

  return (
    <Squircle
      accessibilityLabel={`${title}. ${disclaimerLabel}. ${disclaimer}`}
      accessibilityHint={`${personaLabel}: ${personaValue}`}
      style={[
        styles.card,
        variant === 'compact' ? styles.cardCompact : styles.cardFresh,
      ]}
      testID={testID}
    >
      <View style={styles.variantMarker} testID={`${testID}-variant-${variant}`} />
      <View
        style={styles.variantMarker}
        testID={`${testID}-persona-theme-${personaKey}`}
      />

      {/* HEADER */}
      {variant === 'fresh' ? (
        <View style={styles.heroHeader} testID="coach-guidance-hero">
          <Text numberOfLines={1} style={styles.heroEyebrow}>
            {eyebrow}
          </Text>
          <CoachPersonaAvatar
            imageSource={personaAvatarSource}
            fallbackLabel={personaAvatarFallbackLabel}
            haloTint={responseTheme.accent}
            size={56}
            emphasis="featured"
            testID="coach-guidance-avatar"
          />
          <View style={styles.heroIdentity}>
            <Text numberOfLines={1} style={styles.heroPersonaName}>
              {personaValue}
            </Text>
            {personaTagline ? (
              <Text
                numberOfLines={1}
                style={styles.heroTagline}
                testID="coach-guidance-tagline"
              >
                {personaTagline}
              </Text>
            ) : null}
          </View>
          {timestampLabel ? (
            <View style={styles.heroMeta}>
              <Text
                numberOfLines={1}
                style={styles.timestamp}
                testID="coach-guidance-timestamp"
              >
                {timestampLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.header}>
          <View
            accessibilityLabel={`${personaLabel}: ${personaValue}`}
            style={styles.personaSummary}
          >
            <CoachPersonaAvatar
              imageSource={personaAvatarSource}
              fallbackLabel={personaAvatarFallbackLabel}
              haloTint={responseTheme.accent}
              size={40}
              emphasis="featured"
              testID="coach-guidance-avatar"
            />
            <View style={styles.personaCopy}>
              <Text numberOfLines={1} style={styles.eyebrow}>
                {eyebrow}
              </Text>
              <Text numberOfLines={1} style={styles.personaValue}>
                {personaValue}
              </Text>
              {personaTagline ? (
                <Text
                  numberOfLines={1}
                  style={styles.compactTagline}
                  testID="coach-guidance-tagline"
                >
                  {personaTagline}
                </Text>
              ) : null}
            </View>
          </View>

          {timestampLabel ? (
            <View style={styles.headerAside}>
              <Text
                numberOfLines={1}
                style={[styles.timestamp, styles.timestampCompact]}
                testID="coach-guidance-timestamp"
              >
                {timestampLabel}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* STATUS PILLS */}
      <View
        style={[
          styles.statusPills,
          variant === 'fresh' ? styles.statusPillsFresh : null,
        ]}
      >
        <View style={styles.primaryPill}>
          <Text style={styles.primaryPillText} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
        {fallbackLabel ? (
          <View style={styles.secondaryPill}>
            <Text style={styles.secondaryPillText} numberOfLines={1}>
              {fallbackLabel}
            </Text>
          </View>
        ) : null}
        {modeLabel ? (
          <View style={styles.modePill} testID="coach-guidance-mode-pill">
            <Text style={styles.modePillText} numberOfLines={1}>
              {modeLabel}
            </Text>
          </View>
        ) : null}
        {metricBadge ? (
          <View
            accessibilityLabel={`${metricBadge.label} ${metricBadge.directionLabel}`}
            style={[
              styles.metricPill,
              { backgroundColor: withAlpha(metricColor, 0.07) },
            ]}
            testID="coach-guidance-metric-badge"
          >
            {metricBadge.direction === 'up' ? (
              <ArrowUpRight color={metricColor} size={12} strokeWidth={2.2} />
            ) : metricBadge.direction === 'down' ? (
              <ArrowDownRight color={metricColor} size={12} strokeWidth={2.2} />
            ) : (
              <Minus color={metricColor} size={12} strokeWidth={2.2} />
            )}
            <Text
              numberOfLines={1}
              style={[styles.metricPillText, { color: metricColor }]}
            >
              {metricBadge.label}
            </Text>
          </View>
        ) : null}
      </View>

      {/* BODY */}
      {showExpansionControl ? (
        <TouchableOpacity
          accessibilityHint={!expanded ? continuationHintLabel : collapseLabel}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          activeOpacity={0.78}
          onPress={() => setExpanded((previous) => !previous)}
          style={styles.expandableArea}
          testID="coach-guidance-toggle"
        >
          {guidanceContent}
        </TouchableOpacity>
      ) : (
        <View style={styles.expandableArea}>{guidanceContent}</View>
      )}

      {ctaLabel && onCtaPress ? (
        <View style={styles.ctaWrap}>
          <Button title={ctaLabel} onPress={onCtaPress} />
        </View>
      ) : null}
    </Squircle>
  );
}

const createStyles = (
  colors: any,
  responseTheme: CoachResponseTheme,
  paper: ReturnType<typeof getCoachPaperSurface>,
) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      borderRadius: 24,
      backgroundColor: paper.canvas,
      borderWidth: 1,
      borderColor: withAlpha(responseTheme.accent, 0.08),
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6, borderCurve: 'continuous',
    },
    cardCompact: {
      gap: SPACING.md + 2,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md + 2,
    },
    cardFresh: {
      gap: SPACING.lg,
      paddingHorizontal: SPACING.xl - 2,
      paddingTop: SPACING.lg + 2,
      paddingBottom: SPACING.lg,
    },
    variantMarker: {
      width: 0,
      height: 0,
      opacity: 0,
    },

    /* ===== HERO (fresh) ===== */
    heroHeader: {
      alignItems: 'center',
      gap: SPACING.sm + 2,
    },
    heroEyebrow: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(responseTheme.accent, 0.85),
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    heroIdentity: {
      alignItems: 'center',
      gap: 3,
    },
    heroPersonaName: {
      fontSize: SIZES.text18,
      lineHeight: 22,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: paper.ink,
      letterSpacing: -0.1,
    },
    heroTagline: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontStyle: 'italic',
      color: paper.inkMuted,
      textAlign: 'center',
      maxWidth: 280,
    },
    heroMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },

    /* ===== HEADER (compact) ===== */
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    personaSummary: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm + 2,
    },
    personaCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    eyebrow: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(responseTheme.accent, 0.85),
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    personaValue: {
      fontSize: SIZES.text16,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: paper.ink,
    },
    compactTagline: {
      fontSize: SIZES.text12,
      lineHeight: 14,
      fontStyle: 'italic',
      color: paper.inkMuted,
    },
    headerAside: {
      alignItems: 'flex-end',
      gap: 6,
      maxWidth: '42%',
      flexShrink: 0,
    },

    /* ===== TIMESTAMP ===== */
    timestamp: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: paper.inkMuted,
    },
    timestampCompact: {
      fontSize: 11,
      lineHeight: 14,
    },

    /* ===== STATUS PILLS ===== */
    statusPills: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    statusPillsFresh: {
      justifyContent: 'center',
    },
    primaryPill: {
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(responseTheme.accent, 0.07), borderCurve: 'continuous',
    },
    primaryPillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(responseTheme.accent, 0.92),
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    secondaryPill: {
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.warning, 0.06), borderCurve: 'continuous',
    },
    secondaryPillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.warning,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    modePill: {
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: paper.raised,
      maxWidth: 170, borderCurve: 'continuous',
    },
    modePillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.medium,
      color: paper.inkMuted,
      letterSpacing: 0.4,
    },
    metricPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      maxWidth: 180, borderCurve: 'continuous',
    },
    metricPillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.4,
    },

    /* ===== BODY ===== */
    expandableArea: {
      gap: SPACING.md + 2,
    },
    title: {
      fontSize: SIZES.text24,
      lineHeight: 30,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: -0.3,
      color: paper.ink,
      textAlign: 'center',
    },
    titleCompact: {
      fontSize: SIZES.text18,
      lineHeight: 24,
      letterSpacing: -0.1,
      textAlign: 'left',
    },
    sectionsWrap: {
      gap: SPACING.md + 2,
    },
    summaryQuoteWrap: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: SPACING.md,
    },
    summaryQuoteRule: {
      width: 2,
      backgroundColor: withAlpha(responseTheme.accent, 0.55),
      borderRadius: 1, borderCurve: 'continuous',
    },
    summaryQuoteText: {
      flex: 1,
      fontSize: SIZES.text16,
      lineHeight: 26,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.86),
    },
    summaryQuoteTextCompact: {
      fontSize: SIZES.text15,
      lineHeight: 22,
    },
    bodyParagraph: {
      fontSize: SIZES.text15,
      lineHeight: 26,
      color: paper.ink,
    },
    bodyParagraphCompact: {
      fontSize: SIZES.text14,
      lineHeight: 22,
    },
    previewWrap: {
      paddingBottom: SPACING.sm,
    },
    structuredDetails: {
      gap: SPACING.md + 2,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: paper.hairline,
    },

    /* ===== TOGGLE ===== */
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    continuationHint: {
      flex: 1,
      minWidth: 0,
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: paper.inkSubtle,
    },
    togglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: paper.raised, borderCurve: 'continuous',
    },
    toggleLabel: {
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: paper.ink,
      letterSpacing: 0.2,
    },

    /* ===== CTA ===== */
    ctaWrap: {
      paddingTop: SPACING.xs,
    },
  });
