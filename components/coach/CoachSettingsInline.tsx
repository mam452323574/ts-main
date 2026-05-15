import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check } from 'lucide-react-native';

import {
  CoachModePicker,
  type CoachModePickerQuestionOption,
} from '@/components/coach/CoachModePicker';
import { CoachPersonaCard } from '@/components/coach/CoachPersonaCard';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SPACING,
  getVisualMoodSurface,
  withAlpha,
} from '@/constants/theme';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import type { CoachQuestionKey } from '@/shared/coachQuestions';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type {
  CoachPromptCategory,
  CoachPromptType,
} from '@/shared/coachPromptTypes';

export interface CoachSettingsInlinePersonaOption {
  key: CoachPersonaKey;
  title: string;
  subtitle: string;
  visual: CoachPersonaVisual;
  locked: boolean;
}

export interface CoachSettingsInlineQuestionOption {
  key: CoachQuestionKey;
  label: string;
}

export type CoachSettingsInlineQuestionSelectionMode =
  | 'preset'
  | 'free_text';

interface CoachSettingsInlineProps {
  activePersonaKey: string;
  selectedQuestionPromptType: CoachPromptType | null;
  expandedPromptType: CoachPromptType | null;
  personaOptions: readonly CoachSettingsInlinePersonaOption[];
  questionOptionsByPromptType: Partial<
    Record<CoachPromptType, readonly CoachModePickerQuestionOption[]>
  >;
  selectedQuestionKey: CoachQuestionKey | null;
  questionSelectionMode: CoachSettingsInlineQuestionSelectionMode | null;
  questionText: string;
  questionSectionLabel: string;
  customQuestionLabel: string;
  customQuestionHelper: string;
  customQuestionPlaceholder: string;
  selectedBadgeLabel: string;
  questionCounterLabel: (count: number, max: number) => string;
  questionMaxLength: number;
  promptTitle: (prompt: CoachPromptType) => string;
  promptSubtitle?: (prompt: CoachPromptType) => string;
  title: string;
  subtitle: string;
  accentColor?: string;
  personaSectionLabel: string;
  modeSectionLabel: string;
  lockedBadgeLabel: string;
  lockedHint: string;
  promptCategoryLabel?: (category: CoachPromptCategory) => string;
  onSelectQuestion: (questionKey: CoachQuestionKey) => void;
  onSelectCustomQuestion: () => void;
  onChangeQuestionText: (value: string) => void;
  onSelectPromptType: (prompt: CoachPromptType) => void;
  onPreviewPersona: (personaKey: string) => void;
  isPromptLocked?: (prompt: CoachPromptType) => boolean;
  busyPromptType?: CoachPromptType | null;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function CoachSettingsInline({
  activePersonaKey,
  selectedQuestionPromptType,
  expandedPromptType,
  personaOptions,
  questionOptionsByPromptType,
  selectedQuestionKey,
  questionSelectionMode,
  questionText,
  questionSectionLabel,
  customQuestionLabel,
  customQuestionHelper,
  customQuestionPlaceholder,
  selectedBadgeLabel,
  questionCounterLabel,
  questionMaxLength,
  promptTitle,
  promptSubtitle,
  title,
  subtitle,
  accentColor,
  personaSectionLabel,
  modeSectionLabel,
  lockedBadgeLabel,
  lockedHint,
  promptCategoryLabel,
  onSelectQuestion,
  onSelectCustomQuestion,
  onChangeQuestionText,
  onSelectPromptType,
  onPreviewPersona,
  isPromptLocked,
  busyPromptType,
  busy = false,
  disabled = false,
  testID = 'coach-settings-inline',
}: CoachSettingsInlineProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () => createStyles(colors, isDark, accentColor),
    [accentColor, colors, isDark],
  );
  const isCustomQuestionSelected = questionSelectionMode === 'free_text';
  const selectionAccent = accentColor ?? colors.primary;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: busy || disabled,
          selected: isCustomQuestionSelected,
        }}
        disabled={busy || disabled}
        onPress={onSelectCustomQuestion}
        style={({ pressed }) => [
          styles.questionInputSection,
          styles.questionInputSectionFeatured,
          isCustomQuestionSelected
            ? styles.questionInputSectionSelected
            : styles.questionInputSectionIdle,
          pressed && !busy && !disabled ? styles.questionInputSectionPressed : null,
          busy || disabled ? styles.questionInputSectionDisabled : null,
        ]}
        testID={`${testID}-question-input-card`}
      >
        <View style={styles.questionInputHeader}>
          <View style={styles.questionInputTitleRow}>
            <Text
              style={[
                styles.questionInputLabel,
                isCustomQuestionSelected ? styles.questionInputLabelSelected : null,
              ]}
            >
              {customQuestionLabel}
            </Text>
            {isCustomQuestionSelected ? (
              <View
                style={styles.selectedBadge}
                testID={`${testID}-question-input-selected-badge`}
              >
                <Check
                  color={selectionAccent}
                  size={12}
                  strokeWidth={3}
                  testID={`${testID}-question-input-selected-icon`}
                />
                <Text numberOfLines={1} style={styles.selectedBadgeText}>
                  {selectedBadgeLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[
              styles.questionInputCounter,
              isCustomQuestionSelected
                ? styles.questionInputCounterSelected
                : null,
            ]}
            testID={`${testID}-question-counter`}
          >
            {questionCounterLabel(Array.from(questionText).length, questionMaxLength)}
          </Text>
        </View>
        <TextInput
          value={questionText}
          onChangeText={onChangeQuestionText}
          onFocus={onSelectCustomQuestion}
          onPressIn={onSelectCustomQuestion}
          placeholder={customQuestionPlaceholder}
          placeholderTextColor={withAlpha(colors.primaryText, 0.34)}
          maxLength={questionMaxLength}
          editable={!busy && !disabled}
          multiline
          style={styles.questionInput}
          testID={`${testID}-question-input`}
        />
        <Text style={styles.questionInputHelper}>{customQuestionHelper}</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>{personaSectionLabel}</Text>
      <ScrollView
        horizontal
        style={styles.personaRailViewport}
        contentContainerStyle={styles.personaRail}
        showsHorizontalScrollIndicator={false}
        testID={`${testID}-persona-rail`}
      >
        {personaOptions.map((persona) => (
          <CoachPersonaCard
            key={persona.key}
            title={persona.title}
            subtitle={persona.subtitle}
            avatarImageSource={persona.visual.imageSource}
            avatarFallbackLabel={persona.visual.fallbackLabel}
            avatarHaloTint={persona.visual.haloTint}
            variant="portrait"
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
        selectedQuestionPromptType={selectedQuestionPromptType}
        expandedPromptType={expandedPromptType}
        questionOptionsByPromptType={questionOptionsByPromptType}
        selectedQuestionKey={selectedQuestionKey}
        questionSelectionMode={questionSelectionMode}
        onSelect={onSelectPromptType}
        onSelectQuestion={onSelectQuestion}
        promptTitle={promptTitle}
        promptSubtitle={promptSubtitle}
        categoryTitle={promptCategoryLabel}
        questionSectionLabel={questionSectionLabel}
        selectedBadgeLabel={selectedBadgeLabel}
        questionTestIDPrefix={`${testID}-mode-picker`}
        disabled={busy || disabled}
        busyPromptType={busyPromptType}
        isPromptLocked={isPromptLocked}
        lockedBadgeLabel={lockedBadgeLabel}
        lockedHint={lockedHint}
        testID={`${testID}-mode-picker`}
      />
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean, accentColor?: string) => {
  const insetSurface = getVisualMoodSurface(colors, isDark, {
    mood: 'obsidian',
    accentColor: accentColor ?? colors.primary,
    intensity: 'subtle',
    shadow: false,
  });

  return StyleSheet.create({
    container: {
      gap: SPACING.sm + 2,
    },
    heading: {
      gap: 5,
      marginBottom: SPACING.xs,
    },
    title: {
      fontSize: 18,
      lineHeight: 23,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 19,
      color: withAlpha(colors.primaryText, 0.7),
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
      marginTop: SPACING.xs,
    },
    personaRailViewport: {
      marginLeft: -SPACING.page,
      marginRight: -SPACING.page,
    },
    personaRail: {
      gap: SPACING.sm,
      paddingTop: SPACING.xs,
      paddingLeft: SPACING.page,
      paddingRight: SPACING.page,
      paddingBottom: SPACING.xs,
    },
    questionInputSection: {
      gap: SPACING.xs,
    },
    questionInputSectionFeatured: {
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      marginBottom: SPACING.xs,
    },
    questionInputSectionIdle: {
      borderColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.14 : 0.1),
      backgroundColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.055 : 0.035),
    },
    questionInputSectionSelected: {
      borderColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.3 : 0.24),
      backgroundColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.12 : 0.08),
    },
    questionInputSectionPressed: {
      transform: [{ scale: 0.995 }],
    },
    questionInputSectionDisabled: {
      opacity: 0.72,
    },
    questionInputHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    questionInputTitleRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    questionInputLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    questionInputLabelSelected: {
      color: accentColor ?? colors.primary,
    },
    questionInputCounter: {
      fontSize: 12,
      lineHeight: 16,
      color: withAlpha(colors.primaryText, 0.46),
    },
    questionInputCounterSelected: {
      color: accentColor ?? colors.primary,
    },
    questionInput: {
      minHeight: 116,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.22 : 0.18),
      backgroundColor: colors.cardBackground ?? insetSurface.backgroundColor,
      color: colors.primaryText,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    questionInputHelper: {
      fontSize: 12,
      lineHeight: 17,
      color: withAlpha(colors.primaryText, 0.58),
    },
    selectedBadge: {
      flexShrink: 0,
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.34 : 0.24),
      backgroundColor: withAlpha(
        accentColor ?? colors.primary,
        isDark ? 0.16 : 0.08,
      ),
    },
    selectedBadgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: accentColor ?? colors.primary,
    },
  });
};
