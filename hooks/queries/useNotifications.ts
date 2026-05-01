import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';

interface Notification {
  id: string;
  notification_type: 'achievement' | 'reminder' | 'newContent';
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

type FilterType = 'all' | 'unread' | 'read';

export const NOTIFICATIONS_QUERY_KEY = (userId: string | undefined, filter: FilterType) => 
  ['notifications', userId, filter] as const;

export const fetchNotifications = async (
  userId: string | undefined, 
  filter: FilterType
): Promise<Notification[]> => {
  if (!userId) return [];

  let query = supabase
    .from('notification_logs')
    .select('id, notification_type, title, body, created_at, read_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filter === 'unread') {
    query = query.is('read_at', null);
  } else if (filter === 'read') {
    query = query.not('read_at', 'is', null);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
};

export const useNotificationsQuery = (userId: string | undefined, filter: FilterType = 'all') => {
  return useQuery<Notification[], Error>({
    queryKey: NOTIFICATIONS_QUERY_KEY(userId, filter),
    queryFn: () => fetchNotifications(userId, filter),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    placeholderData: keepPreviousData,
  });
};
