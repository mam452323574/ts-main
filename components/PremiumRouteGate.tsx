import { ReactNode, useEffect } from 'react';
import { useRouter } from 'expo-router';

import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/subscription';

type PremiumRouteGateProps = {
  children: ReactNode;
};

export function PremiumRouteGate({ children }: PremiumRouteGateProps) {
  const router = useRouter();
  const { loading, userProfile } = useAuth();
  const hasAccess = hasPremiumAccess(userProfile?.account_tier ?? null);

  useEffect(() => {
    if (loading || !userProfile || hasAccess) {
      return;
    }

    router.replace('/premium-upgrade' as any);
  }, [hasAccess, loading, router, userProfile]);

  if (loading || !userProfile || !hasAccess) {
    return <LoadingSpinner />;
  }

  return <>{children}</>;
}
