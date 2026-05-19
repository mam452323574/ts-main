import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Archive, MessageSquare } from 'lucide-react-native';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { CoachConversation } from '@/shared/coachConversation';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachPersonaKey } from '@/shared/coachPersonas';

interface CoachConversationCardProps {
  conversation: CoachConversation;
  title: string;
  personaLabel: string;
  counterLabel: string;
  statusLabel?: string | null;
  dateLabel?: string | null;
  onPress: () => void;
  onArchive?: (() => void) | null;
  archiveA11yLabel?: string;
  testID?: string;
}

function CoachConversationCardComponent({
  conversation,
  title,
  personaLabel,
  counterLabel,
  statusLabel,
  dateLabel,
  onPress,
  onArchive,
  archiveA11yLabel,
  testID,
}: CoachConversationCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const personaVisual = getCoachPersonaVisual(conversation.persona_key as CoachPersonaKey);
  const isInactive = conversation.status !== 'active';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Squircle style={[styles.card, isInactive ? styles.cardInactive : null]}>
        <View style={styles.avatar}>
          <CoachPersonaAvatar
            imageSource={personaVisual.imageSource}
            fallbackLabel={personaVisual.fallbackLabel}
            haloTint={personaVisual.haloTint}
            size={42}
            emphasis="subtle"
          />
        </View>
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <MessageSquare
              color={withAlpha(colors.primaryText, 0.55)}
              size={14}
              strokeWidth={2.2}
            />
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText} numberOfLines={1}>
              {personaLabel}
            </Text>
            <Text style={styles.metaSeparator}>•</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {counterLabel}
            </Text>
          </View>
          {(statusLabel || dateLabel) ? (
            <View style={styles.footerRow}>
              {statusLabel ? (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{statusLabel}</Text>
                </View>
              ) : null}
              {dateLabel ? (
                <Text style={styles.dateLabel}>{dateLabel}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {onArchive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={archiveA11yLabel ?? 'Archiver'}
            onPress={onArchive}
            style={({ pressed }) => [styles.archiveButton, pressed ? styles.archiveButtonPressed : null]}
            testID={testID ? `${testID}-archive` : undefined}
          >
            <Archive color={withAlpha(colors.primaryText, 0.55)} size={16} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </Squircle>
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    pressable: {
      width: '100%',
    },
    pressed: {
      opacity: 0.9,
    },
    card: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.07),
    },
    cardInactive: {
      backgroundColor: withAlpha(colors.primaryText, 0.03),
      borderColor: withAlpha(colors.primaryText, 0.05),
    },
    avatar: {
      paddingTop: 2,
    },
    body: {
      flex: 1,
      gap: 4,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    title: {
      flex: 1,
      fontSize: SIZES.text15,
      lineHeight: 20,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metaText: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.6),
    },
    metaSeparator: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.35),
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: 4,
    },
    statusBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: withAlpha(colors.gold, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(colors.gold, 0.3),
    },
    statusBadgeText: {
      fontSize: SIZES.text12,
      color: colors.gold,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    dateLabel: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.45),
      marginLeft: 'auto',
    },
    archiveButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primaryText, 0.05),
      marginLeft: SPACING.xs,
    },
    archiveButtonPressed: {
      opacity: 0.7,
    },
  });

export const CoachConversationCard = memo(CoachConversationCardComponent);
