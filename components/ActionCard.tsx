import { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS, SHADOWS } from '@/constants/theme';
import { Squircle } from '@/components/Squircle';

interface ActionCardProps {
  title: string;
  icon: LucideIcon;
  onPress: () => void;
}

export function ActionCard({ title, icon: Icon, onPress }: ActionCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Squircle style={styles.container}>
        <Icon color={colors.primary} size={48} strokeWidth={2} />
        <Text style={styles.title}>{title}</Text>
      </Squircle>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.borderSubtle ?? colors.lightGray,
    borderRadius: BORDER_RADIUS.card,
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 1,
    flex: 1,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.card, borderCurve: 'continuous',
  },
  title: {
    fontSize: SIZES.text16,
    color: colors.primaryText,
    fontWeight: FONT_WEIGHTS.semiBold,
    textAlign: 'center',
    marginTop: SPACING.card,
    textTransform: 'lowercase',
  },
});
