import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

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
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachStructuredContent } from '@/shared/coachContent';
import { Squircle } from '@/components/Squircle';

export type CoachHistorySectionLabels = CoachStructuredContentLabels;

interface CoachHistoryCardProps {
  title: string;
  body: string;
  dateLabel?: string | null;
  personaLabel: string;
  personaValue: string;
  personaAvatarSource?: CoachPersonaVisual['imageSource'];
  personaAvatarFallbackLabel: string;
  personaAvatarHaloTint: string;
  modeLabel?: string | null;
  recentLabel?: string | null;
  content?: CoachStructuredContent | null;
  sectionLabels?: CoachHistorySectionLabels;
  disclaimerLabel: string;
  disclaimer?: string | null;
  ctaLabel?: string | null;
  onCtaPress?: (() => void) | null;
  expanded: boolean;
  onToggle: () => void;
  testID?: string;
}

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

export function CoachHistoryCard({
  title,
  body,
  dateLabel,
  personaLabel,
  personaValue,
  personaAvatarSource,
  personaAvatarFallbackLabel,
  personaAvatarHaloTint,
  modeLabel,
  recentLabel,
  content,
  sectionLabels,
  disclaimerLabel,
  disclaimer,
  ctaLabel,
  onCtaPress,
  expanded,
  onToggle,
  testID = 'coach-history-card',
}: CoachHistoryCardProps) {
  const { colors, isDark } = useTheme();
  const accentColor = personaAvatarHaloTint || (colors.primary as string);
  const paper = useMemo(() => getCoachPaperSurface(isDark), [isDark]);
  const styles = useMemo(
    () => createStyles(colors, accentColor, paper),
    [colors, accentColor, paper],
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
  const previewText = useMemo(() => {
    if (hasStructuredSections && content?.summary) {
      return content.summary;
    }
    return body;
  }, [body, content?.summary, hasStructuredSections]);
  const showFooter = !!disclaimer || (!!ctaLabel && !!onCtaPress);

  return (
    <Squircle style={styles.card} testID={testID}>
      <View style={styles.accentBar} />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.toggle}
        testID={`${testID}-toggle`}
      >
        <View style={styles.metaRow}>
          <View style={styles.personaSummary}>
            <CoachPersonaAvatar
              imageSource={personaAvatarSource}
              fallbackLabel={personaAvatarFallbackLabel}
              haloTint={personaAvatarHaloTint}
              size={34}
              emphasis="subtle"
              testID={`${testID}-avatar`}
            />
            <View style={styles.metaCopy}>
              <Text
                accessibilityLabel={`${personaLabel}: ${personaValue}`}
                numberOfLines={1}
                style={styles.personaValue}
              >
                {personaValue}
              </Text>
              {dateLabel ? (
                <Text
                  numberOfLines={1}
                  style={styles.dateLabel}
                  testID={`${testID}-date`}
                >
                  {dateLabel}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.trailingMeta}>
            {recentLabel ? (
              <View style={styles.recentPill} testID={`${testID}-recent-badge`}>
                <Text numberOfLines={1} style={styles.recentPillText}>
                  {recentLabel}
                </Text>
              </View>
            ) : null}
            <Squircle style={styles.chevronWrap}>
              {expanded ? (
                <ChevronUp color={paper.inkMuted} size={16} />
              ) : (
                <ChevronDown color={paper.inkMuted} size={16} />
              )}
            </Squircle>
          </View>
        </View>

        <View style={styles.summary}>
          {modeLabel ? (
            <View style={styles.modePill} testID={`${testID}-mode-pill`}>
              <Text numberOfLines={1} style={styles.modePillText}>
                {modeLabel}
              </Text>
            </View>
          ) : null}
          <Text numberOfLines={2} style={styles.title}>
            {title}
          </Text>
          {!expanded ? (
            <Text
              numberOfLines={3}
              style={styles.preview}
              testID={`${testID}-preview`}
            >
              {previewText}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.expandedContent} testID={`${testID}-expanded`}>
          {hasStructuredSections && content ? (
            <View
              style={styles.sectionsWrap}
              testID={`${testID}-structured-content`}
            >
              {content.summary ? (
                <View style={styles.summaryQuoteWrap}>
                  <Squircle style={styles.summaryQuoteRule} />
                  <Text style={styles.summaryQuoteText}>{content.summary}</Text>
                </View>
              ) : null}
              <CoachStructuredContentSections
                content={content}
                labels={sectionLabels}
                accentColor={accentColor}
                showSummary={false}
              />
            </View>
          ) : (
            <View style={styles.bodyWrap}>
              {paragraphs.map((paragraph, index) => (
                <Text
                  key={`${index}-${paragraph.slice(0, 24)}`}
                  style={styles.bodyParagraph}
                >
                  {paragraph}
                </Text>
              ))}
            </View>
          )}

          {showFooter ? (
            <View style={styles.footer}>
              {disclaimer ? (
                <Text
                  accessibilityLabel={disclaimerLabel}
                  style={styles.disclaimerText}
                  testID={`${testID}-disclaimer`}
                >
                  {disclaimer}
                </Text>
              ) : null}

              {ctaLabel && onCtaPress ? (
                <Button title={ctaLabel} onPress={onCtaPress} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Squircle>
  );
}

const createStyles = (
  colors: any,
  accentColor: string,
  paper: ReturnType<typeof getCoachPaperSurface>,
) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      borderRadius: 18,
      backgroundColor: paper.canvas,
      borderWidth: 1,
      borderColor: paper.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2, borderCurve: 'continuous',
    },
    accentBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: withAlpha(accentColor, 0.4),
    },
    toggle: {
      paddingHorizontal: SPACING.lg + 2,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md + 2,
      gap: SPACING.md + 2,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
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
    metaCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    personaValue: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(accentColor, 0.85),
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    dateLabel: {
      fontSize: 12,
      lineHeight: 16,
      color: paper.inkMuted,
    },
    trailingMeta: {
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
    },
    recentPill: {
      maxWidth: 96,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(accentColor, 0.08),
      borderWidth: 0, borderCurve: 'continuous',
    },
    recentPillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(accentColor, 0.95),
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    chevronWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: paper.raised, borderCurve: 'continuous',
    },
    summary: {
      gap: SPACING.sm + 2,
    },
    modePill: {
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: paper.raised,
      borderWidth: 0,
      maxWidth: '80%', borderCurve: 'continuous',
    },
    modePillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.medium,
      color: paper.inkMuted,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    sectionsWrap: {
      gap: SPACING.lg,
    },
    summaryQuoteWrap: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: SPACING.md,
    },
    summaryQuoteRule: {
      width: 2,
      backgroundColor: withAlpha(accentColor, 0.55),
      borderRadius: 1, borderCurve: 'continuous',
    },
    summaryQuoteText: {
      flex: 1,
      fontSize: SIZES.text16,
      lineHeight: 26,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.86),
    },
    structuredSummary: {
      fontSize: SIZES.text15,
      lineHeight: 24,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.84),
    },
    section: {
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    sectionLabel: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(accentColor, 0.85),
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    sectionItem: {
      fontSize: SIZES.text15,
      lineHeight: 24,
      color: paper.ink,
    },
    sectionItemAction: {
      fontSize: SIZES.text15,
      lineHeight: 24,
      color: paper.ink,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    warningSection: {
      backgroundColor: withAlpha(colors.warning, 0.05),
      borderLeftWidth: 2,
      borderLeftColor: withAlpha(colors.warning, 0.45),
      paddingLeft: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      paddingRight: SPACING.md,
    },
    warningLabel: {
      color: withAlpha(colors.warning, 0.9),
    },
    encouragement: {
      fontSize: SIZES.text15,
      lineHeight: 24,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.86),
      paddingLeft: 14,
      borderLeftWidth: 2,
      borderLeftColor: withAlpha(accentColor, 0.5),
      marginTop: SPACING.sm,
    },
    title: {
      fontSize: SIZES.text18,
      lineHeight: 24,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: -0.2,
      color: paper.ink,
    },
    preview: {
      fontSize: SIZES.text15,
      lineHeight: 22,
      fontStyle: 'italic',
      color: withAlpha(paper.ink, 0.74),
    },
    expandedContent: {
      gap: SPACING.lg,
      paddingHorizontal: SPACING.lg + 2,
      paddingBottom: SPACING.lg,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: paper.hairline,
    },
    bodyWrap: {
      gap: SPACING.md,
    },
    bodyParagraph: {
      fontSize: SIZES.text15,
      lineHeight: 26,
      color: paper.ink,
    },
    footer: {
      gap: SPACING.md,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: paper.hairline,
    },
    disclaimerText: {
      fontSize: 11,
      lineHeight: 17,
      color: paper.inkSubtle,
    },
  });
