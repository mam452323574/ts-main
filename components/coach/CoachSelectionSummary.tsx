import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { Button } from '@/components/Button';
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
import { Squircle } from '@/components/Squircle';

interface CoachSelectionSummaryProps {
  modeType: CoachPromptType;
  modeLabel: string;
  personaName: string;
  personaAvatarSource?: CoachPersonaVisual['imageSource'];
  personaAvatarFallbackLabel: string;
  personaAvatarHaloTint: string;
  onChangePersona?: () => void;
  onChangeMode?: () => void;
  generateCtaLabel: string;
  onGenerate: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function CoachSelectionSummary({
  modeType,
  modeLabel,
  personaName,
  personaAvatarSource,
  personaAvatarFallbackLabel,
  personaAvatarHaloTint,
  onChangePersona,
  onChangeMode,
  generateCtaLabel,
  onGenerate,
  loading = false,
  disabled = false,
  testID = 'coach-selection-summary',
}: CoachSelectionSummaryProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { icon: ModeIcon, accentColor } = getCoachPromptVisual(modeType);
  const iconGlyphColor = isDark
    ? mixColors(colors.white, accentColor, 0.14)
    : mixColors(accentColor, colors.primaryText, 0.48);

  return (
    <Squircle style={styles.card} testID={testID}>
      <LinearGradient
        colors={[withAlpha(accentColor, 0.22), withAlpha(accentColor, 0.04)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backdrop}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={modeLabel}
        disabled={!onChangeMode}
        onPress={onChangeMode}
        style={({ pressed }) => [
          styles.modeRow,
          pressed && !!onChangeMode ? styles.modeRowPressed : null,
        ]}
        testID={`${testID}-mode`}
      >
        <Squircle
          style={[
            styles.modeIconShell,
            {
              backgroundColor: mixColors(
                colors.cardBackground,
                accentColor,
                0.26,
              ),
            },
          ]}
        >
          <ModeIcon color={iconGlyphColor} size={28} strokeWidth={2.2} />
        </Squircle>
        <Text style={styles.modeTitle} numberOfLines={2}>
          {modeLabel}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={personaName}
        disabled={!onChangePersona}
        onPress={onChangePersona}
        style={({ pressed }) => [
          styles.personaRow,
          pressed && !!onChangePersona ? styles.personaRowPressed : null,
        ]}
        testID={`${testID}-persona`}
      >
        <CoachPersonaAvatar
          imageSource={personaAvatarSource}
          fallbackLabel={personaAvatarFallbackLabel}
          haloTint={personaAvatarHaloTint}
          size={32}
          emphasis="subtle"
        />
        <Text style={styles.personaName} numberOfLines={1}>
          {personaName}
        </Text>
      </Pressable>

      <Button
        title={generateCtaLabel}
        onPress={onGenerate}
        loading={loading}
        disabled={disabled}
        testID={`${testID}-generate-button`}
      />
    </Squircle>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      overflow: 'hidden',
      gap: SPACING.md + 2,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl + 6,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      ...SHADOWS.card, borderCurve: 'continuous',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 190,
    },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    modeRowPressed: {
      opacity: 0.85,
    },
    modeIconShell: {
      width: 56,
      height: 56,
      borderRadius: BORDER_RADIUS.xl + 2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0, borderCurve: 'continuous',
    },
    modeTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    personaRow: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      paddingHorizontal: SPACING.xs + 2,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.full, borderCurve: 'continuous',
    },
    personaRowPressed: {
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.05),
    },
    personaName: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
  });
