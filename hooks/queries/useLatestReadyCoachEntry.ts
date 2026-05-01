import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import {
  fetchLatestReadyCoachEntry,
} from '@/services/coach';
import type { CoachServiceError } from '@/services/coach';
import type { CoachPersonaKey, CoachPromptType } from '@/types';
import {
  isRenderableCoachEntry,
  type RenderableCoachEntry,
} from '@/utils/coachHistory';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export const COACH_LATEST_READY_ENTRY_QUERY_KEY = ['coachLatestReady'] as const;

interface LatestReadyCoachEntryOptions {
  personaKey?: CoachPersonaKey | null;
  promptType?: CoachPromptType | null;
  locale?: string | null;
}

function normalizeCoachQueryLocale(locale?: string | null) {
  const normalizedLocale = locale?.trim().slice(0, 2).toLowerCase();
  return normalizedLocale && normalizedLocale.length > 0 ? normalizedLocale : null;
}

export const getCoachLatestReadyEntryQueryKey = (
  userId: string | null | undefined,
  options: LatestReadyCoachEntryOptions = {},
) => [
  ...COACH_LATEST_READY_ENTRY_QUERY_KEY,
  userId ?? 'anonymous',
  options.personaKey ?? 'all',
  options.promptType ?? 'any',
  normalizeCoachQueryLocale(options.locale),
] as const;

export function useLatestReadyCoachEntry(
  options: LatestReadyCoachEntryOptions = {},
) {
  const { user } = useAuth();

  return useQuery<RenderableCoachEntry | null, CoachServiceError>({
    queryKey: getCoachLatestReadyEntryQueryKey(user?.id, options),
    queryFn: async () => {
      const entry = await fetchLatestReadyCoachEntry({
        personaKey: options.personaKey ?? null,
        promptType: options.promptType ?? null,
        locale: options.locale ?? undefined,
      });
      return isRenderableCoachEntry(entry) ? entry : null;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
  });
}
