import { UserRound } from 'lucide-react-native';

import { AuthInput, type AuthInputStatus } from '@/components/auth/AuthInput';
import { useLanguage } from '@/contexts/LanguageContext';

interface UsernameFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  status?: AuthInputStatus;
  statusMessage?: string;
  testID?: string;
}

/**
 * Champ username partagé entre le wizard d'inscription et l'écran de
 * configuration du profil, pour garantir un libellé, un placeholder et un
 * rendu de statut identiques quel que soit le chemin (email vs OAuth).
 */
export function UsernameField({
  value,
  onChangeText,
  status = 'idle',
  statusMessage,
  testID,
}: UsernameFieldProps) {
  const { t } = useLanguage();

  return (
    <AuthInput
      label={t('onboarding.username_label')}
      icon={UserRound}
      placeholder={t('onboarding.username_placeholder')}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoComplete="off"
      status={status}
      statusMessage={statusMessage}
      testID={testID}
    />
  );
}
