import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import type { CoachPersonaKey } from '@/shared/coachPersonas';

interface CoachConversationStarterProps {
  personaKey: CoachPersonaKey;
  title: string;
  subtitle: string;
  suggestions: { id: string; label: string }[];
  onSelectSuggestion: (suggestion: { id: string; label: string }) => void;
  testID?: string;
}

function CoachConversationStarterComponent({
  personaKey,
  title,
  subtitle,
  suggestions,
  onSelectSuggestion,
  testID = 'coach-conversation-starter',
}: CoachConversationStarterProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visual = getCoachPersonaVisual(personaKey);

  return (
    <View style={styles.container} testID={testID}>
      <CoachPersonaAvatar
        imageSource={visual.imageSource}
        fallbackLabel={visual.fallbackLabel}
        haloTint={visual.haloTint}
        size={68}
        emphasis="featured"
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.suggestionsColumn}>
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion.id}
            accessibilityRole="button"
            onPress={() => onSelectSuggestion(suggestion)}
            style={({ pressed }) => [styles.suggestionRow, pressed ? styles.suggestionRowPressed : null]}
            testID={`${testID}-suggestion-${suggestion.id}`}
          >
            <Squircle style={styles.suggestionBubble}>
              <Text style={styles.suggestionText}>{suggestion.label}</Text>
            </Squircle>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      width: '100%',
      alignItems: 'center',
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.lg,
      gap: SPACING.sm,
    },
    title: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
      marginTop: SPACING.sm,
    },
    subtitle: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: withAlpha(colors.primaryText, 0.62),
      textAlign: 'center',
      maxWidth: 320,
    },
    suggestionsColumn: {
      width: '100%',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    suggestionRow: {
      width: '100%',
    },
    suggestionRowPressed: {
      opacity: 0.85,
    },
    suggestionBubble: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.18),
    },
    suggestionText: {
      fontSize: SIZES.text14,
      lineHeight: 20,
      color: colors.primaryText,
      textAlign: 'center',
      fontWeight: FONT_WEIGHTS.medium,
    },
  });

export const CoachConversationStarter = memo(CoachConversationStarterComponent);
