import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import {
  CoachStatusChip,
  type CoachStatusChipState,
} from '@/components/coach/CoachStatusChip';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { getCoachPromptVisual } from '@/shared/coachPromptVisuals';
import type { CoachPromptType } from '@/shared/coachPromptTypes';

interface CoachContextStripProps {
  personaName: string;
  personaAccessibilityLabel: string;
  personaAvatarSource?: CoachPersonaVisual['imageSource'];
  personaAvatarFallbackLabel: string;
  personaAvatarHaloTint: string;
  onPersonaPress: () => void;
  modeType: CoachPromptType;
  modeName: string;
  modeAccessibilityLabel: string;
  onModePress: () => void;
  statusState: CoachStatusChipState;
  statusLabel: string;
  disabled?: boolean;
  testID?: string;
}

export function CoachContextStrip({
  personaName,
  personaAccessibilityLabel,
  personaAvatarSource,
  personaAvatarFallbackLabel,
  personaAvatarHaloTint,
  onPersonaPress,
  modeType,
  modeName,
  modeAccessibilityLabel,
  onModePress,
  statusState,
  statusLabel,
  disabled = false,
  testID = 'coach-context-strip',
}: CoachContextStripProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { icon: ModeIcon, accentColor: modeAccent } = getCoachPromptVisual(modeType);
  const modeGlyphColor = mixColors(colors.white, modeAccent, 0.18);

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={personaAccessibilityLabel}
          disabled={disabled}
          onPress={onPersonaPress}
          style={({ pressed }) => [
            styles.personaCell,
            pressed && !disabled ? styles.cellPressed : null,
            disabled ? styles.cellDisabled : null,
          ]}
          testID={`${testID}-persona`}
        >
          <CoachPersonaAvatar
            imageSource={personaAvatarSource}
            fallbackLabel={personaAvatarFallbackLabel}
            haloTint={personaAvatarHaloTint}
            size={38}
            emphasis="subtle"
            testID={`${testID}-persona-avatar`}
          />
          <Text numberOfLines={1} style={styles.personaName}>
            {personaName}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={modeAccessibilityLabel}
          disabled={disabled}
          onPress={onModePress}
          style={({ pressed }) => [
            styles.modeCell,
            {
              backgroundColor: withAlpha(modeAccent, 0.11),
            },
            pressed && !disabled ? styles.cellPressed : null,
            disabled ? styles.cellDisabled : null,
          ]}
          testID={`${testID}-mode`}
        >
          <View
            style={[
              styles.modeIcon,
              {
                backgroundColor: mixColors(
                  colors.cardBackground,
                  modeAccent,
                  0.22,
                ),
              },
            ]}
          >
            <ModeIcon color={modeGlyphColor} size={14} strokeWidth={2.2} />
          </View>
          <Text numberOfLines={1} style={styles.modeName}>
            {modeName}
          </Text>
        </Pressable>
      </View>

      <CoachStatusChip
        state={statusState}
        label={statusLabel}
        testID={`${testID}-status`}
      />
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrap: {
      gap: SPACING.sm + 2,
      padding: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.xl + 2,
      backgroundColor: withAlpha(colors.cardBackground, 0.96),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      ...SHADOWS.card,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    personaCell: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.full,
      minWidth: 0,
    },
    personaName: {
      flex: 1,
      minWidth: 0,
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    modeCell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.full,
      minWidth: 0,
      maxWidth: '60%',
    },
    modeIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeName: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      flexShrink: 1,
    },
    cellPressed: {
      transform: [{ scale: 0.985 }],
    },
    cellDisabled: {
      opacity: 0.68,
    },
  });
