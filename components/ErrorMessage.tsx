import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  /** Si true, le composant prend flex:1 (plein écran). Si false, il s'affiche inline. */
  fullScreen?: boolean;
}

export function ErrorMessage({ message, onRetry, fullScreen = true }: ErrorMessageProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[
      styles.container,
      { backgroundColor: fullScreen ? colors.background : colors.cardBackground },
      fullScreen && styles.fullScreen,
      !fullScreen && { borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl },
    ]}>
      <AlertCircle color={colors.error} size={48} />
      <Text style={[styles.text, { color: colors.error }]}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={onRetry}
          activeOpacity={0.7}
        >
          <RefreshCw color="#FFFFFF" size={18} />
          <Text style={styles.retryButtonText}>{t('common.retry') || 'Réessayer'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  fullScreen: {
    flex: 1,
  },
  text: {
    marginTop: SPACING.md,
    fontSize: SIZES.md,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: SIZES.text14,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
});
