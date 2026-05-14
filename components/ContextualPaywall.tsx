import React, { useMemo } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, Crown, Sparkles, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  getAndroidLightSurface,
  getObsidianSurface,
} from '@/constants/theme';
import { buildPremiumHealthPalette, type PremiumHealthPalette } from '@/constants/premiumHealth';
import { Button } from '@/components/Button';
import { useLanguage } from '@/contexts/LanguageContext';

interface ContextualPaywallProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  description?: string;
  bulletPoints?: string[];
  primaryButtonText?: string;
  secondaryButtonText?: string;
  onPrimaryPress?: () => void;
  icon?: React.ReactNode;
  badgeIcon?: React.ReactNode | null;
}

const TEXT_PROPS = {
  android_hyphenationFrequency: 'none' as const,
  lineBreakStrategyIOS: 'standard' as const,
};

export const ContextualPaywall: React.FC<ContextualPaywallProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  description,
  bulletPoints,
  primaryButtonText,
  secondaryButtonText,
  onPrimaryPress,
  icon,
  badgeIcon,
}) => {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const premiumHealth = useMemo(
    () => buildPremiumHealthPalette(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, insets, premiumHealth),
    [colors, insets, isDark, premiumHealth],
  );

  const handlePrimaryPress = () => {
    onClose();
    if (onPrimaryPress) {
      onPrimaryPress();
    } else {
      router.push('/premium-upgrade');
    }
  };

  const defaultPrimaryText = t('premium.upgrade_btn');
  const defaultSecondaryText = t('common.later');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.shell} testID="contextual-paywall-shell">
              <View style={styles.surface} testID="contextual-paywall-surface">
                <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X color={colors.gray} size={20} />
                </TouchableOpacity>

                <View style={styles.heroWrap}>
                  <View style={styles.iconContainer}>
                    {icon || <Crown color={colors.gold} size={31} />}
                  </View>
                  {badgeIcon !== null ? (
                    <View style={styles.sparkleBadge} testID="contextual-paywall-badge">
                      {badgeIcon ?? <Sparkles color={colors.gold} size={14} />}
                    </View>
                  ) : null}
                </View>

                <Text {...TEXT_PROPS} style={styles.title}>
                  {title}
                </Text>

                {subtitle ? (
                  <Text {...TEXT_PROPS} style={styles.subtitle}>
                    {subtitle}
                  </Text>
                ) : null}

                {description ? (
                  <Text {...TEXT_PROPS} style={styles.description}>
                    {description}
                  </Text>
                ) : null}

                {bulletPoints && bulletPoints.length > 0 ? (
                  <View style={styles.bulletList}>
                    {bulletPoints.map((point, index) => (
                      <View key={index} style={styles.bulletItem}>
                        <View style={styles.bulletIconPill}>
                          <Check color={colors.primary} size={13} strokeWidth={3} />
                        </View>
                        <Text {...TEXT_PROPS} style={styles.bulletText}>
                          {point}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.footer}>
                  <View style={styles.primaryButtonWrap}>
                    <Button
                      title={primaryButtonText || defaultPrimaryText}
                      onPress={handlePrimaryPress}
                      variant="premium"
                    />
                  </View>
                  <TouchableOpacity onPress={onClose} style={styles.secondaryButton}>
                    <Text
                      {...TEXT_PROPS}
                      adjustsFontSizeToFit
                      minimumFontScale={0.86}
                      numberOfLines={2}
                      style={styles.secondaryButtonText}
                    >
                      {secondaryButtonText || defaultSecondaryText}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const createStyles = (
  colors: any,
  isDark: boolean,
  insets: any,
  premiumHealth: PremiumHealthPalette,
) => {
  const isAndroidLight = Platform.OS === 'android' && !isDark;
  const androidLightSurface = isAndroidLight
    ? getAndroidLightSurface(colors, {
        accentColor: colors.primary,
        shadowColor: colors.gray,
        backgroundAlpha: 0.04,
        borderAlpha: 0.12,
        overlayAlpha: 0.08,
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffsetY: 10,
        elevation: 8,
      })
    : null;
  const obsidianSurface = isDark
    ? getObsidianSurface(colors, {
        accentColor: colors.gold,
        intensity: 'premium',
        backgroundAlpha: 0.08,
        borderAlpha: 0.26,
        shadowOpacity: 0.24,
        shadowRadius: 30,
        shadowOffsetY: 14,
        elevation: 10,
      })
    : null;

  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: premiumHealth.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: insets.top + SPACING.lg,
      paddingBottom: insets.bottom + SPACING.lg,
      paddingHorizontal: SPACING.lg,
    },
    shell: {
      width: '100%',
      maxWidth: 410,
      borderRadius: BORDER_RADIUS.hero,
      ...(isAndroidLight
        ? androidLightSurface?.shadowStyle
        : (obsidianSurface?.shadowStyle ?? {
            shadowColor: premiumHealth.shadowColor,
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.14,
            shadowRadius: 24,
            elevation: 11,
          })),
      position: 'relative',
    },
    surface: {
      borderRadius: BORDER_RADIUS.hero,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.lg,
      alignItems: 'center',
      backgroundColor: isAndroidLight
        ? androidLightSurface?.backgroundColor
        : (obsidianSurface?.backgroundColor ?? premiumHealth.surfaceRaised),
      borderWidth: 1,
      borderColor: isAndroidLight
        ? androidLightSurface?.borderColor
        : isDark
          ? (obsidianSurface?.borderColor ?? premiumHealth.borderStrong)
          : premiumHealth.borderSubtle,
      overflow: 'hidden',
      position: 'relative',
    },
    closeButton: {
      position: 'absolute',
      top: SPACING.md,
      right: SPACING.md,
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark
        ? premiumHealth.secondaryActionBackground
        : premiumHealth.secondaryActionBackground,
      borderWidth: 1,
      borderColor: premiumHealth.secondaryActionBorder,
    },
    heroWrap: {
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    iconContainer: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: premiumHealth.premiumAccentMuted,
      borderWidth: 1,
      borderColor: premiumHealth.borderStrong,
    },
    sparkleBadge: {
      marginTop: SPACING.xs,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: premiumHealth.premiumAccentSoft,
      borderWidth: 1,
      borderColor: premiumHealth.borderStrong,
    },
    title: {
      fontSize: SIZES.xl,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
      color: colors.primaryText,
      marginBottom: SPACING.xs,
      letterSpacing: 0,
      flexShrink: 1,
    },
    subtitle: {
      fontSize: SIZES.md,
      fontWeight: FONT_WEIGHTS.semiBold,
      textAlign: 'center',
      color: premiumHealth.trustAccent,
      marginBottom: SPACING.sm,
      flexShrink: 1,
    },
    description: {
      fontSize: SIZES.sm,
      textAlign: 'center',
      color: colors.gray,
      marginBottom: SPACING.lg,
      lineHeight: 21,
      flexShrink: 1,
    },
    bulletList: {
      width: '100%',
      marginBottom: SPACING.lg,
      borderRadius: 18,
      padding: SPACING.md,
      backgroundColor: premiumHealth.trustAccentMuted,
      borderWidth: 1,
      borderColor: premiumHealth.borderSubtle,
      gap: SPACING.sm,
    },
    bulletItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
    },
    bulletIconPill: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: premiumHealth.trustAccentSoft,
      marginTop: 1,
    },
    bulletText: {
      fontSize: SIZES.sm,
      color: colors.primaryText,
      flex: 1,
      flexShrink: 1,
      lineHeight: 19,
    },
    footer: {
      width: '100%',
      gap: SPACING.sm,
    },
    primaryButtonWrap: {
      width: '100%',
      ...SHADOWS.none,
    },
    secondaryButton: {
      paddingVertical: SPACING.sm,
      alignItems: 'center',
      borderRadius: 14,
      backgroundColor: premiumHealth.secondaryActionBackground,
      borderWidth: 1,
      borderColor: premiumHealth.secondaryActionBorder,
    },
    secondaryButtonText: {
      fontSize: SIZES.sm,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.gray,
      textAlign: 'center',
    },
  });
};
