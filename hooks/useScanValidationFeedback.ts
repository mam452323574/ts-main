import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function useScanValidationFeedback() {
  const playValidationFeedback = useCallback(async () => {
    try {
      if (Platform.OS === 'android' && Haptics.performAndroidHapticsAsync) {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
      } else {
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Soft ?? Haptics.ImpactFeedbackStyle.Light
        );
      }
    } catch {
      // Ignore unsupported haptic capabilities so capture stays responsive.
    }
  }, []);

  return { playValidationFeedback };
}
