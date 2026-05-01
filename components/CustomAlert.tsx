import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, Crown, Shield, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONT_WEIGHTS, mixColors, SIZES, SPACING } from '@/constants/theme';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger' | 'premium';
export type AlertButtonTone = 'solid' | 'soft' | 'ghost';

export interface CustomAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  tone?: AlertButtonTone;
}

export interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: CustomAlertButton[];
  icon?: React.ReactNode;
  emoji?: string | null;
  variant?: AlertVariant;
  dismissible?: boolean;
  buttonTones?: Partial<Record<'default' | 'cancel' | 'destructive', AlertButtonTone>>;
  onDismiss: () => void;
}

type VariantTokens = {
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  primaryButton: string;
  softButton: string;
  softText: string;
  emoji: string;
};

const getVariantTokens = (variant: AlertVariant, colors: any, isDark: boolean): VariantTokens => {
  switch (variant) {
    case 'success':
      return {
        iconColor: colors.success,
        iconBg: isDark ? 'rgba(48,209,88,0.2)' : '#EAF9EF',
        iconBorder: isDark ? 'rgba(48,209,88,0.45)' : mixColors(colors.borderSubtle ?? '#CDEED8', colors.success, 0.28),
        primaryButton: colors.success,
        softButton: isDark ? 'rgba(48,209,88,0.18)' : '#EAF9EF',
        softText: isDark ? '#8FE9AD' : '#1E7A43',
        emoji: '✅',
      };
    case 'warning':
      return {
        iconColor: colors.warning,
        iconBg: isDark ? 'rgba(255,159,10,0.2)' : '#FFF6E9',
        iconBorder: isDark ? 'rgba(255,159,10,0.45)' : mixColors(colors.borderSubtle ?? '#FFE3BF', colors.warning, 0.28),
        primaryButton: colors.warning,
        softButton: isDark ? 'rgba(255,159,10,0.18)' : '#FFF6E9',
        softText: isDark ? '#FFD08B' : '#9C6100',
        emoji: '⚠️',
      };
    case 'danger':
      return {
        iconColor: colors.error,
        iconBg: isDark ? 'rgba(255,69,58,0.2)' : '#FFEFF0',
        iconBorder: isDark ? 'rgba(255,69,58,0.45)' : mixColors(colors.borderSubtle ?? '#FFD2D5', colors.error, 0.3),
        primaryButton: colors.error,
        softButton: isDark ? 'rgba(255,69,58,0.18)' : '#FFEFF0',
        softText: isDark ? '#FFA6A1' : '#A81E2B',
        emoji: '🛟',
      };
    case 'premium':
      return {
        iconColor: '#D4A31D',
        iconBg: isDark ? 'rgba(212,163,29,0.2)' : '#FFF9EA',
        iconBorder: isDark ? 'rgba(212,163,29,0.45)' : mixColors(colors.borderSubtle ?? '#F5E4B4', '#D4A31D', 0.22),
        primaryButton: colors.primary,
        softButton: isDark ? 'rgba(212,163,29,0.16)' : '#FFF7DF',
        softText: isDark ? '#FFD676' : '#8C6A07',
        emoji: '✨',
      };
    default:
      return {
        iconColor: colors.primary,
        iconBg: isDark ? 'rgba(10,132,255,0.2)' : '#EAF3FF',
        iconBorder: isDark ? 'rgba(10,132,255,0.45)' : mixColors(colors.borderSubtle ?? '#CDE2FF', colors.primary, 0.24),
        primaryButton: colors.primary,
        softButton: isDark ? 'rgba(10,132,255,0.16)' : '#EDF5FF',
        softText: isDark ? '#90C3FF' : '#0F5EC2',
        emoji: '💡',
      };
  }
};

const inferVariant = (buttons: CustomAlertButton[] | undefined): AlertVariant => {
  if (buttons?.some((button) => button.style === 'destructive')) return 'danger';
  return 'info';
};

const renderVariantIcon = (variant: AlertVariant, color: string) => {
  switch (variant) {
    case 'success':
      return <Check color={color} size={30} strokeWidth={2.4} />;
    case 'warning':
      return <AlertTriangle color={color} size={30} strokeWidth={2.3} />;
    case 'danger':
      return <Shield color={color} size={30} strokeWidth={2.3} />;
    case 'premium':
      return <Crown color={color} size={30} strokeWidth={2.3} />;
    default:
      return <Sparkles color={color} size={30} strokeWidth={2.3} />;
  }
};

