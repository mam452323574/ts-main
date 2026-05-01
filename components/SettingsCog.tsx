import { useMemo } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';

export function SettingsCog() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = () => {
    router.push('/settings');
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Settings color={colors.primaryText} size={24} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    padding: 8,
    marginRight: 8,
  },
});
