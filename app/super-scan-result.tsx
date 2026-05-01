import { useEffect } from 'react';
import SuperScanResultScreen from '@/screens/SuperScanResultScreen';
import { useBadges } from '@/contexts/BadgeContext';

export default function SuperScanResultModal() {
    const { clearBadge } = useBadges();

    useEffect(() => {
        clearBadge('coach');
    }, [clearBadge]);

    return <SuperScanResultScreen />;
}
