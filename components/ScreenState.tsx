import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { AlertCircle, CheckCircle2, Info, RefreshCw } from 'lucide-react-native';

import { Button } from '@/components/Button';
import { Surface } from '@/components/Surface';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  type SurfaceVariant,
  getThemeTokens,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type ScreenStateTone = 'loading' | 'empty' | 'error' | 'success' | 'info' | 'unavailable';
type ScreenStateLayout = 'full' | 'card' | 'inline';

interface ScreenStateProps {
  tone?: ScreenStateTone;
  layout?: ScreenStateLayout;
  title?: string;
  message?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  surfaceVariant?: SurfaceVariant;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  messageStyle?: StyleProp<TextStyle>;
  testID?: string;
  actionTestID?: string;
  secondaryActionTestID?: string;
}

export function ScreenState({
  tone = 'info',
  layout = 'card',
  title,
  message,
  icon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  surfaceVariant,
  style,
  contentStyle,
  titleStyle,
  messageStyle,
  testID,
  actionTestID,
  secondaryActionTestID,
}: ScreenStateProps) {
  const { colors, isDark } = useTheme();
  const tokens = getThemeTokens(isDark);
  const accentColor =
    tone === 'error'
      ? colors.error
      : tone === 'success'
        ? tokens.success.accent
        : tone === 'unavailable'
          ? tokens.premium.accent
          : colors.primary;
  const resolvedSurfaceVariant =
    surfaceVariant ??
    (tone === 'error'
      ? 'danger'
      : tone === 'success'
        ? 'success'
        : tone === 'loading' || tone === 'empty'
          ? 'raised'
          : 'inset');

  const renderIcon = () => {
    if (tone === 'loading') {
      return <ActivityIndicator color={accentColor} size="small" testID="screen-state-loading-indicator" />;
    }

    const iconElement =
      icon ??
      (tone === 'error' ? (
        <AlertCircle />
      ) : tone === 'success' ? (
        <CheckCircle2 />
      ) : tone === 'unavailable' ? (
        <RefreshCw />
      ) : (
        <Info />
      ));

    if (React.isValidElement(iconElement) && typeof iconElement.type !== 'string') {
      return React.cloneElement(iconElement as React.ReactElement<{ color?: string; size?: number }>, {
        color: accentColor,
        size: 24,
      });
    }

    return iconElement;
  };

  const body = (
    <Surface
      variant={resolvedSurfaceVariant}
      accentColor={accentColor}
      padded
      shadow={layout !== 'inline' && resolvedSurfaceVariant !== 'inset'}
      style={[
        styles.surface,
        layout === 'full' ? styles.surfaceFull : null,
        style,
      ]}
      testID={testID}
    >
      <View style={[styles.content, contentStyle]}>
        <View
          style={[
            styles.iconShell,
            {
              backgroundColor: tokens.surfaceMuted.base,
              borderColor: tokens.border.subtle,
            },
          ]}
        >
          {renderIcon()}
        </View>

        {title ? (
          <Text style={[styles.title, { color: colors.primaryText }, titleStyle]}>{title}</Text>
        ) : null}
        {message ? (
          <Text style={[styles.message, { color: colors.textMuted ?? colors.gray }, messageStyle]}>
            {message}
          </Text>
        ) : null}

        {actionLabel && onAction ? (
          <View style={styles.action}>
            <Button title={actionLabel} onPress={onAction} testID={actionTestID} />
          </View>
        ) : null}
        {secondaryActionLabel && onSecondaryAction ? (
          <Button
            title={secondaryActionLabel}
            variant="ghost"
            onPress={onSecondaryAction}
            testID={secondaryActionTestID}
          />
        ) : null}
      </View>
    </Surface>
  );

  if (layout !== 'full') {
    return body;
  }

  return <View style={[styles.fullHost, { backgroundColor: colors.background }]}>{body}</View>;
}

const styles = StyleSheet.create({
  fullHost: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.page,
  },
  surface: {
    alignSelf: 'stretch',
  },
  surfaceFull: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  content: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconShell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: SIZES.text18,
    lineHeight: 23,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  message: {
    fontSize: SIZES.text14,
    lineHeight: 21,
    fontWeight: FONT_WEIGHTS.medium,
    textAlign: 'center',
  },
  action: {
    alignSelf: 'stretch',
    marginTop: SPACING.xs,
  },
});
