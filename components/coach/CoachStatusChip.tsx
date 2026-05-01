import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
} from 'lucide-react-native';

import { CoachFeatureIcon } from '@/components/FeatureIcons';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SPACING,
  withAlpha,
} from '@/constants/theme';

export type CoachStatusChipState =
  | 'ready'
  | 'fresh'
  | 'generating'
  | 'error'
  | 'empty';

interface CoachStatusChipProps {
  state: CoachStatusChipState;
  label: string;
  testID?: string;
}

export function CoachStatusChip({
  state,
  label,
  testID = 'coach-status-chip',
}: CoachStatusChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const tint = resolveTint(state, colors);

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      style={[styles.chip, { backgroundColor: withAlpha(tint, 0.12) }]}
      testID={testID}
    >
      <StatusIcon state={state} tint={tint} />
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatusIcon({
  state,
  tint,
}: {
  state: CoachStatusChipState;
  tint: string;
}) {
  switch (state) {
    case 'generating':
      return <ActivityIndicator color={tint} size="small" />;
    case 'fresh':
      return <CoachFeatureIcon color={tint} size={13} strokeWidth={2.4} />;
    case 'error':
      return <AlertTriangle color={tint} size={13} strokeWidth={2.4} />;
    case 'empty':
      return <Inbox color={tint} size={13} strokeWidth={2.4} />;
    case 'ready':
    default:
      return <CheckCircle2 color={tint} size={13} strokeWidth={2.4} />;
  }
}

function resolveTint(state: CoachStatusChipState, colors: any) {
  switch (state) {
    case 'fresh':
    case 'generating':
      return colors.primary;
    case 'error':
      return colors.warning;
    case 'empty':
      return colors.gray;
    case 'ready':
    default:
      return colors.success ?? colors.primary;
  }
}

const createStyles = (_colors: any) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs + 1,
      borderRadius: BORDER_RADIUS.full,
      alignSelf: 'flex-start',
      maxWidth: '100%',
    },
    label: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.25,
    },
  });
