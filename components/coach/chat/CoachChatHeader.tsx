import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Archive, ChevronLeft } from 'lucide-react-native';

import { HeaderIconButton } from '@/components/ScreenHeader';
import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getThemeTokens,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type {
  CoachPersonaDefinition,
  CoachPersonaKey,
} from '@/shared/coachPersonas';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';

const HUMAN_NAMES: Record<CoachPersonaKey, string> = {
  gentle_supportive: 'Noah',
  strict_tough: 'Axel',
  motivational_energetic: 'Leo',
  patient_calm: 'Mira',
  analytical_precise: 'Elias',
  playful_light: 'Milo',
};

function resolveTranslation(
  key: string,
  fallback: string,
  t: (scope: string) => string,
): string {
  const value = t(key);
  if (!value || value === key || value.startsWith('[missing')) {
    return fallback;
  }
  return value;
}

export interface CoachChatHeaderProps {
  personaKey: CoachPersonaKey;
  personaDefinition: CoachPersonaDefinition | null | undefined;
  personaVisual: CoachPersonaVisual | null | undefined;
  onBack: () => void;
  onArchive?: () => void;
  showArchive?: boolean;
  backLabel?: string;
  archiveLabel?: string;
  fallbackTitle?: string;
  topInset?: boolean;
  testID?: string;
}

export function CoachChatHeader({
  personaKey,
  personaDefinition,
  personaVisual,
  onBack,
  onArchive,
  showArchive = false,
  backLabel = 'Back',
  archiveLabel = 'Archive',
  fallbackTitle,
  topInset = false,
  testID,
}: CoachChatHeaderProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const tokens = getThemeTokens(isDark);

  const fallbackName = HUMAN_NAMES[personaKey] || fallbackTitle || 'Coach';
  const resolvedName = personaDefinition
    ? resolveTranslation(personaDefinition.titleTranslationKey, fallbackName, t)
    : fallbackName;

  return (
    <View
      testID={testID}
      style={[
        styles.header,
        {
          paddingTop: topInset ? insets.top + SPACING.sm : SPACING.sm,
          paddingLeft: Math.max(insets.left, SPACING.page),
          paddingRight: Math.max(insets.right, SPACING.page),
          backgroundColor: withAlpha(tokens.screen.background, isDark ? 0.96 : 1),
          borderBottomColor: tokens.border.subtle,
        },
      ]}
    >
      <View style={styles.sideSlot}>
        <HeaderIconButton
          accessibilityLabel={backLabel}
          icon={<ChevronLeft color={colors.primaryText} size={20} />}
          onPress={onBack}
          testID={testID ? `${testID}-back` : undefined}
        />
      </View>
      <View style={styles.identity}>
        {personaVisual ? (
          <CoachPersonaAvatar
            imageSource={personaVisual.imageSource}
            fallbackLabel={personaVisual.fallbackLabel}
            haloTint={personaVisual.haloTint}
            size={32}
            emphasis="subtle"
            testID={testID ? `${testID}-avatar` : undefined}
          />
        ) : null}
        <View style={styles.copy}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.primaryText }]}
            testID={testID ? `${testID}-title` : undefined}
          >
            {resolvedName}
          </Text>
        </View>
      </View>
      <View style={styles.sideSlot}>
        {showArchive && onArchive ? (
          <HeaderIconButton
            accessibilityLabel={archiveLabel}
            icon={<Archive color={colors.primaryText} size={20} strokeWidth={2.2} />}
            onPress={onArchive}
            testID="coach-chat-archive-button"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  sideSlot: {
    width: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: SIZES.text18,
    lineHeight: 23,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
