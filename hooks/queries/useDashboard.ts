import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { ApiService } from '@/services/api';
import { DashboardData } from '@/types';

export const DASHBOARD_QUERY_KEY = ['dashboard'] as const;

export const useDashboard = () => {
  const { user } = useAuth();

  return useQuery<DashboardData, Error>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: ApiService.getDashboard,
    enabled: !!user?.id,
  });
};
