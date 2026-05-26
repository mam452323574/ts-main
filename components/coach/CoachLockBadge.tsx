import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Crown, Lock } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  mixColors,
  SPACING,
  withAlpha,
} from '@/constants/theme';

interface CoachLockBadgeProps {
  label?: string;
  /**
   * Container styling — typically used by callers to position the badge
   * (`{ position: 'absolute', top, right }`, `alignSelf: 'flex-end'`, …).
   * The badge's own visual styling (background, border, padding) stays
   * encapsulated.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Parent testID. The badge itself gets `${testID}-lock-badge`, the crown
   * `${testID}-lock-crown`, and the lock glyph `${testID}-lock-icon` — the
   * naming convention all existing Coach tests already expect.
   */
  testID?: string;
}

function CoachLockBadgeComponent({ label, style, testID }: CoachLockBadgeProps) {
  const { colors, isDark } = useTheme();
  const goldColor = colors.gold ?? '#FFD700';
  const goldLight = colors.goldLight ?? '#FFF8E1';
  const backgroundColor = mixColors(
    goldLight,
    colors.background,
    isDark ? 0.68 : 0.12,
  );
  const borderColor = withAlpha(goldColor, 0.34);

  return (
    <View
      pointerEvents="none"
      style={[styles.badge, { backgroundColor, borderColor }, style]}
      testID={testID ? `${testID}-lock-badge` : undefined}
    >
      <Crown
        color={goldColor}
        fill={goldColor}
        size={12}
        testID={testID ? `${testID}-lock-crown` : undefined}
      />
      <Lock
        color={goldColor}
        size={12}
        testID={testID ? `${testID}-lock-icon` : undefined}
      />
      {label ? (
        <Text style={[styles.label, { color: goldColor }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  label: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export const CoachLockBadge = memo(CoachLockBadgeComponent);
