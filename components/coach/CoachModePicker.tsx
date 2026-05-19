import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { CoachPromptCard } from '@/components/coach/CoachPromptCard';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getVisualMoodSurface,
  withAlpha,
} from '@/constants/theme';
import type { CoachQuestionKey } from '@/shared/coachQuestions';
import {
  COACH_PROMPT_TYPES,
  groupCoachPromptsByCategory,
  type CoachPromptCategory,
  type CoachPromptType,
} from '@/shared/coachPromptTypes';
import { Squircle } from '@/components/Squircle';

export interface CoachModePickerQuestionOption {
  key: CoachQuestionKey;
  label: string;
}

interface CoachModePickerProps {
  availablePrompts?: readonly CoachPromptType[];
  selectedQuestionPromptType?: CoachPromptType | null;
  expandedPromptType?: CoachPromptType | null;
  questionOptionsByPromptType?: Partial<
    Record<CoachPromptType, readonly CoachModePickerQuestionOption[]>
  >;
  selectedQuestionKey?: CoachQuestionKey | null;
  questionSelectionMode?: 'preset' | 'free_text' | null;
  disabled?: boolean;
  busyPromptType?: CoachPromptType | null;
  onSelect: (prompt: CoachPromptType) => void;
  onSelectQuestion?: (questionKey: CoachQuestionKey) => void;
  promptTitle: (prompt: CoachPromptType) => string;
  promptSubtitle?: (prompt: CoachPromptType) => string;
  categoryTitle?: (category: CoachPromptCategory) => string;
  questionSectionLabel?: string;
  selectedBadgeLabel?: string;
  questionTestIDPrefix?: string;
  isPromptLocked?: (prompt: CoachPromptType) => boolean;
  lockedBadgeLabel?: string;
  lockedHint?: string;
  testID?: string;
}

