import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
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
  customQuestionPlaceholder: string;
  selectedBadgeLabel: string;
  questionCounterLabel: (count: number, max: number) => string;
  questionMaxLength: number;
  promptTitle: (prompt: CoachPromptType) => string;
  promptSubtitle?: (prompt: CoachPromptType) => string;
  accentColor?: string;
  personaSectionLabel: string;
  modeSectionLabel: string;
  lockedBadgeLabel: string;
  lockedHint: string;
  promptCategoryLabel?: (category: CoachPromptCategory) => string;
  onSelectQuestion: (questionKey: CoachQuestionKey) => void;
  onSelectCustomQuestion: () => void;
  onQuestionInputFocus?: () => void;
  onQuestionInputLayout?: (event: LayoutChangeEvent) => void;
  onChangeQuestionText: (value: string) => void;
  onSelectPromptType: (prompt: CoachPromptType) => void;
  onPreviewPersona: (personaKey: string) => void;
  isPromptLocked?: (prompt: CoachPromptType) => boolean;
  busyPromptType?: CoachPromptType | null;
  busy?: boolean;
  disabled?: boolean;
  /**
   * When false, the legacy "Question libre" pressable is removed (Coach chat
   * rollout — the free-form question now lives in the conversation screen
   * instead of as a preset). Defaults to true to preserve the existing
   * behaviour for tests and for the flagged-off rollout.
   */
  showFreeQuestionInput?: boolean;
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
  customQuestionPlaceholder,
  selectedBadgeLabel,
  questionCounterLabel,
  questionMaxLength,
  promptTitle,
  promptSubtitle,
  accentColor,
  personaSectionLabel,
  modeSectionLabel,
  lockedBadgeLabel,
  lockedHint,
  promptCategoryLabel,
  onSelectQuestion,
  onSelectCustomQuestion,
  onQuestionInputFocus,
  onQuestionInputLayout,
  onChangeQuestionText,
  onSelectPromptType,
  onPreviewPersona,
  isPromptLocked,
  busyPromptType,
  busy = false,
  disabled = false,
  showFreeQuestionInput = true,
  testID = 'coach-settings-inline',
}: CoachSettingsInlineProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () => createStyles(colors, isDark, accentColor),
    [accentColor, colors, isDark],
  );
  const isCustomQuestionSelected = questionSelectionMode === 'free_text';
  const selectionAccent = accentColor ?? colors.primary;
  const handleCustomQuestionFocus = () => {
    onSelectCustomQuestion();
    onQuestionInputFocus?.();
  };

  return (
    <View style={styles.container} testID={testID}>
      {showFreeQuestionInput ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: busy || disabled,
            selected: isCustomQuestionSelected,
          }}
          disabled={busy || disabled}
          onLayout={onQuestionInputLayout}
          onPress={handleCustomQuestionFocus}
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
          onFocus={handleCustomQuestionFocus}
          onPressIn={handleCustomQuestionFocus}
          placeholder={customQuestionPlaceholder}
          placeholderTextColor={withAlpha(colors.primaryText, 0.34)}
          maxLength={questionMaxLength}
          editable={!busy && !disabled}
          multiline
          style={styles.questionInput}
          testID={`${testID}-question-input`}
        />
        </Pressable>
      ) : null}

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
      marginBottom: SPACING.xs, borderCurve: 'continuous',
    },
    questionInputSectionIdle: {
      borderColor: isDark
        ? withAlpha(colors.white ?? colors.primaryText, 0.08)
        : withAlpha(colors.primaryText, 0.07),
      backgroundColor: isDark
        ? withAlpha(colors.white ?? colors.primaryText, 0.018)
        : withAlpha(colors.white ?? colors.cardBackground, 0.72),
    },
    questionInputSectionSelected: {
      borderColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.22 : 0.18),
      backgroundColor: withAlpha(accentColor ?? colors.primary, isDark ? 0.045 : 0.035),
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
      minHeight: 104,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(colors.white ?? colors.primaryText, 0.1)
        : withAlpha(accentColor ?? colors.primary, 0.13),
      backgroundColor: isDark
        ? withAlpha(colors.white ?? colors.primaryText, 0.035)
        : colors.cardBackground ?? insetSurface.backgroundColor,
      color: colors.primaryText,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top', borderCurve: 'continuous',
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
      ), borderCurve: 'continuous',
    },
    selectedBadgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: accentColor ?? colors.primary,
    },
  });
};
