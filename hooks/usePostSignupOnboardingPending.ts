import { useCallback, useEffect, useState } from 'react';

import { hasPostSignupOnboardingPending } from '@/utils/postSignupOnboarding';

export function usePostSignupOnboardingPending(userId?: string | null) {
  const [isPending, setIsPending] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(userId));

  const refresh = useCallback(async () => {
    if (!userId) {
      setIsPending(false);
      setIsLoading(false);
      return false;
    }

    setIsLoading(true);

    try {
      const pending = await hasPostSignupOnboardingPending(userId);
      setIsPending(pending);
      return pending;
    } catch (error) {
      console.error(
        '[PostSignupOnboarding] Failed to read pending onboarding flag:',
        error
      );
      setIsPending(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isPending,
    isLoading,
    refresh,
  };
}
