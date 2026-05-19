import { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, Animated } from 'react-native';
import { SPACING } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Squircle } from '@/components/Squircle';

export function ModalHandle() {
  const { isDark } = useTheme();
   
  const styles = useMemo(() => createStyles(isDark), [isDark]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Squircle style={styles.handle} />
    </Animated.View>
  );
}

const createStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)', borderCurve: 'continuous',
  },
});
