import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { SocialReactionState } from '@/types';

type NuancedReaction = Exclude<SocialReactionState, 'neutral'>;

interface ReactionOption {
  reaction: NuancedReaction;
  glyph: string;
  accessibilityLabel: string;
}

const REACTION_OPTIONS: ReactionOption[] = [
  { reaction: 'like', glyph: '❤️', accessibilityLabel: 'Like' },
  { reaction: 'laugh', glyph: '😄', accessibilityLabel: 'Laugh' },
  { reaction: 'wow', glyph: '😮', accessibilityLabel: 'Wow' },
  { reaction: 'sad', glyph: '😢', accessibilityLabel: 'Sad' },
  { reaction: 'dislike', glyph: '👎', accessibilityLabel: 'Dislike' },
];

interface SocialReactionPickerProps {
  visible: boolean;
  currentReaction?: SocialReactionState | null;
  testID?: string;
  onSelect: (reaction: NuancedReaction) => void;
  onDismiss: () => void;
}

export function SocialReactionPicker({
  visible,
  currentReaction,
  testID,
  onSelect,
  onDismiss,
}: SocialReactionPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fade.setValue(0);
      scale.setValue(0.85);
    }
  }, [fade, scale, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close reaction picker"
      onPress={onDismiss}
      style={styles.backdrop}
      testID={testID ? `${testID}-backdrop` : 'social-reaction-picker-backdrop'}
    >
      <Animated.View
        style={[
          styles.picker,
          { opacity: fade, transform: [{ scale }] },
        ]}
        testID={testID ?? 'social-reaction-picker'}
      >
        {REACTION_OPTIONS.map((option) => {
          const isCurrent = currentReaction === option.reaction;
          return (
            <TouchableOpacity
              key={option.reaction}
              accessibilityRole="button"
              accessibilityLabel={option.accessibilityLabel}
              onPress={() => onSelect(option.reaction)}
              style={[styles.option, isCurrent && styles.optionActive]}
              testID={`social-reaction-picker-${option.reaction}`}
            >
              <Text style={styles.glyph}>{option.glyph}</Text>
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
      zIndex: 10,
    },
    picker: {
      flexDirection: 'row',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.1),
      ...SHADOWS.card, borderCurve: 'continuous',
    },
    option: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20, borderCurve: 'continuous',
    },
    optionActive: {
      backgroundColor: withAlpha(colors.primary, 0.12),
    },
    glyph: {
      fontSize: SIZES.text22 ?? 22,
      lineHeight: 26,
      fontWeight: FONT_WEIGHTS.bold,
    },
  });

export default SocialReactionPicker;
