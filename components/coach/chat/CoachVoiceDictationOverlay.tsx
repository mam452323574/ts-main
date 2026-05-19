import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, Mic, Send, Trash2 } from 'lucide-react-native';

import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export interface CoachVoiceDictationOverlayProps {
  visible: boolean;
  interimTranscript?: string;
  cancelHint: string;
  sendLabel: string;
  timerA11yLabel?: (seconds: number) => string;
  onCancel: () => void;
  onConfirm: () => void;
  canConfirm?: boolean;
  testID?: string;
}

const CANCEL_THRESHOLD = -90;
const WAVE_BAR_COUNT = 5;

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function CoachVoiceDictationOverlayComponent({
  visible,
  interimTranscript,
  cancelHint,
  sendLabel,
  timerA11yLabel,
  onCancel,
  onConfirm,
  canConfirm = true,
  testID = 'coach-voice-overlay',
}: CoachVoiceDictationOverlayProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [elapsed, setElapsed] = useState(0);
  const dragX = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const waveValues = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(0.3)),
  ).current;

  // Timer
  useEffect(() => {
    if (!visible) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [visible]);

  // Red dot pulse
  useEffect(() => {
    if (!visible) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, visible]);

  // Waveform bars
  useEffect(() => {
    if (!visible) {
      waveValues.forEach((v) => v.setValue(0.3));
      return;
    }
    const animations = waveValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 90),
          Animated.timing(value, {
            toValue: 1,
            duration: 360,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 360,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [visible, waveValues]);

  // Reset slide position when overlay opens
  useEffect(() => {
    if (visible) {
      dragX.setValue(0);
    }
  }, [dragX, visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          const next = Math.min(0, gesture.dx);
          dragX.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= CANCEL_THRESHOLD) {
            onCancel();
            return;
          }
          Animated.timing(dragX, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.timing(dragX, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        },
      }),
    [dragX, onCancel],
  );

  if (!visible) return null;

  const timerText = formatTimer(elapsed);
  const a11yTimer = timerA11yLabel?.(elapsed) ?? timerText;

  return (
    <Squircle style={styles.shell} testID={testID}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelHint}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.iconButton,
            styles.iconButtonDanger,
            pressed ? styles.iconButtonPressed : null,
          ]}
          testID={`${testID}-cancel`}
        >
          <Trash2 color={colors.white} size={20} strokeWidth={2.2} />
        </Pressable>

        <Animated.View
          style={[
            styles.recordingArea,
            { transform: [{ translateX: dragX }] },
          ]}
          {...panResponder.panHandlers}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.pulseRow}>
            <Animated.View
              style={[
                styles.pulseDot,
                {
                  opacity: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.45, 1],
                  }),
                  transform: [
                    {
                      scale: pulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1.15],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Text
              style={styles.timer}
              accessibilityLabel={a11yTimer}
              testID={`${testID}-timer`}
            >
              {timerText}
            </Text>
            <View style={styles.waveRow}>
              {waveValues.map((value, idx) => (
                <Animated.View
                  key={idx}
                  style={[
                    styles.waveBar,
                    {
                      transform: [
                        {
                          scaleY: value,
                        },
                      ],
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={styles.hintRow}>
            <ChevronLeft
              color={withAlpha(colors.primaryText, 0.55)}
              size={14}
              strokeWidth={2.2}
            />
            <Text style={styles.hintText} numberOfLines={1}>
              {cancelHint}
            </Text>
          </View>

          {interimTranscript ? (
            <Text
              style={styles.interim}
              numberOfLines={2}
              testID={`${testID}-interim`}
            >
              {interimTranscript}
            </Text>
          ) : (
            <View style={styles.interimPlaceholder}>
              <Mic
                color={withAlpha(colors.primaryText, 0.3)}
                size={12}
                strokeWidth={2.2}
              />
            </View>
          )}
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: !canConfirm }}
          disabled={!canConfirm}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.iconButton,
            styles.iconButtonPrimary,
            !canConfirm ? styles.iconButtonDisabled : null,
            pressed && canConfirm ? styles.iconButtonPressed : null,
          ]}
          testID={`${testID}-confirm`}
        >
          <Send color={colors.white} size={20} strokeWidth={2.4} />
        </Pressable>
      </View>
    </Squircle>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    shell: {
      backgroundColor: colors.cardBackground,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonDanger: {
      backgroundColor: '#D9534F',
    },
    iconButtonPrimary: {
      backgroundColor: colors.primary,
    },
    iconButtonDisabled: {
      backgroundColor: withAlpha(colors.primaryText, 0.2),
    },
    iconButtonPressed: {
      opacity: 0.85,
    },
    recordingArea: {
      flex: 1,
      paddingHorizontal: SPACING.sm,
      gap: SPACING.xs,
    },
    pulseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    pulseDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#D9534F',
    },
    timer: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      minWidth: 44,
    },
    waveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      flex: 1,
      height: 18,
    },
    waveBar: {
      width: 3,
      height: 18,
      borderRadius: 2,
      backgroundColor: withAlpha(colors.primary, 0.7),
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    hintText: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.55),
      fontWeight: FONT_WEIGHTS.medium,
    },
    interim: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.7),
      fontStyle: 'italic',
    },
    interimPlaceholder: {
      height: 14,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
  });

export const CoachVoiceDictationOverlay = memo(CoachVoiceDictationOverlayComponent);
