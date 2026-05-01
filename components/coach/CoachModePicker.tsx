import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CoachPromptCard } from '@/components/coach/CoachPromptCard';
import { SPACING } from '@/constants/theme';
import {
  COACH_PROMPT_TYPES,
  type CoachPromptType,
} from '@/shared/coachPromptTypes';

interface CoachModePickerProps {
  availablePrompts?: readonly CoachPromptType[];
  selectedPromptType: CoachPromptType;
  disabled?: boolean;
  busyPromptType?: CoachPromptType | null;
  onSelect: (prompt: CoachPromptType) => void;
  promptTitle: (prompt: CoachPromptType) => string;
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
  isPromptLocked,
  lockedBadgeLabel,
  lockedHint,
  testID = 'coach-mode-picker',
}: CoachModePickerProps) {
  const styles = useMemo(() => createStyles(), []);
  const prompts = availablePrompts ?? COACH_PROMPT_TYPES;

  if (prompts.length === 0) {
    return null;
  }

  return (
    <View style={styles.grid} testID={testID}>
      {prompts.map((prompt) => {
        const locked = isPromptLocked ? isPromptLocked(prompt) : false;
        return (
          <View key={prompt} style={styles.cell}>
            <CoachPromptCard
              promptType={prompt}
              title={promptTitle(prompt)}
              onPress={() => onSelect(prompt)}
              variant="compact"
              mode="selector"
              disabled={disabled}
              selected={selectedPromptType === prompt}
              busy={busyPromptType === prompt}
              locked={locked}
              lockedBadgeLabel={lockedBadgeLabel}
              lockedHint={lockedHint}
              testID={`${testID}-card-${prompt}`}
            />
          </View>
        );
      })}
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm + 2,
    },
    cell: {
      flexBasis: '48%',
      flexGrow: 1,
    },
  });
