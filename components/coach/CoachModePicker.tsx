import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CoachPromptCard } from '@/components/coach/CoachPromptCard';
import { useTheme } from '@/contexts/ThemeContext';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getVisualMoodSurface,
  withAlpha,
} from '@/constants/theme';
import {
  COACH_PROMPT_TYPES,
  groupCoachPromptsByCategory,
  type CoachPromptCategory,
  type CoachPromptType,
} from '@/shared/coachPromptTypes';

interface CoachModePickerProps {
  availablePrompts?: readonly CoachPromptType[];
  selectedPromptType: CoachPromptType;
  disabled?: boolean;
  busyPromptType?: CoachPromptType | null;
  onSelect: (prompt: CoachPromptType) => void;
  promptTitle: (prompt: CoachPromptType) => string;
  promptSubtitle?: (prompt: CoachPromptType) => string;
  categoryTitle?: (category: CoachPromptCategory) => string;
  isPromptLocked?: (prompt: CoachPromptType) => boolean;
  lockedBadgeLabel?: string;
  lockedHint?: string;
  testID?: string;
}

export function CoachModePicker({
  availablePrompts,
  selectedPromptType,
  disabled = false,
  busyPromptType,
  onSelect,
  promptTitle,
  promptSubtitle,
  categoryTitle,
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

  if (prompts.length === 0) {
    return null;
  }

  return (
    <View style={styles.list} testID={testID}>
      {promptGroups.map((group) => (
        <View
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
              const selected = selectedPromptType === prompt;

              return (
                <CoachPromptCard
                  key={prompt}
                  promptType={prompt}
                  title={promptTitle(prompt)}
                  subtitle={promptSubtitle ? promptSubtitle(prompt) : undefined}
                  variant={group.prompts.length === 1 ? 'featured' : 'compact'}
                  mode="selector"
                  busy={busy}
                  disabled={disabled}
                  selected={selected}
                  locked={locked}
                  lockedBadgeLabel={lockedBadgeLabel}
                  lockedHint={lockedHint}
                  onPress={() => onSelect(prompt)}
                  testID={`${testID}-card-${prompt}`}
                />
              );
            })}
          </View>
        </View>
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
      backgroundColor: groupSurface.backgroundColor,
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
    });
  };
