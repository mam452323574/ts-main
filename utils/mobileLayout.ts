import { Platform, type KeyboardAvoidingViewProps } from 'react-native';

interface KeyboardSafeFooterPaddingOptions {
  bottomInset: number;
  restingPadding: number;
  keyboardPadding: number;
  keyboardVisible: boolean;
  minimumInsetPadding?: number;
}

export function getMinimumBottomInsetPadding(
  bottomInset: number,
  minimumPadding = 0
) {
  return Platform.OS === 'android'
    ? Math.max(bottomInset, minimumPadding)
    : bottomInset;
}

export function getKeyboardAvoidingViewBehavior():
  KeyboardAvoidingViewProps['behavior'] {
  return Platform.OS === 'ios' ? 'padding' : 'height';
}

export function getKeyboardSafeFooterPadding({
  bottomInset,
  restingPadding,
  keyboardPadding,
  keyboardVisible,
  minimumInsetPadding = 0,
}: KeyboardSafeFooterPaddingOptions) {
  if (keyboardVisible) {
    return keyboardPadding;
  }

  return (
    getMinimumBottomInsetPadding(bottomInset, minimumInsetPadding) +
    restingPadding
  );
}
