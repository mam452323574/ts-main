import { useQuery } from '@tanstack/react-query';
import { ApiService } from '@/services/api';

export const EXERCISES_QUERY_KEY = ['exercises'] as const;

export const useExercises = () => {
  return useQuery({
    queryKey: EXERCISES_QUERY_KEY,
    queryFn: ApiService.getExercises,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
};
