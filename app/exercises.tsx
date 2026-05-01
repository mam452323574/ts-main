import { useEffect } from 'react';
import ExercisesScreen from '@/screens/ExercisesScreen';
import { useBadges } from '@/contexts/BadgeContext';

export default function ExercisesModal() {
  const { clearBadge } = useBadges();

  useEffect(() => {
    clearBadge('exercises');
  }, [clearBadge]);

  return <ExercisesScreen />;
}
