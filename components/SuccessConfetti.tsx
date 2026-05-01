import { useRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';

interface SuccessConfettiProps {
  active: boolean;
  onAnimationEnd?: () => void;
}

const { width, height } = Dimensions.get('window');

export function SuccessConfetti({ active, onAnimationEnd }: SuccessConfettiProps) {
  const confettiRef = useRef<any>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (active && confettiRef.current) {
      confettiRef.current.start();
      timeoutId = setTimeout(() => {
        onAnimationEnd?.();
      }, 3000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [active, onAnimationEnd]);

  if (!active) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <ConfettiCannon
        ref={confettiRef}
        count={100}
        origin={{ x: width / 2, y: height / 2 }}
        autoStart={false}
        fadeOut={true}
        explosionSpeed={350}
        fallSpeed={2500}
        colors={['#1E3A2B', '#A8E063', '#2A5441', '#FFD700', '#FF6B6B']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});
