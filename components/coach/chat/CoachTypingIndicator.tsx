import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';

interface CoachTypingIndicatorProps {
  /**
   * Drives the entrance/exit animation. When this flips to `false` the
   * container fades out (or snaps when reduce motion is on) and `onExited`
   * fires once the fade-out is complete. Defaults to `true` so call sites
   * that still mount/unmount directly keep working unchanged.
   */
  visible?: boolean;
  /** Fired after the exit fade-out completes — parents use it to unmount. */
  onExited?: () => void;
  /**
   * Coach persona currently speaking. When provided, the indicator renders
   * with the persona's avatar on the left, matching the assistant bubble
   * grid in `CoachMessageBubble`. Falsy values render a 40px spacer so the
   * bubble stays aligned with assistant messages.
   */
  personaKey?: CoachPersonaKey | null;
  testID?: string;
}

// Animation tuning — exposed as constants so QA tweaks are localised.
const CYCLE_HALF_MS = 320; // rise OR fall — full cycle = 640ms
const STAGGER_MS = 140; // delay between consecutive dots
const TRANSLATE_Y_PX = -5;
const SCALE_MIN = 0.85;
const SCALE_MAX = 1;
const OPACITY_MIN = 0.35;
const OPACITY_MAX = 1;
const ENTRANCE_FADE_MS = 220;
const EXIT_FADE_MS = 140;

export function CoachTypingIndicator({
  visible = true,
  onExited,
  personaKey,
  testID,
}: CoachTypingIndicatorProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const personaVisual = personaKey ? getCoachPersonaVisual(personaKey) : null;

  const dotValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;
  // Keep the latest onExited reachable from inside Animated callbacks without
  // re-running the effect whenever the parent passes a new closure.
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (reduceMotion) {
      // Reduce Motion: no fades, no loops — snap to the target visibility.
      dotValues.forEach((value) => value.setValue(0));
      containerOpacity.setValue(visible ? 1 : 0);
      if (!visible) {
        // Defer to the next frame so the parent's setState in onExited
        // doesn't fire during this render cycle.
        const handle = requestAnimationFrame(() => onExitedRef.current?.());
        return () => cancelAnimationFrame(handle);
      }
      return;
    }

    if (!visible) {
      // Exit: stop the dot loops at their current value and fade the
      // container out, then notify the parent so it can unmount.
      dotValues.forEach((value) => value.stopAnimation());
      const exit = Animated.timing(containerOpacity, {
        toValue: 0,
        duration: EXIT_FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      exit.start(({ finished }) => {
        if (finished) onExitedRef.current?.();
      });
      return () => {
        exit.stop();
      };
    }

    containerOpacity.setValue(0);

    const buildLoop = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: CYCLE_HALF_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: CYCLE_HALF_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );

    const entrance = Animated.timing(containerOpacity, {
      toValue: 1,
      duration: ENTRANCE_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    const loops = dotValues.map((value, index) =>
      buildLoop(value, index * STAGGER_MS),
    );

    entrance.start();
    loops.forEach((loop) => loop.start());

    return () => {
      entrance.stop();
      loops.forEach((loop) => loop.stop());
    };
  }, [reduceMotion, visible, dotValues, containerOpacity]);

  return (
    <Animated.View
      style={[styles.row, { opacity: containerOpacity }]}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel="Le coach réfléchit"
    >
      {personaVisual ? (
        <View style={styles.avatar}>
          <CoachPersonaAvatar
            imageSource={personaVisual.imageSource}
            fallbackLabel={personaVisual.fallbackLabel}
            haloTint={personaVisual.haloTint}
            size={32}
            emphasis="subtle"
          />
        </View>
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <View style={styles.contentColumn}>
        <Squircle style={styles.bubble}>
          {dotValues.map((value, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                reduceMotion
                  ? null
                  : {
                      opacity: value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [OPACITY_MIN, OPACITY_MAX],
                      }),
                      transform: [
                        {
                          translateY: value.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, TRANSLATE_Y_PX],
                          }),
                        },
                        {
                          scale: value.interpolate({
                            inputRange: [0, 1],
                            outputRange: [SCALE_MIN, SCALE_MAX],
                          }),
                        },
                      ],
                    },
              ]}
            />
          ))}
        </Squircle>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    // Horizontal padding is intentionally absent — the FlatList's
    // `listContent` (paddingHorizontal: SPACING.page) already aligns the row
    // with the assistant message bubbles below.
    row: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingVertical: SPACING.xs,
      gap: SPACING.xs,
    },
    avatar: {
      width: 40,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    avatarSpacer: {
      width: 40,
    },
    contentColumn: {
      flex: 1,
      maxWidth: '85%',
      alignItems: 'flex-start',
    },
    bubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: withAlpha(colors.primaryText, 0.7),
    },
  });
