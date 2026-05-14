import { StyleSheet, View } from 'react-native';

import { ScreenState } from '@/components/ScreenState';
import { useLanguage } from '@/contexts/LanguageContext';
import { SPACING } from '@/constants/theme';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  /** Si true, le composant prend flex:1 (plein écran). Si false, il s'affiche inline. */
  fullScreen?: boolean;
}

export function ErrorMessage({ message, onRetry, fullScreen = true }: ErrorMessageProps) {
  const { t } = useLanguage();
  const state = (
    <ScreenState
      tone="error"
      layout={fullScreen ? 'full' : 'card'}
      title={message}
      actionLabel={onRetry ? t('common.retry') || 'Réessayer' : undefined}
      onAction={onRetry}
      testID="error-message-state"
    />
  );

  return fullScreen ? state : <View style={styles.inline}>{state}</View>;
}

const styles = StyleSheet.create({
  inline: {
    padding: SPACING.xs,
  },
});
