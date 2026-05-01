import React, { useCallback, useState } from 'react';
import { AlertButtonTone, AlertVariant, CustomAlert, CustomAlertButton } from '@/components/CustomAlert';

export interface CustomAlertOptions {
  variant?: AlertVariant;
  emoji?: string | null;
  icon?: React.ReactNode;
  dismissible?: boolean;
  buttonTones?: Partial<Record<'default' | 'cancel' | 'destructive', AlertButtonTone>>;
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons?: CustomAlertButton[];
  icon?: React.ReactNode;
  variant?: AlertVariant;
  emoji?: string | null;
  dismissible?: boolean;
  buttonTones?: Partial<Record<'default' | 'cancel' | 'destructive', AlertButtonTone>>;
}

export function useCustomAlert() {
  const [config, setConfig] = useState<AlertConfig | null>(null);

  const showAlert = useCallback((
    title: string,
    message?: string,
    buttons?: CustomAlertButton[],
    icon?: React.ReactNode,
    options?: CustomAlertOptions,
  ) => {
    setConfig({
      title,
      message,
      buttons,
      icon: options?.icon ?? icon,
      variant: options?.variant,
      emoji: options?.emoji,
      dismissible: options?.dismissible,
      buttonTones: options?.buttonTones,
    });
  }, []);

  const hideAlert = useCallback(() => {
    setConfig(null);
  }, []);

  const alertElement = config ? (
    <CustomAlert
      visible={true}
      title={config.title}
      message={config.message}
      buttons={config.buttons}
      icon={config.icon}
      variant={config.variant}
      emoji={config.emoji}
      dismissible={config.dismissible}
      buttonTones={config.buttonTones}
      onDismiss={hideAlert}
    />
  ) : null;

  return { showAlert, hideAlert, alertElement };
}
