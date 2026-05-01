import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useBadges } from '@/contexts/BadgeContext';
import CoachScreen from '@/screens/CoachScreen';

export default function CoachTabScreen() {
  const { clearBadge } = useBadges();

  // IMPORTANT: useFocusEffect DOIT utiliser useCallback pour éviter une boucle infinie
  useFocusEffect(
    useCallback(() => {
      clearBadge('coach');
    }, [clearBadge])
  );

  return <CoachScreen variant="tab" />;
}
