import { useMemo, useRef } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';

import { BORDER_RADIUS, SHADOWS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthPalette } from '@/components/auth/tokens';

interface AuthOTPInputProps {
  length?: number;
  value: string[];
  onChange: (next: string[]) => void;
  error?: boolean;
  autoFocus?: boolean;
  testIDPrefix?: string;
}

export function AuthOTPInput({
  length = 6,
  value,
  onChange,
  error,
  autoFocus = true,
  testIDPrefix = 'otp',
}: AuthOTPInputProps) {
  const { colors } = useTheme();
  const palette = useAuthPalette();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const styles = useMemo(
    () => createStyles(colors, palette, error),
    [colors, palette, error],
  );

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const next = [...value];
    const current = value[index] ?? '';

    if (text.length === 2 && current && text.startsWith(current)) {
      const replacement = cleaned.slice(-1);
      next[index] = replacement;
      onChange(next);
      if (replacement && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }

    if (cleaned.length > 1) {
      const chars = cleaned.split('').slice(0, length);
      const startIndex = chars.length >= length ? 0 : index;
      for (let i = 0; i < chars.length; i += 1) {
        const target = startIndex + i;
        if (target < length) {
          next[target] = chars[i];
        }
      }
      onChange(next);
      const lastFilled = Math.min(startIndex + chars.length - 1, length - 1);
      const focusTarget = lastFilled < length - 1 ? lastFilled + 1 : lastFilled;
      inputRefs.current[focusTarget]?.focus();
      return;
    }

    next[index] = cleaned;
    onChange(next);

    if (cleaned && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, index) => {
        const digit = value[index] ?? '';
        return (
          <TextInput
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            style={[
              styles.cell,
              digit ? styles.cellFilled : null,
              error ? styles.cellError : null,
            ]}
            value={digit}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(event) => handleKeyPress(event, index)}
            keyboardType="number-pad"
            selectTextOnFocus
            autoFocus={autoFocus && index === 0}
            maxLength={length}
            textContentType={index === 0 ? 'oneTimeCode' : 'none'}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            testID={`${testIDPrefix}-${index}`}
          />
        );
      })}
    </View>
  );
}

const createStyles = (
  colors: any,
  palette: ReturnType<typeof useAuthPalette>,
  error?: boolean,
) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    cell: {
      width: 48,
      height: 60,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: palette.accentSofter,
      textAlign: 'center',
      fontSize: SIZES.xl,
      fontWeight: '700',
      color: colors.primaryText, borderCurve: 'continuous',
    },
    cellFilled: {
      borderColor: palette.accentRing,
      backgroundColor: palette.accentSoft,
      ...SHADOWS.soft,
    },
    cellError: {
      borderColor: withAlpha(colors.error, 0.5),
      backgroundColor: withAlpha(colors.error, 0.06),
    },
  });
