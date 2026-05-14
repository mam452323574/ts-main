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
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachStructuredContent } from '@/shared/coachContent';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    <View style={styles.card} testID={testID}>
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
            <View style={styles.chevronWrap}>
              {expanded ? (
                <ChevronUp color={colors.gray} size={18} />
              ) : (
                <ChevronDown color={colors.gray} size={18} />
              )}
            </View>
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
              <CoachStructuredContentSections
                content={content}
                labels={sectionLabels}
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
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      overflow: 'hidden',
      ...SHADOWS.card,
    },
    accentBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: withAlpha(colors.primary, 0.24),
    },
    toggle: {
      paddingHorizontal: SPACING.md + 2,
      paddingTop: SPACING.md + 2,
      paddingBottom: SPACING.md,
      gap: SPACING.md,
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
      gap: SPACING.sm,
    },
    metaCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    personaValue: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    dateLabel: {
      fontSize: 11,
      lineHeight: 15,
      color: colors.textMuted ?? colors.gray,
    },
    trailingMeta: {
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    recentPill: {
      maxWidth: 84,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primary, 0.07),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.12),
    },
    recentPillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    chevronWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.04),
    },
    summary: {
      gap: SPACING.xs + 2,
    },
    modePill: {
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      maxWidth: '80%',
    },
    modePillText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.8),
    },
    sectionsWrap: {
      gap: SPACING.sm + 2,
    },
    structuredSummary: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    section: {
      gap: 4,
      paddingVertical: SPACING.xs,
    },
    sectionLabel: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.72),
      textTransform: 'uppercase',
      letterSpacing: 0.45,
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
      backgroundColor: withAlpha(colors.warning, 0.055),
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm + 2,
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.14),
    },
    warningLabel: {
      color: colors.warning,
    },
    encouragement: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      fontStyle: 'italic',
      color: withAlpha(colors.primaryText, 0.9),
      paddingTop: SPACING.xs,
    },
    title: {
      fontSize: SIZES.text16,
      lineHeight: 22,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    preview: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.textMuted ?? withAlpha(colors.primaryText, 0.82),
    },
    expandedContent: {
      gap: SPACING.md,
      paddingHorizontal: SPACING.md + 2,
      paddingBottom: SPACING.md + 2,
    },
    bodyWrap: {
      gap: SPACING.sm + 2,
    },
    bodyParagraph: {
      fontSize: SIZES.text14,
      lineHeight: 21,
      color: colors.primaryText,
    },
    footer: {
      gap: SPACING.md,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07),
    },
    disclaimerText: {
      fontSize: 11,
      lineHeight: 17,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.92),
    },
  });
