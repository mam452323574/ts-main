import { memo, useMemo, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Mic, MicOff, Send } from 'lucide-react-native';

import { Squircle } from '@/components/Squircle';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export interface CoachChatComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  sendLabel: string;
  disabled?: boolean;
  busy?: boolean;
  maxLength?: number;
  warnAt?: number;
  counterLabel?: (count: number, max: number) => string;
  micEnabled?: boolean;
  isListening?: boolean;
  micUnavailableLabel?: string | null;
  micA11yLabel?: string;
  onPressMic?: () => void;
  renderRecordingOverlay?: () => ReactNode;
  testID?: string;
}

function CoachChatComposerComponent({
  value,
  onChangeText,
  onSend,
  placeholder,
  sendLabel,
  disabled = false,
  busy = false,
  maxLength = 2000,
  warnAt = 1500,
  counterLabel,
  micEnabled = false,
  isListening = false,
  micUnavailableLabel = null,
  micA11yLabel,
  onPressMic,
  renderRecordingOverlay,
  testID = 'coach-chat-composer',
}: CoachChatComposerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputRef = useRef<TextInput>(null);

  const trimmed = value.trim();
  const canSend = !disabled && !busy && trimmed.length > 0;
  const showCounter = value.length >= warnAt;
  const counterText = counterLabel
    ? counterLabel(value.length, maxLength)
    : `${value.length}/${maxLength}`;

  if (isListening && renderRecordingOverlay) {
    return <View testID={`${testID}-overlay-host`}>{renderRecordingOverlay()}</View>;
  }

  return (
    <Squircle style={styles.shell} testID={testID}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={micA11yLabel ?? 'Microphone'}
          accessibilityState={{ disabled: !micEnabled || disabled, selected: isListening }}
          disabled={!micEnabled || disabled || busy}
          onPress={onPressMic}
          style={({ pressed }) => [
            styles.micButton,
            !micEnabled ? styles.micButtonDisabled : null,
            isListening ? styles.micButtonActive : null,
            pressed && micEnabled ? styles.micButtonPressed : null,
          ]}
          testID={`${testID}-mic-button`}
        >
          {micEnabled ? (
            <Mic
              color={isListening ? colors.white : colors.primary}
              size={20}
              strokeWidth={2.2}
            />
          ) : (
            <MicOff
              color={withAlpha(colors.primaryText, 0.4)}
              size={20}
              strokeWidth={2.2}
            />
          )}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={withAlpha(colors.primaryText, 0.4)}
          editable={!disabled && !busy}
          multiline
          style={styles.input}
          maxLength={maxLength}
          testID={`${testID}-input`}
          accessibilityLabel={placeholder}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => {
            if (!canSend) return;
            onSend();
          }}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend ? styles.sendButtonDisabled : null,
            pressed && canSend ? styles.sendButtonPressed : null,
          ]}
          testID={`${testID}-send-button`}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} size="small" testID={`${testID}-send-spinner`} />
          ) : (
            <Send color={colors.white} size={18} strokeWidth={2.4} />
          )}
        </Pressable>
      </View>
      <View style={styles.footerRow}>
        {micUnavailableLabel && !micEnabled ? (
          <Text style={styles.footerText} testID={`${testID}-mic-unavailable`}>
            {micUnavailableLabel}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {showCounter ? (
          <Text style={styles.counter} testID={`${testID}-counter`}>
            {counterText}
          </Text>
        ) : null}
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
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
      gap: SPACING.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: SPACING.sm,
    },
    micButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.24),
    },
    micButtonDisabled: {
      backgroundColor: withAlpha(colors.primaryText, 0.05),
      borderColor: withAlpha(colors.primaryText, 0.08),
    },
    micButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primaryDark ?? colors.primary,
    },
    micButtonPressed: {
      opacity: 0.85,
    },
    input: {
      flex: 1,
      maxHeight: 140,
      minHeight: 40,
      paddingTop: 10,
      paddingBottom: 10,
      paddingHorizontal: SPACING.sm,
      fontSize: SIZES.text16,
      lineHeight: 22,
      color: colors.primaryText,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendButtonDisabled: {
      backgroundColor: withAlpha(colors.primaryText, 0.18),
    },
    sendButtonPressed: {
      opacity: 0.9,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.sm,
    },
    footerText: {
      flex: 1,
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.45),
    },
    counter: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.primaryText, 0.55),
      fontWeight: FONT_WEIGHTS.semiBold,
    },
  });

export const CoachChatComposer = memo(CoachChatComposerComponent);
