// S-07 — Hook React Query qui revalide cote serveur le tier admin du user
// courant. A appeler en gating de tout ecran admin destructif (moderation,
// eradication, reaction adjustments). Le fallback en cas de 403 / network
// error est de bloquer l'affichage de l'ecran.
//
// Voir SOCIAL_SECURITY_AUDIT.md S-07.
import { useQuery } from '@tanstack/react-query';

import { getConfiguredSupabaseProjectLabel } from '@/services/edgeFunctions';
import { getSupabaseFunctionUrl } from '@/services/runtimeConfig';
import { supabase } from '@/services/supabase';

export interface AdminWhoamiResponse {
  success: true;
  is_admin: true;
  user_id: string;
  account_tier: 'admin';
}

export const ADMIN_WHOAMI_QUERY_KEY = ['admin', 'whoami'] as const;

async function fetchAdminWhoami(): Promise<AdminWhoamiResponse> {
  const functionUrl = getSupabaseFunctionUrl('admin-whoami');
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(functionUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json; charset=utf-8',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `admin-whoami on Supabase project "${getConfiguredSupabaseProjectLabel()}" returned ${response.status}: ${body}`,
    );
  }

  const payload = (await response.json()) as Partial<AdminWhoamiResponse>;
  if (payload?.is_admin !== true || typeof payload.user_id !== 'string') {
    throw new Error('admin-whoami returned an invalid payload');
  }
  return payload as AdminWhoamiResponse;
}

export function useAdminWhoami(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ADMIN_WHOAMI_QUERY_KEY,
    queryFn: fetchAdminWhoami,
    // 1min stale time : un admin retrograde voit son acces revoque rapidement.
    // Pas de refetchOnWindowFocus car l'app mobile n'a pas de "focus" pertinent
    // (les tabs sont du in-app navigation).
    staleTime: 60_000,
    retry: false,
    enabled: options.enabled !== false,
  });
}
