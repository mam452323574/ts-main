import React from 'react';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CustomAlert } from '@/components/CustomAlert';

interface UrgencyModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function UrgencyModal({ visible, onDismiss }: UrgencyModalProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();

  return (
    <CustomAlert
      visible={visible}
      title={t('components.urgency.title')}
      message={t('components.urgency.message')}
      icon={<AlertTriangle color={colors.warning} size={30} strokeWidth={2.2} />}
      variant="warning"
      emoji="🩺"
      dismissible={false}
      buttons={[
        {
          text: t('components.urgency.dismiss'),
          style: 'default',
        },
      ]}
      onDismiss={onDismiss}
    />
  );
}
