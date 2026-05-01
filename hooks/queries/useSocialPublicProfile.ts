import { useQuery } from '@tanstack/react-query';

import { fetchSocialPublicProfile } from '@/services/social';
import type { SocialPublicProfile } from '@/types';

export const SOCIAL_PUBLIC_PROFILE_QUERY_KEY = (userId: string) =>
  ['socialPublicProfile', userId] as const;

export const useSocialPublicProfile = (
  userId: string | null | undefined,
  enabled = true,
) => {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';

  return useQuery<SocialPublicProfile | null, Error>({
    queryKey: SOCIAL_PUBLIC_PROFILE_QUERY_KEY(normalizedUserId),
    queryFn: () => fetchSocialPublicProfile(normalizedUserId),
    enabled: enabled && normalizedUserId.length > 0,
    staleTime: 1000 * 60,
  });
};
