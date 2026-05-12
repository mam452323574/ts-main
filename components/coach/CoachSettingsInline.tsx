import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CoachModePicker } from '@/components/coach/CoachModePicker';
import { CoachPersonaCard } from '@/components/coach/CoachPersonaCard';
import { useTheme } from '@/contexts/ThemeContext';
import {
  FONT_WEIGHTS,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachPromptType } from '@/shared/coachPromptTypes';

export interface CoachSettingsInlinePersonaOption {
  key: CoachPersonaKey;
  title: string;
  subtitle: string;
  visual: CoachPersonaVisual;
  locked: boolean;
}

interface CoachSettingsInlineProps {
  activePersonaKey: string;
  selectedPromptType: CoachPromptType;
  personaOptions: readonly CoachSettingsInlinePersonaOption[];
  promptTitle: (prompt: CoachPromptType) => string;
  promptSubtitle?: (prompt: CoachPromptType) => string;
  title: string;
  subtitle: string;
  personaSectionLabel: string;
  modeSectionLabel: string;
  lockedBadgeLabel: string;
  lockedHint: string;
  onSelectPromptType: (prompt: CoachPromptType) => void;
  onPreviewPersona: (personaKey: string) => void;
  isPromptLocked?: (prompt: CoachPromptType) => boolean;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function CoachSettingsInline({
  activePersonaKey,
  selectedPromptType,
  personaOptions,
  promptTitle,
  promptSubtitle,
  title,
  subtitle,
  personaSectionLabel,
  modeSectionLabel,
  lockedBadgeLabel,
  lockedHint,
  onSelectPromptType,
  onPreviewPersona,
  isPromptLocked,
  busy = false,
  disabled = false,
  testID = 'coach-settings-inline',
}: CoachSettingsInlineProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Text style={styles.sectionLabel}>{personaSectionLabel}</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.personaRail}
        showsHorizontalScrollIndicator={false}
      >
        {personaOptions.map((persona) => (
          <CoachPersonaCard
            key={persona.key}
            title={persona.title}
            subtitle={persona.subtitle}
            avatarImageSource={persona.visual.imageSource}
            avatarFallbackLabel={persona.visual.fallbackLabel}
            avatarHaloTint={persona.visual.haloTint}
            variant="compact"
            active={persona.key === activePersonaKey}
            locked={persona.locked}
            disabled={busy || disabled}
            lockedBadgeLabel={lockedBadgeLabel}
            lockedHint={lockedHint}
            onPress={() => onPreviewPersona(persona.key)}
            testID={`${testID}-persona-${persona.key}`}
          />
        ))}
      </ScrollView>

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
        {modeSectionLabel}
      </Text>
      <CoachModePicker
        selectedPromptType={selectedPromptType}
        onSelect={onSelectPromptType}
        promptTitle={promptTitle}
        promptSubtitle={promptSubtitle}
        disabled={busy || disabled}
        isPromptLocked={isPromptLocked}
        lockedBadgeLabel={lockedBadgeLabel}
        lockedHint={lockedHint}
        testID={`${testID}-mode-picker`}
      />
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      gap: SPACING.md,
    },
    heading: {
      gap: 4,
      marginBottom: SPACING.xs,
    },
    title: {
      fontSize: 18,
      lineHeight: 22,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.gray,
    },
    sectionLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(colors.primaryText, 0.58),
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionLabelSpaced: {
      marginTop: SPACING.sm,
    },
    personaRail: {
      gap: SPACING.md,
      paddingTop: SPACING.xs,
      paddingRight: SPACING.md,
    },
  });
