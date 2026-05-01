import { useQuery } from '@tanstack/react-query';
import { ApiService } from '@/services/api';
import { PremiumPotentialInputs, ScanType } from '@/types';

export const PREMIUM_POTENTIAL_QUERY_KEY = (
  scanType: ScanType,
  scanId?: string | null,
) => ['premiumPotential', scanType, scanId ?? 'latest'] as const;

export const usePremiumPotential = (
  scanType: ScanType,
  scanId?: string | null,
  enabled: boolean = true,
) => {
  return useQuery<PremiumPotentialInputs, Error>({
    queryKey: PREMIUM_POTENTIAL_QUERY_KEY(scanType, scanId),
    queryFn: () => ApiService.getPremiumPotentialData(scanType, scanId ?? null),
    staleTime: 1000 * 60 * 5,
    enabled,
  });
};
