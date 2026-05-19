import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

type HapticMessageArrivedOptions = {
  reduceMotion?: boolean;
};

/**
 * Fires a subtle haptic once when a fresh coach response starts to appear.
 * Silently no-ops when reduce motion is on, on web, or if the native module
 * rejects — haptics are optional polish, never critical to the flow.
 */
export function hapticMessageArrived(
  options: HapticMessageArrivedOptions = {},
) {
  if (options.reduceMotion) return;
  if (Platform.OS === 'web') return;

  try {
    const feedback = Haptics.selectionAsync();
    if (feedback && typeof feedback.catch === 'function') {
      void feedback.catch(() => undefined);
    }
  } catch {
    // Haptics are optional polish; ignore native module failures.
  }
}