export function CoachModePicker({
  availablePrompts,
  selectedQuestionPromptType = null,
  expandedPromptType = null,
  questionOptionsByPromptType,
  selectedQuestionKey = null,
  questionSelectionMode = null,
  disabled = false,
  busyPromptType,
  onSelect,
  onSelectQuestion,
  promptTitle,
  promptSubtitle,
  categoryTitle,
  questionSectionLabel,
  selectedBadgeLabel,
  questionTestIDPrefix,
  isPromptLocked,
  lockedBadgeLabel,
  lockedHint,
  testID = 'coach-mode-picker',
}: CoachModePickerProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const prompts = availablePrompts ?? COACH_PROMPT_TYPES;
  const promptGroups = useMemo(
    () => groupCoachPromptsByCategory(prompts),
    [prompts],
  );
  const questionTestIDBase = questionTestIDPrefix ?? testID;

  if (prompts.length === 0) {
    return null;
  }

  return (
    <View style={styles.list} testID={testID}>
      {promptGroups.map((group) => (
        <Squircle
          key={group.category}
          style={styles.group}
          testID={`${testID}-category-${group.category}`}
        >
          <Text style={styles.groupTitle}>
            {categoryTitle ? categoryTitle(group.category) : group.category}
          </Text>
          <View style={styles.groupCards}>
            {group.prompts.map((prompt) => {
              const locked = isPromptLocked ? isPromptLocked(prompt) : false;
              const busy = busyPromptType === prompt;
              const expanded = expandedPromptType === prompt;
              const containsSelectedQuestion =
                questionSelectionMode === 'preset' &&
                selectedQuestionPromptType === prompt;
              const questionOptions = questionOptionsByPromptType?.[prompt] ?? [];

              return (
                <View
                  key={prompt}
                  style={styles.promptBlock}
                  testID={`${testID}-block-${prompt}`}
                >
                  <CoachPromptCard
                    promptType={prompt}
                    title={promptTitle(prompt)}
                    subtitle={promptSubtitle ? promptSubtitle(prompt) : undefined}
                    variant={group.prompts.length === 1 ? 'featured' : 'compact'}
                    mode="selector"
                    busy={busy}
                    disabled={disabled}
                    expanded={expanded}
                    containsSelectedQuestion={containsSelectedQuestion}
                    locked={locked}
                    lockedBadgeLabel={lockedBadgeLabel}
                    lockedHint={lockedHint}
                    onPress={() => onSelect(prompt)}
                    testID={`${testID}-card-${prompt}`}
                  />

                  {expanded && questionOptions.length > 0 && onSelectQuestion ? (
                    <Animated.View
                      entering={FadeInDown.duration(180).springify().damping(18)}
                      exiting={FadeOutUp.duration(120)}
                      style={styles.suggestionPanel}
                      testID={`${testID}-suggestions-${prompt}`}
                    >
                      {questionSectionLabel ? (
                        <Text style={styles.suggestionTitle}>
                          {questionSectionLabel}
                        </Text>
                      ) : null}
                      <View style={styles.suggestionList}>
                        {questionOptions.map((question) => {
                          const active =
                            questionSelectionMode === 'preset' &&
                            question.key === selectedQuestionKey;

                          return (
                            <Pressable
                              key={question.key}
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled,
                                selected: active,
                              }}
                              disabled={disabled}
                              onPress={() => onSelectQuestion(question.key)}
                              style={({ pressed }) => [
                                styles.suggestionChip,
                                active ? styles.suggestionChipActive : null,
                                pressed && !disabled
                                  ? styles.suggestionChipPressed
                                  : null,
                                disabled ? styles.suggestionChipDisabled : null,
                              ]}
                              testID={`${questionTestIDBase}-question-${question.key}`}
                            >
                              <Text
                                numberOfLines={3}
                                style={[
                                  styles.suggestionText,
                                  active ? styles.suggestionTextActive : null,
                                ]}
                              >
                                {question.label}
                              </Text>
                              {active ? (
                                <View
                                  style={styles.selectedBadge}
                                  testID={`${questionTestIDBase}-question-${question.key}-selected-badge`}
                                >
                                  <Check
                                    color={colors.primary}
                                    size={12}
                                    strokeWidth={3}
                                    testID={`${questionTestIDBase}-question-${question.key}-selected-icon`}
                                  />
                                  {selectedBadgeLabel ? (
                                    <Text
                                      numberOfLines={1}
                                      style={styles.selectedBadgeText}
                                    >
                                      {selectedBadgeLabel}
                                    </Text>
                                  ) : null}
                                </View>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </Animated.View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Squircle>
      ))}
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  {
    const groupSurface = getVisualMoodSurface(colors, isDark, {
      mood: 'obsidian',
      accentColor: colors.primary,
      intensity: 'subtle',
      shadow: false,
    });

    return StyleSheet.create({
    list: {
      gap: SPACING.md + 2,
    },
    group: {
      gap: SPACING.sm,
      padding: SPACING.sm + 2,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: groupSurface.borderColor,
      backgroundColor: groupSurface.backgroundColor, borderCurve: 'continuous',
    },
    groupTitle: {
      fontSize: SIZES.text12,
      lineHeight: 15,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(colors.primaryText, isDark ? 0.78 : 0.62),
      textTransform: 'uppercase',
      letterSpacing: 0.72,
    },
    groupCards: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm + 2,
    },
    promptBlock: {
      width: '100%',
      gap: SPACING.xs + 2,
    },
    suggestionPanel: {
      marginTop: -2,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.1 : 0.08),
      backgroundColor: withAlpha(
        colors.cardBackground ?? colors.background,
        isDark ? 0.86 : 0.94,
      ),
      gap: SPACING.xs + 2, borderCurve: 'continuous',
    },
    suggestionTitle: {
      paddingHorizontal: SPACING.xs,
      fontSize: SIZES.text12,
      lineHeight: 15,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: withAlpha(colors.primaryText, isDark ? 0.66 : 0.56),
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    suggestionList: {
      gap: SPACING.xs + 2,
    },
    suggestionChip: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.11 : 0.08),
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.045 : 0.035), borderCurve: 'continuous',
    },
    suggestionChipActive: {
      borderColor: withAlpha(colors.primary, isDark ? 0.34 : 0.24),
      backgroundColor: withAlpha(colors.primary, isDark ? 0.14 : 0.08),
    },
    suggestionChipPressed: {
      transform: [{ scale: 0.99 }],
      backgroundColor: withAlpha(colors.primary, isDark ? 0.12 : 0.07),
    },
    suggestionChipDisabled: {
      opacity: 0.6,
    },
    suggestionText: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      lineHeight: 18,
      color: colors.primaryText,
    },
    suggestionTextActive: {
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.semiBold,
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
      borderColor: withAlpha(colors.primary, isDark ? 0.34 : 0.24),
      backgroundColor: withAlpha(colors.primary, isDark ? 0.16 : 0.08), borderCurve: 'continuous',
    },
    selectedBadgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    });
  };
