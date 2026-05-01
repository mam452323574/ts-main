import { useEffect } from 'react';
import ScanResultScreen from '@/screens/ScanResultScreen';
import { useBadges } from '@/contexts/BadgeContext';

export default function ScanResultModal() {
  const { clearBadge } = useBadges();

  useEffect(() => {
    clearBadge('coach');
  }, [clearBadge]);

  return <ScanResultScreen />;
}
