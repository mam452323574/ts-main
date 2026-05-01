import { QueryClient } from '@tanstack/react-query';

// Instance React Query partagée. Extraite de `app/_layout.tsx` pour éviter
// l'import dynamique fragile (`require('@/app/_layout')`) lors du logout
// (P2-G Phase 2). Tout module qui doit invalider/vider le cache (logout,
// refresh profil, etc.) doit importer cette instance directement.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: 'always',
    },
  },
});