export function CustomAlert({
  visible,
  title,
  message,
  buttons,
  icon,
  emoji,
  variant,
  dismissible = true,
  buttonTones,
  onDismiss,
}: CustomAlertProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const resolvedButtons: CustomAlertButton[] = buttons && buttons.length > 0
    ? buttons
    : [{ text: 'OK', style: 'default' }];

  const resolvedVariant = variant || inferVariant(resolvedButtons);
  const tokens = getVariantTokens(resolvedVariant, colors, isDark);
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, insets, isDark]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 210,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          speed: 20,
          bounciness: 4,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.94);
    }
  }, [fadeAnim, scaleAnim, visible]);

  const handleButtonPress = (button: CustomAlertButton) => {
    onDismiss();
    button.onPress?.();
  };

  const resolveTone = (button: CustomAlertButton): AlertButtonTone => {
    if (button.tone) return button.tone;

    if (button.style === 'destructive') {
      return buttonTones?.destructive || 'solid';
    }

    if (button.style === 'cancel') {
      return buttonTones?.cancel || 'soft';
    }

    return buttonTones?.default || 'solid';
  };

  const getButtonStyle = (button: CustomAlertButton) => {
    const tone = resolveTone(button);
    if (tone === 'ghost') return styles.buttonGhost;
    if (tone === 'soft') return [styles.buttonSoft, { backgroundColor: tokens.softButton }];

    if (button.style === 'destructive') return [styles.buttonSolid, { backgroundColor: colors.error }];
    return [styles.buttonSolid, { backgroundColor: tokens.primaryButton }];
  };

  const getButtonTextStyle = (button: CustomAlertButton) => {
    const tone = resolveTone(button);
    if (tone === 'ghost') return [styles.buttonTextGhost, { color: colors.gray }];
    if (tone === 'soft') {
      return button.style === 'destructive'
        ? [styles.buttonTextSoft, { color: colors.error }]
        : [styles.buttonTextSoft, { color: tokens.softText }];
    }

    return styles.buttonTextSolid;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissible ? onDismiss : undefined}
    >
      <TouchableWithoutFeedback onPress={dismissible ? onDismiss : undefined}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} testID="custom-alert-overlay">
          <TouchableWithoutFeedback>
            <Animated.View
              style={[styles.modalContainer, { transform: [{ scale: scaleAnim }] }]}
              testID="custom-alert-container"
            >
              <View style={styles.headlineWrap}>
                <View style={[styles.iconContainer, { backgroundColor: tokens.iconBg, borderColor: tokens.iconBorder }]}> 
                  {icon || renderVariantIcon(resolvedVariant, tokens.iconColor)}
                </View>
                {emoji !== null ? (
                  <Text style={styles.emoji} testID="custom-alert-emoji">
                    {emoji ?? tokens.emoji}
                  </Text>
                ) : null}
              </View>

              <Text style={styles.title}>{title}</Text>

              {message ? <Text style={styles.message}>{message}</Text> : null}

              <View style={[styles.buttonRow, resolvedButtons.length >= 3 && styles.buttonColumn]}>
                {resolvedButtons.map((button, index) => (
                  <TouchableOpacity
                    key={`${button.text}-${index}`}
                    style={[
                      styles.button,
                      getButtonStyle(button),
                      resolvedButtons.length < 3 && resolvedButtons.length > 1 && { flex: 1 },
                    ]}
                    onPress={() => handleButtonPress(button)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.buttonTextBase, getButtonTextStyle(button)]}>{button.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean, insets: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(3,6,14,0.7)' : 'rgba(10,16,32,0.42)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: insets.top + SPACING.xl,
      paddingBottom: insets.bottom + SPACING.xl,
      paddingHorizontal: SPACING.xl,
    },
    modalContainer: {
      backgroundColor: colors.cardBackground,
      borderRadius: 30,
      padding: SPACING.xl,
      alignItems: 'center',
      maxWidth: 370,
      width: '100%',
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(255,255,255,0.08)'
        : (colors.borderSubtle ?? '#EBEEF6'),
      shadowColor: '#0D1428',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: isDark ? 0.4 : 0.18,
      shadowRadius: 28,
      elevation: 12,
    },
    headlineWrap: {
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    iconContainer: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
    },
    emoji: {
      marginTop: SPACING.xs,
      fontSize: 20,
      lineHeight: 24,
    },
    title: {
      fontSize: SIZES.lg + 1,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      marginBottom: SPACING.xs,
      textAlign: 'center',
      letterSpacing: -0.2,
    },
    message: {
      fontSize: SIZES.md,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'center',
      lineHeight: 23,
      marginBottom: SPACING.lg,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      width: '100%',
      marginTop: SPACING.xs,
    },
    buttonColumn: {
      flexDirection: 'column',
    },
    button: {
      paddingVertical: 14,
      paddingHorizontal: SPACING.md,
      borderRadius: 16,
      alignItems: 'center',
      minHeight: 46,
      justifyContent: 'center',
    },
    buttonSolid: {},
    buttonSoft: {
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(255,255,255,0.1)'
        : (colors.borderSubtle ?? '#E6EBF4'),
    },
    buttonGhost: {
      backgroundColor: 'transparent',
    },
    buttonTextBase: {
      fontSize: SIZES.md,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.1,
    },
    buttonTextSolid: {
      color: '#FFFFFF',
    },
    buttonTextSoft: {},
    buttonTextGhost: {},
  });
