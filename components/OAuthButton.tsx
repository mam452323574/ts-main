import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { SIZES, SPACING, BORDER_RADIUS } from '@/constants/theme';

interface OAuthButtonProps {
  provider: 'google' | 'apple';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function OAuthButton({ provider, onPress, loading, disabled }: OAuthButtonProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const getProviderConfig = () => {
    switch (provider) {
      case 'google':
        return {
          label: 'Continuer avec Google',
          backgroundColor: isDark ? '#2D2D2D' : '#FFFFFF',
          textColor: isDark ? '#FFFFFF' : '#000000',
          icon: 'G',
          iconColor: '#4285F4',
        };
      case 'apple':
        return {
          label: 'Continuer avec Apple',
          backgroundColor: isDark ? '#FFFFFF' : '#000000',
          textColor: isDark ? '#000000' : '#FFFFFF',
          icon: '',
          iconColor: isDark ? '#000000' : '#FFFFFF',
        };
    }
  };

  const config = getProviderConfig();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: config.backgroundColor },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={config.textColor} />
      ) : (
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: config.iconColor }]}>
            <Text style={[styles.icon, { color: config.backgroundColor }]}>
              {config.icon}
            </Text>
          </View>
          <Text style={[styles.label, { color: config.textColor }]}>
            {config.label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  button: {
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  icon: {
    fontSize: SIZES.md,
    fontWeight: 'bold',
  },
  label: {
    fontSize: SIZES.md,
    fontWeight: '500',
  },
});
