import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns whether the user has enabled "Reduce Motion" in OS accessibility
 * settings (iOS: Réglages → Accessibilité → Mouvement ; Android: Paramètres
 * → Accessibilité → Supprimer les animations). Updates reactively when the
 * user toggles the preference while the app is running.
 *
 * Animations gated on this flag should fall back to a static (or near-static)
 * presentation. The initial render returns `false` until the async query
 * resolves; this is a deliberate choice so the default UX keeps animations
 * enabled when the platform check is unavailable (e.g. web).
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {
        // Platform doesn't expose the preference — keep the default (false).
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        setReduceMotion(enabled);
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
