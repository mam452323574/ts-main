import { ComponentType, memo, ReactNode, useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { AlertCircle, Check, X } from 'lucide-react-native';

import { BORDER_RADIUS, FONT_FAMILIES, SHADOWS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthPalette } from '@/components/auth/tokens';

export type AuthInputStatus = 'idle' | 'checking' | 'success' | 'error' | 'info';

interface IconComponentProps {
  size: number;
  color: string;
}

interface RightAction {
  icon: ComponentType<IconComponentProps>;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

interface AuthInputProps {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  icon?: ComponentType<IconComponentProps>;
  status?: AuthInputStatus;
  statusMessage?: string;
  rightAction?: RightAction;
  rightAccessory?: ReactNode;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: any;
  autoCorrect?: boolean;
  testID?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  editable?: boolean;
  selectTextOnFocus?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

function AuthInputBase({
  label,
  value,
  onChangeText,
  placeholder,
  icon: Icon,
  status = 'idle',
  statusMessage,
  rightAction,
  rightAccessory,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  autoCorrect = false,
  testID,
  containerStyle,
  inputStyle,
  editable = true,
  selectTextOnFocus,
  maxLength,
  onFocus,
  onBlur,
}: AuthInputProps) {
  const { colors } = useTheme();
  const palette = useAuthPalette();
  const styles = useMemo(
    () => createStyles(colors, palette),
    [colors, palette],
  );

  // iOS Expo Go SDK 54+ : un setState dans onFocus déclenche un re-render
  // synchrone pendant que iOS établit le focus du TextInput, ce qui fait perdre
  // le focus (le clavier flash puis disparaît). On supprime donc le state
  // focused interne. Le visuel "border highlight au focus" est sacrifié au
  // profit d'un clavier qui s'ouvre. Pour le ré-introduire plus tard sans
  // bug, utiliser Animated.Value (animation native, sans re-render JS).
  const showError = status === 'error';
  const containerStateStyle = [
    styles.container,
    showError && styles.containerError,
    !editable && styles.containerDisabled,
    containerStyle,
  ];

  const statusColor =
    status === 'error'
      ? colors.error
      : status === 'success'
        ? colors.success
        : status === 'info'
          ? colors.gray
          : colors.gray;

  const renderStatusIcon = () => {
    if (rightAction) return null;
    if (status === 'checking') {
      return <ActivityIndicator size="small" color={colors.gray} />;
    }
    if (status === 'success') {
      return <Check color={colors.success} size={18} />;
    }
    if (status === 'error') {
      return <X color={colors.error} size={18} />;
    }
    if (status === 'info') {
      return <AlertCircle color={colors.gray} size={18} />;
    }
    return null;
  };

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={containerStateStyle}>
        {Icon ? (
          <View style={styles.iconLeft}>
            <Icon color={colors.gray} size={20} />
          </View>
        ) : null}
        <TextInput
          style={[styles.input, inputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.gray}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={autoCorrect}
          editable={editable}
          selectTextOnFocus={selectTextOnFocus}
          maxLength={maxLength}
          onFocus={onFocus}
          onBlur={onBlur}
          testID={testID}
        />
        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
        {rightAction ? (
          <TouchableOpacity
            onPress={rightAction.onPress}
            style={styles.rightAction}
            testID={rightAction.testID}
            accessibilityLabel={rightAction.accessibilityLabel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <rightAction.icon color={colors.gray} size={20} />
          </TouchableOpacity>
        ) : (
          <View style={styles.rightStatus}>{renderStatusIcon()}</View>
        )}
      </View>
      {statusMessage ? (
        <Text style={[styles.statusMessage, { color: statusColor }]}>
          {statusMessage}
        </Text>
      ) : null}
    </View>
  );
}

// memo pour éviter qu'un re-render parent (changement de state du form, theme,
// etc.) provoque un re-render de tous les TextInput. Sur iOS Expo Go SDK 54+,
// un re-render rapide pendant le focus initial peut faire perdre le focus au
// TextInput (le clavier flash puis disparaît). Le memo réduit la surface.
export const AuthInput = memo(AuthInputBase);

const createStyles = (colors: any, palette: ReturnType<typeof useAuthPalette>) =>
  StyleSheet.create({
    wrapper: {
      gap: SPACING.xs,
    },
    label: {
      fontSize: SIZES.text12,
      fontWeight: '700',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: withAlpha(colors.gray, 0.92),
      marginLeft: SPACING.xs,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 60,
      backgroundColor: palette.surfaceGlass,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: palette.secondaryActionBorder,
      paddingHorizontal: SPACING.md,
      ...SHADOWS.soft,
      shadowColor: palette.shadowColor,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    containerError: {
      borderColor: withAlpha(colors.error, 0.5),
      backgroundColor: withAlpha(colors.error, 0.08),
    },
    containerDisabled: {
      opacity: 0.6,
    },
    iconLeft: {
      width: 24,
      alignItems: 'center',
      marginRight: SPACING.sm,
    },
    input: {
      flex: 1,
      fontSize: SIZES.md,
      fontFamily: FONT_FAMILIES.body,
      color: colors.primaryText,
      paddingVertical: SPACING.md,
    },
    rightStatus: {
      width: 22,
      alignItems: 'flex-end',
      marginLeft: SPACING.xs,
    },
    rightAction: {
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xs,
      marginLeft: SPACING.xs,
    },
    rightAccessory: {
      marginLeft: SPACING.xs,
    },
    statusMessage: {
      fontSize: SIZES.text12,
      fontWeight: '500',
      marginLeft: SPACING.xs,
      marginTop: SPACING.xs,
      lineHeight: 18,
    },
  });
