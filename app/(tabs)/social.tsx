import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import SocialScreen from '@/screens/SocialScreen';
import { useBadges } from '@/contexts/BadgeContext';

export default function SocialTab() {
  const { clearBadge } = useBadges();

  useFocusEffect(
    useCallback(() => {
      clearBadge('social');
    }, [clearBadge])
  );

  return <SocialScreen />;
}
