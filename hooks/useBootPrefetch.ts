import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { ApiService } from '@/services/api';
import { EXERCISES_QUERY_KEY } from '@/hooks/queries/useExercises';
import { RECIPES_QUERY_KEY } from '@/hooks/queries/useRecipes';

export function useBootPrefetch() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    void queryClient.prefetchQuery({
      queryKey: RECIPES_QUERY_KEY,
      queryFn: ApiService.getRecipes,
      staleTime: 1000 * 60 * 60,
    });

    void queryClient.prefetchQuery({
      queryKey: EXERCISES_QUERY_KEY,
      queryFn: ApiService.getExercises,
      staleTime: 1000 * 60 * 60,
    });
  }, [loading, queryClient, user]);
}
