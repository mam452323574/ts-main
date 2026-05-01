import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, CheckCheck } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { useNotificationsQuery, NOTIFICATIONS_QUERY_KEY } from '@/hooks/queries';
import { NotificationCard } from '@/components/NotificationCard';
import { supabase } from '@/services/supabase';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';

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
    if (!user) return;

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

  const renderFilterButton = (filterType: FilterType, label: string) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === filterType && styles.filterButtonActive]}
      onPress={() => setFilter(filterType)}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterButtonText,
          filter === filterType && styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <CheckCheck color={colors.primary} size={64} />
      </View>
      <Text style={styles.emptyTitle}>{t('notifications.empty_title')}</Text>
      <Text style={styles.emptyText}>
        {filter === 'unread'
          ? t('notifications.empty_unread')
          : t('notifications.empty_all')}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft color={colors.primaryText} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={handleMarkAllAsRead}
              disabled={markingAllAsRead}
              activeOpacity={0.7}
            >
              {markingAllAsRead ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <CheckCheck color={colors.primary} size={20} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterContainer}>
        {renderFilterButton('all', t('notifications.filter_all'))}
        {renderFilterButton('unread', `${t('notifications.filter_unread')} (${unreadCount})`)}
        {renderFilterButton('read', t('notifications.filter_read'))}
      </View>

      {isLoading && !notifications.length ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('notifications.loading')}</Text>
        </View>
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
    </View>
  );
}

const createStyles = (colors: any, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: insets.top + SPACING.sm,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.page,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  backButton: {
    padding: SPACING.xs,
    width: 40,
  },
  headerTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  markAllButton: {
    padding: SPACING.xs,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  filterButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: SIZES.text14,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.gray,
  },
  filterButtonTextActive: {
    color: colors.white,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  listContent: {
    padding: SPACING.page,
    paddingBottom: insets.bottom + SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: SIZES.text14,
    color: colors.gray,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: SIZES.text20,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: SIZES.text14,
    color: colors.gray,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});
