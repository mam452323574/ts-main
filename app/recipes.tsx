import { useEffect } from 'react';
import RecipesScreen from '@/screens/RecipesScreen';
import { useBadges } from '@/contexts/BadgeContext';

export default function RecipesModal() {
  const { clearBadge } = useBadges();

  useEffect(() => {
    clearBadge('recipes');
  }, [clearBadge]);

  return <RecipesScreen />;
}
