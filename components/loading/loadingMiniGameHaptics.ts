import * as Haptics from 'expo-haptics';

type LoadingMiniGameHapticKind = 'success' | 'bonus' | 'miss';

export function triggerLoadingMiniGameHaptic(kind: LoadingMiniGameHapticKind) {
  try {
    const feedback =
      kind === 'bonus'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : Haptics.selectionAsync();

    if (feedback && typeof feedback.catch === 'function') {
      void feedback.catch(() => undefined);
    }
  } catch {
    // Haptics are optional polish; gameplay must continue if the native module fails.
  }
}
