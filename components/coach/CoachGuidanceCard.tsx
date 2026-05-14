import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  ShieldCheck,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Button } from '@/components/Button';
import {
  CoachStructuredContentSections,
  getCoachStructuredTeaser,
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
  getVisualMoodGradient,
  getVisualMoodSurface,
  getWellnessPremiumSurface,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import type { CoachStructuredContent } from '@/shared/coachContent';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';

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
    previewLines: 2,
    previewParagraphs: 1,
    previewChars: 92,
  },
  fresh: {
    previewLines: 3,
    previewParagraphs: 1,
    previewChars: 164,
  },
};

const COACH_RESPONSE_THEMES: Record<CoachPersonaKey, CoachResponseTheme> = {
  gentle_supportive: {
    accent: '#7FA9D4',
    accentAlt: '#78B9C7',
    accentDeep: '#263E5A',
    contrast: '#D5E5F4',
  },
  strict_tough: {
    accent: '#B99B5E',
    accentAlt: '#8A7B61',
    accentDeep: '#2B2C31',
    contrast: '#E8D6A6',
  },
  motivational_energetic: {
    accent: '#C68D5A',
    accentAlt: '#D0B06B',
    accentDeep: '#4B3422',
    contrast: '#EAD0A7',
  },
  patient_calm: {
    accent: '#72AFA8',
    accentAlt: '#7EA9C4',
    accentDeep: '#244842',
    contrast: '#D5ECE8',
  },
  analytical_precise: {
    accent: '#8D9EC8',
    accentAlt: '#738BC2',
    accentDeep: '#30395D',
    contrast: '#DEE5F6',
  },
  playful_light: {
    accent: '#D98B86',
    accentAlt: '#CBA16A',
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
  const cardSurface = useMemo(
    () =>
      getWellnessPremiumSurface(colors, isDark, {
        accentColor: responseTheme.accent,
        kind: variant === 'fresh' ? 'hero' : 'feature',
      }),
    [colors, isDark, responseTheme.accent, variant],
  );
  const insetSurface = useMemo(
    () =>
      getVisualMoodSurface(colors, isDark, {
        mood: 'obsidian',
        accentColor: responseTheme.accentAlt,
        intensity: 'subtle',
        shadow: false,
      }),
    [colors, isDark, responseTheme.accentAlt],
  );
  const styles = useMemo(
    () => createStyles(colors, responseTheme, cardSurface, insetSurface),
    [cardSurface, colors, insetSurface, responseTheme],
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

  const resolvedSectionLabels = useMemo(
    () => ({
      context_notes: sectionLabels?.context_notes ?? 'Ce que je remarque',
      priorities: sectionLabels?.priorities ?? 'À surveiller',
      action_steps: sectionLabels?.action_steps ?? 'À faire maintenant',
      warnings: sectionLabels?.warnings ?? 'Vigilance',
      data_gaps: sectionLabels?.data_gaps ?? 'Zones sans assez de données',
    }),
    [sectionLabels],
  );
  const primaryAction = content?.action_steps[0] ?? null;
  const fallbackStructuredLead =
    content?.priorities[0] ??
    content?.context_notes[0] ??
    content?.warnings[0] ??
    content?.data_gaps[0] ??
    content?.encouragement ??
    null;
  const collapsedLead = primaryAction ?? fallbackStructuredLead;
  const collapsedWarning = content?.warnings[0] ?? null;
  const collapsedDataGaps = content?.data_gaps.slice(0, 2) ?? [];
  const structuredTeaser = useMemo(
    () => getCoachStructuredTeaser(content, sectionLabels),
    [content, sectionLabels],
  );
  const expandedActionSteps = primaryAction
    ? (content?.action_steps.slice(1) ?? [])
    : (content?.action_steps ?? []);
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
  const structuredOverflowCount =
    (content?.context_notes.length ?? 0) +
    (content?.priorities.length ?? 0) +
    expandedActionSteps.length +
    Math.max((content?.warnings.length ?? 0) - (collapsedWarning ? 1 : 0), 0) +
    Math.max(
      (content?.data_gaps.length ?? 0) - collapsedDataGaps.length,
      0,
    ) +
    (content?.encouragement ? 1 : 0) +
    (hasExtendedStructuredBlocks ? 1 : 0);
  const showStructuredExpansion =
    hasStructuredSections && !!content && structuredOverflowCount > 0;
  const showExpansionControl = hasStructuredSections
    ? showStructuredExpansion
    : preview.hasOverflow;
  const renderFullBody = !showExpansionControl || expanded;
  const toggleLabel = expanded ? collapseLabel : expandLabel;
  const gradientColors: readonly [string, string, string] = getVisualMoodGradient(
    colors,
    isDark,
    variant === 'fresh' ? 'premium' : 'obsidian',
    responseTheme.accent,
  );
  const metricColor = metricBadge
    ? resolveMetricColor(metricBadge, colors)
    : colors.gray;

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
          skipFirstActionStep={!!primaryAction}
        />
      </View>
    );
  };

  const guidanceContent = (
    <>
      <View
        style={[
          styles.titleWrap,
          variant === 'compact' ? styles.titleWrapCompact : null,
        ]}
      >
        <Text
          style={[
            styles.title,
            variant === 'compact' ? styles.titleCompact : null,
          ]}
        >
          {title}
        </Text>
      </View>

      <View
        style={[
          styles.bodyWrap,
          variant === 'compact' ? styles.bodyWrapCompact : null,
        ]}
      >
        {hasStructuredSections && content ? (
          <View
            style={styles.sectionsWrap}
            testID="coach-guidance-structured-content"
          >
            {collapsedLead ? (
              <View style={styles.primaryAction} testID="coach-guidance-primary-action">
                <View style={styles.primaryActionIcon}>
                  <CheckCircle2
                    color={responseTheme.contrast}
                    size={16}
                    strokeWidth={2.5}
                  />
                </View>
                <View style={styles.primaryActionCopy}>
                  <Text style={styles.primaryActionLabel}>
                    {primaryAction
                      ? resolvedSectionLabels.action_steps
                      : resolvedSectionLabels.priorities}
                  </Text>
                  <Text style={styles.primaryActionText}>{collapsedLead}</Text>
                </View>
              </View>
            ) : null}

            {content.summary ? (
              <Text
                numberOfLines={expanded ? undefined : 3}
                style={[
                  styles.bodyParagraph,
                  variant === 'compact' ? styles.bodyParagraphCompact : null,
                  styles.structuredSummary,
                ]}
                testID="coach-guidance-summary"
              >
                {content.summary}
              </Text>
            ) : null}

            {!expanded &&
            (collapsedWarning || collapsedDataGaps.length > 0 || structuredTeaser) ? (
              <View style={styles.compactSignals} testID="coach-guidance-compact-signals">
                {structuredTeaser ? (
                  <View
                    style={styles.structuredTeaserPill}
                    testID="coach-guidance-structured-teaser"
                  >
                    <Text numberOfLines={1} style={styles.structuredTeaserText}>
                      {structuredTeaser}
                    </Text>
                  </View>
                ) : null}
                {collapsedWarning ? (
                  <View style={styles.signalLine} testID="coach-guidance-warning-signal">
                    <AlertTriangle
                      color={colors.warning}
                      size={13}
                      strokeWidth={2.3}
                    />
                    <Text numberOfLines={1} style={styles.signalText}>
                      {collapsedWarning}
                    </Text>
                  </View>
                ) : null}
                {collapsedDataGaps.map((gap, index) => (
                  <View
                    key={`compact-gap-${index}`}
                    style={styles.dataGapPill}
                    testID={`coach-guidance-data-gap-signal-${index}`}
                  >
                    <Text numberOfLines={1} style={styles.dataGapPillText}>
                      {gap}
                    </Text>
                  </View>
                ))}
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
          <View
            style={[
              styles.previewWrap,
              variant === 'compact' ? styles.previewWrapCompact : null,
            ]}
          >
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
            <LinearGradient
              colors={[
                withAlpha(colors.cardBackground, 0),
                withAlpha(colors.cardBackground, 0.96),
              ]}
              pointerEvents="none"
              style={[
                styles.previewFade,
                variant === 'compact' ? styles.previewFadeCompact : null,
              ]}
              testID="coach-guidance-preview-fade"
            />
          </View>
        )}
      </View>

      {showExpansionControl ? (
        <View
          style={[
            styles.toggleRow,
            variant === 'compact' ? styles.toggleRowCompact : null,
          ]}
        >
          {!expanded ? (
            <Text
              numberOfLines={1}
              style={[
                styles.continuationHint,
                variant === 'compact' ? styles.continuationHintCompact : null,
              ]}
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
              <ChevronUp color={responseTheme.accent} size={16} />
            ) : (
              <ChevronDown color={responseTheme.accent} size={16} />
            )}
          </View>
        </View>
      ) : null}
    </>
  );

  return (
    <View
      style={[
        styles.card,
        variant === 'compact' ? styles.cardCompact : styles.cardFresh,
      ]}
      testID={testID}
    >
      <View
        style={styles.variantMarker}
        testID={`${testID}-variant-${variant}`}
      />
      <View
        style={styles.variantMarker}
        testID={`${testID}-persona-theme-${personaKey}`}
      />

      <LinearGradient
        colors={gradientColors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.gradientBackdrop}
      />
      <View
        pointerEvents="none"
        style={[
          styles.topHighlight,
          { backgroundColor: cardSurface.highlightColor },
        ]}
      />

      <View
        style={[
          styles.header,
          variant === 'compact' ? styles.headerCompact : null,
        ]}
      >
        <View
          accessibilityLabel={`${personaLabel}: ${personaValue}`}
          style={[
            styles.personaSummary,
            variant === 'compact' ? styles.personaSummaryCompact : null,
          ]}
        >
          <CoachPersonaAvatar
            imageSource={personaAvatarSource}
            fallbackLabel={personaAvatarFallbackLabel}
            haloTint={responseTheme.accent}
            size={variant === 'compact' ? 42 : 48}
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
          </View>
        </View>

        <View style={styles.headerAside}>
          <View
            accessibilityLabel={`${disclaimerLabel}. ${disclaimer}`}
            style={styles.disclaimerPill}
            testID={`${disclaimerTestID}-pill`}
          >
            <ShieldCheck
              color={responseTheme.contrast}
              size={13}
              strokeWidth={2.4}
            />
            <Text
              accessibilityLabel={`${disclaimerLabel}. ${disclaimer}`}
              numberOfLines={1}
              style={styles.disclaimerPillText}
              testID={disclaimerTestID}
            >
              {disclaimerPillLabel}
            </Text>
          </View>
          {timestampLabel ? (
            <Text
              numberOfLines={1}
              style={[
                styles.timestamp,
                variant === 'compact' ? styles.timestampCompact : null,
              ]}
              testID="coach-guidance-timestamp"
            >
              {timestampLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.statusPills,
          variant === 'compact' ? styles.statusPillsCompact : null,
        ]}
      >
        <View style={styles.primaryPill}>
          <Text style={styles.primaryPillText}>{statusLabel}</Text>
        </View>
        {fallbackLabel ? (
          <View style={styles.secondaryPill}>
            <Text style={styles.secondaryPillText}>{fallbackLabel}</Text>
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
              {
                backgroundColor: withAlpha(metricColor, 0.065),
                borderColor: withAlpha(metricColor, 0.16),
              },
            ]}
            testID="coach-guidance-metric-badge"
          >
            {metricBadge.direction === 'up' ? (
              <ArrowUpRight color={metricColor} size={12} strokeWidth={2.4} />
            ) : metricBadge.direction === 'down' ? (
              <ArrowDownRight color={metricColor} size={12} strokeWidth={2.4} />
            ) : (
              <Minus color={metricColor} size={12} strokeWidth={2.4} />
            )}
            <Text style={styles.metricPillText} numberOfLines={1}>
              {metricBadge.label}
            </Text>
          </View>
        ) : null}
      </View>

      {showExpansionControl ? (
        <TouchableOpacity
          accessibilityHint={!expanded ? continuationHintLabel : collapseLabel}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          activeOpacity={0.78}
          onPress={() => setExpanded((previous) => !previous)}
          style={[
            styles.expandableArea,
            variant === 'compact' ? styles.expandableAreaCompact : null,
          ]}
          testID="coach-guidance-toggle"
        >
          {guidanceContent}
        </TouchableOpacity>
      ) : (
        <View
          style={[
            styles.expandableArea,
            variant === 'compact' ? styles.expandableAreaCompact : null,
          ]}
        >
          {guidanceContent}
        </View>
      )}

      {ctaLabel && onCtaPress ? (
        <View
          style={[
            styles.footer,
            variant === 'compact' ? styles.footerCompact : null,
          ]}
        >
          <Button title={ctaLabel} onPress={onCtaPress} />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (
  colors: any,
  responseTheme: CoachResponseTheme,
  cardSurface: {
    backgroundColor: string;
    borderColor: string;
    highlightColor: string;
    shadowStyle: Record<string, unknown>;
  },
  insetSurface: {
    backgroundColor: string;
    borderColor: string;
  },
) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      borderRadius: BORDER_RADIUS.xl + 8,
      backgroundColor: cardSurface.backgroundColor,
      borderWidth: 1,
      borderColor: cardSurface.borderColor,
      overflow: 'hidden',
      ...cardSurface.shadowStyle,
    },
    cardCompact: {
      gap: SPACING.sm + 2,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm + 2,
    },
    cardFresh: {
      gap: SPACING.md,
      padding: SPACING.md + 2,
    },
    variantMarker: {
      width: 0,
      height: 0,
      opacity: 0,
    },
    gradientBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 188,
    },
    topHighlight: {
      position: 'absolute',
      top: 0,
      left: 22,
      right: 22,
      height: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    headerCompact: {
      gap: SPACING.xs + 2,
      paddingBottom: 2,
    },
    personaSummary: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    personaSummaryCompact: {
      gap: SPACING.xs + 2,
    },
    personaCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: responseTheme.contrast,
      textTransform: 'uppercase',
      letterSpacing: 0.45,
    },
    personaValue: {
      fontSize: SIZES.text16,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    headerAside: {
      alignItems: 'flex-end',
      gap: 5,
      maxWidth: '42%',
      flexShrink: 0,
    },
    disclaimerPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '100%',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(responseTheme.accentDeep, 0.54),
      borderWidth: 1,
      borderColor: withAlpha(responseTheme.accent, 0.18),
    },
    disclaimerPillText: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: FONT_WEIGHTS.bold,
      color: responseTheme.contrast,
      textTransform: 'uppercase',
      letterSpacing: 0.35,
    },
    timestamp: {
      maxWidth: '100%',
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.62),
    },
    timestampCompact: {
      fontSize: 11,
      lineHeight: 14,
    },
    statusPills: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      flexWrap: 'wrap',
    },
    statusPillsCompact: {
      gap: 6,
    },
    primaryPill: {
      paddingHorizontal: SPACING.sm + 1,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(responseTheme.accent, 0.085),
      borderWidth: 1,
      borderColor: withAlpha(responseTheme.accent, 0.14),
    },
    primaryPillText: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.bold,
      color: responseTheme.contrast,
      textTransform: 'uppercase',
      letterSpacing: 0.35,
    },
    secondaryPill: {
      paddingHorizontal: SPACING.sm + 1,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.warning, 0.065),
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.14),
    },
    secondaryPillText: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.warning,
    },
    modePill: {
      paddingHorizontal: SPACING.sm + 1,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: insetSurface.backgroundColor,
      borderWidth: 1,
      borderColor: insetSurface.borderColor,
      maxWidth: 170,
    },
    modePillText: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.84),
    },
    metricPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      maxWidth: 180,
    },
    metricPillText: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    titleWrap: {
      gap: SPACING.xs,
    },
    titleWrapCompact: {
      gap: 2,
    },
    title: {
      fontSize: SIZES.text20,
      lineHeight: 26,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    titleCompact: {
      fontSize: SIZES.text16,
      lineHeight: 22,
    },
    expandableArea: {
      gap: SPACING.sm + 2,
    },
    expandableAreaCompact: {
      gap: SPACING.xs + 2,
    },
    bodyWrap: {
      gap: SPACING.sm,
    },
    bodyWrapCompact: {
      gap: SPACING.xs + 2,
    },
    sectionsWrap: {
      gap: SPACING.sm,
    },
    primaryAction: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      padding: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: insetSurface.backgroundColor,
      borderWidth: 1,
      borderColor: insetSurface.borderColor,
    },
    primaryActionIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(responseTheme.accentDeep, 0.48),
      flexShrink: 0,
    },
    primaryActionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    primaryActionLabel: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.bold,
      color: responseTheme.contrast,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    primaryActionText: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    structuredSummary: {
      color: withAlpha(colors.primaryText, 0.86),
    },
    compactSignals: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      flexWrap: 'wrap',
    },
    signalLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minWidth: 0,
      maxWidth: '100%',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.warning, 0.055),
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.12),
    },
    signalText: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(colors.primaryText, 0.78),
    },
    dataGapPill: {
      maxWidth: '100%',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: insetSurface.backgroundColor,
      borderWidth: 1,
      borderColor: insetSurface.borderColor,
    },
    dataGapPillText: {
      fontSize: 11,
      lineHeight: 14,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.96),
    },
    structuredTeaserPill: {
      maxWidth: '100%',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(responseTheme.accent, 0.065),
      borderWidth: 1,
      borderColor: withAlpha(responseTheme.accent, 0.14),
    },
    structuredTeaserText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: responseTheme.contrast,
    },
    structuredDetails: {
      gap: SPACING.sm,
      paddingTop: SPACING.xs,
    },
    section: {
      gap: SPACING.xs,
      paddingVertical: SPACING.xs,
    },
    sectionLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.64),
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    sectionItem: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
    },
    sectionItemAction: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    warningSection: {
      backgroundColor: withAlpha(colors.warning, 0.05),
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm + 2,
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.12),
    },
    warningLabel: {
      color: colors.warning,
    },
    warningItem: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
    },
    encouragement: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      fontStyle: 'italic',
      color: withAlpha(colors.primaryText, 0.86),
      paddingTop: SPACING.xs,
    },
    dataGaps: {
      gap: 3,
      paddingTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06),
    },
    dataGapLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.92),
      textTransform: 'uppercase',
      letterSpacing: 0.35,
    },
    dataGapItem: {
      fontSize: 11,
      lineHeight: 15,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.94),
    },
    previewWrap: {
      position: 'relative',
      paddingBottom: SPACING.sm + 2,
    },
    previewWrapCompact: {
      paddingBottom: SPACING.xs + 2,
    },
    previewFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 34,
    },
    previewFadeCompact: {
      height: 24,
    },
    bodyParagraph: {
      fontSize: SIZES.text14,
      lineHeight: 21,
      color: colors.primaryText,
    },
    bodyParagraphCompact: {
      lineHeight: 19,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    toggleRowCompact: {
      gap: SPACING.xs + 2,
    },
    continuationHint: {
      flex: 1,
      minWidth: 0,
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.88),
    },
    continuationHintCompact: {
      fontSize: 11,
      lineHeight: 15,
    },
    togglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: insetSurface.backgroundColor,
      borderWidth: 1,
      borderColor: insetSurface.borderColor,
    },
    toggleLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: responseTheme.contrast,
    },
    footer: {
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: withAlpha(responseTheme.accent, 0.09),
    },
    footerCompact: {
      paddingTop: SPACING.xs,
    },
  });
