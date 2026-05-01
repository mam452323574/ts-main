import { useEffect, useState } from 'react';

import { resolveAvatarUrl } from '@/services/avatar';

export function useResolvedAvatarUrl(avatarReference?: string | null) {
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAvatar = async () => {
      const nextUrl = await resolveAvatarUrl(avatarReference);
      if (isMounted) {
        setResolvedAvatarUrl(nextUrl);
      }
    };

    void loadAvatar();

    return () => {
      isMounted = false;
    };
  }, [avatarReference]);

  return resolvedAvatarUrl;
}
