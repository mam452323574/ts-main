import React from 'react';
import { Gift } from 'lucide-react-native';

import { CustomAlert } from '@/components/CustomAlert';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

interface RewardedAdOptInModalProps {
  visible: boolean;
  /** Masque la modale (branché sur `onDismiss` de CustomAlert, qui se déclenche
   *  pour CHAQUE bouton avant son `onPress`). Ne résout PAS le gate. */
  onClose: () => void;
  onWatch: () => void;
  onLater: () => void;
  onGoPremium: () => void;
}

/**
 * Écran d'opt-in obligatoire avant une vidéo récompensée AppLovin MAX :
 * une pub récompensée doit être initiée par l'utilisateur). Réutilise le
 * composant maison `CustomAlert` pour rester cohérent avec le reste de l'app.
 */
export function RewardedAdOptInModal({
  visible,
  onClose,
  onWatch,
  onLater,
  onGoPremium,
}: RewardedAdOptInModalProps) {
  const { t } = useLanguage();
  const { colors } = useTheme();

  return (
    <CustomAlert
      visible={visible}
      variant="premium"
      dismissible={false}
      icon={<Gift color={colors.gold} size={30} strokeWidth={2.3} />}
      title={t('ads.optin.title')}
      message={t('ads.optin.body')}
      onDismiss={onClose}
      buttons={[
        { text: t('ads.optin.watch'), style: 'default', onPress: onWatch },
        { text: t('ads.optin.go_premium'), style: 'cancel', tone: 'soft', onPress: onGoPremium },
        { text: t('ads.optin.later'), style: 'cancel', tone: 'ghost', onPress: onLater },
      ]}
    />
  );
}
