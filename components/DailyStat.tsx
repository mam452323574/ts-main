import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';

interface DailyStatProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
}

export function DailyStat({ label, current, goal, unit }: DailyStatProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const percentage = Math.min((current / goal) * 100, 100);

  return (
    <View style={styles.container}>
      <View style={styles.textRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {current} / {goal} {unit}
        </Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  textRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: SIZES.text16,
    color: colors.primaryText,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  value: {
    fontSize: SIZES.text14,
    color: colors.primaryText,
    fontWeight: FONT_WEIGHTS.regular,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.lightGray,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accentGreen,
    borderRadius: BORDER_RADIUS.full,
  },
});
