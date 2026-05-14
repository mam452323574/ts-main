import { ReactNode, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { getKeyboardAvoidingViewBehavior } from '@/utils/mobileLayout';

interface AppScreenProps {
  children: ReactNode;
  scroll?: boolean;
  keyboard?: boolean;
  topInset?: boolean;
  bottomInset?: boolean;
  keyboardVerticalOffset?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AppScreen({
  children,
  scroll = false,
  keyboard = false,
  topInset = true,
  bottomInset = true,
  keyboardVerticalOffset = 0,
  contentContainerStyle,
  style,
  testID,
}: AppScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const insetStyle = useMemo(
    () => ({
      paddingTop: topInset ? insets.top : 0,
      paddingBottom: bottomInset ? insets.bottom : 0,
    }),
    [bottomInset, insets.bottom, insets.top, topInset]
  );

  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, insetStyle, contentContainerStyle],
    [contentContainerStyle, insetStyle]
  );

  const contentStyle = useMemo(
    () => [styles.content, insetStyle, contentContainerStyle],
    [contentContainerStyle, insetStyle]
  );

  // iOS Expo Go SDK 54+: KeyboardAvoidingView (behavior="padding") combiné à un
  // ScrollView vole le focus du TextInput dès le tap (le clavier flash puis
  // disparaît). On utilise donc automaticallyAdjustKeyboardInsets sur le
  // ScrollView pour iOS, qui gère nativement l'inset bottom sans wrapper. Le
  // KeyboardAvoidingView reste actif sur Android (où le bug ne se manifeste
  // pas et où automaticallyAdjustKeyboardInsets n'est pas supporté), et reste
  // utilisé sur iOS uniquement quand scroll=false.
  const useScrollKeyboardInsetsOnIOS = scroll && Platform.OS === 'ios';

  let body = scroll ? (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={scrollContentStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      automaticallyAdjustKeyboardInsets={useScrollKeyboardInsetsOnIOS}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={contentStyle}>{children}</View>
  );

  if (keyboard && !useScrollKeyboardInsetsOnIOS) {
    body = (
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={getKeyboardAvoidingViewBehavior()}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: colors.background }, style]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
  },
});
