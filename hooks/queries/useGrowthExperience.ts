import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { fetchGrowthExperience } from '@/services/growthExperience';
import type { UserGrowthExperience } from '@/types';

export const GROWTH_EXPERIENCE_QUERY_KEY = (userId?: string | null) =>
  ['growthExperience', userId ?? 'anonymous'] as const;

export function useGrowthExperience() {
  const { user } = useAuth();

  return useQuery<UserGrowthExperience | null, Error>({
    queryKey: GROWTH_EXPERIENCE_QUERY_KEY(user?.id),
    queryFn: () => fetchGrowthExperience(user?.id),
    enabled: !!user?.id,
    initialData: null,
    staleTime: 1000 * 60,
  });
}
