import { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CheckCheck } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { NOTIFICATIONS_QUERY_KEY, useNotificationsQuery } from '@/hooks/queries/useNotifications';
import { AppScreen } from '@/components/AppScreen';
import { HeaderIconButton, ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedControl } from '@/components/SegmentedControl';
import { NotificationCard } from '@/components/NotificationCard';
import { supabase } from '@/services/supabase';
import { SPACING } from '@/constants/theme';

type FilterType = 'all' | 'unread' | 'read';

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const { markNotificationAsRead, notificationCount: unreadCount } = useNotificationContext();
  const [filter, setFilter] = useState<FilterType>('all');
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false);

  // React Query hook
  const {
    data: notifications = [],
    isLoading,
    isRefetching,
    refetch,
  } = useNotificationsQuery(user?.id, filter);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleMarkAsRead = async (notificationId: string) => {
    // Optimistic update
    queryClient.setQueryData(
      NOTIFICATIONS_QUERY_KEY(user?.id, filter),
      (old: any[] | undefined) =>
        old?.map(n => n.id === notificationId
          ? { ...n, read_at: new Date().toISOString() }
          : n
        )
    );
    await markNotificationAsRead(notificationId);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleNotificationPress = (item: any) => {
    handleMarkAsRead(item.id);
    switch (item.notification_type) {
      case 'reminder':
        router.dismiss();
        break;
      case 'achievement':
        break;
      case 'new_content':
        router.dismiss();
        router.push('/recipes');
        break;
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user || markingAllAsRead) return;

    try {
      setMarkingAllAsRead(true);

      const { error } = await supabase
        .from('notification_logs')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      // Invalider le cache pour rafraîchir les données
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (error) {
      console.error('Error marking all as read:', error);
    } finally {
      setMarkingAllAsRead(false);
    }
  };

  const filterOptions = useMemo(
    () => [
      {
        value: 'all' as const,
        label: t('notifications.filter_all'),
        testID: 'notifications-filter-all',
      },
      {
        value: 'unread' as const,
        label: `${t('notifications.filter_unread')} (${unreadCount})`,
        testID: 'notifications-filter-unread',
      },
      {
        value: 'read' as const,
        label: t('notifications.filter_read'),
        testID: 'notifications-filter-read',
      },
    ],
    [t, unreadCount],
  );

  const renderEmptyState = () => (
    <ScreenState
      tone="empty"
      title={t('notifications.empty_title')}
      message={
        filter === 'unread'
          ? t('notifications.empty_unread')
          : t('notifications.empty_all')
      }
      icon={<CheckCheck />}
      testID="notifications-empty-state"
    />
  );

  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container}>
      <View style={styles.header}>
        <ScreenHeader
          title={t('notifications.title')}
          onBack={() => router.back()}
          centered
          topInset
          right={
            unreadCount > 0 ? (
              <HeaderIconButton
                accessibilityLabel={t('notifications.filter_read')}
                onPress={handleMarkAllAsRead}
                icon={
                  markingAllAsRead ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <CheckCheck color={colors.primaryText} size={20} />
                  )
                }
              />
            ) : undefined
          }
        />
      </View>

      <View style={styles.filterContainer}>
        <SegmentedControl<FilterType>
          value={filter}
          onChange={setFilter}
          options={filterOptions}
          testID="notifications-filter-control"
        />
      </View>

      {isLoading && !notifications.length ? (
        <ScreenState
          tone="loading"
          layout="full"
          title={t('notifications.loading')}
          testID="notifications-loading-state"
        />
      ) : (
        <FlatList
          data={notifications}
          renderItem={({ item }) => (
            <NotificationCard
              id={item.id}
              type={item.notification_type}
              title={item.title}
              body={item.body}
              createdAt={item.created_at}
              isRead={!!item.read_at}
              onMarkAsRead={() => handleMarkAsRead(item.id)}
              onPress={() => handleNotificationPress(item)}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </AppScreen>
  );
}

const createStyles = (colors: any, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.background,
  },
  filterContainer: {
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle ?? colors.lightGray,
  },
  listContent: {
    padding: SPACING.page,
    paddingBottom: insets.bottom + SPACING.xl,
  },
});
