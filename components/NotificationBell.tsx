import { memo, useMemo, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { navigationService } from '@/services/navigation';
import { NOTIFICATIONS_QUERY_KEY, fetchNotifications } from '@/hooks/queries';
import { SIZES, FONT_WEIGHTS } from '@/constants/theme';



export const NotificationBell = memo(function NotificationBell() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notificationCount } = useNotificationContext();
  const { colors } = useTheme();
  useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Prefetch notifications so the screen opens instantly
  useEffect(() => {
    if (user?.id) {
      queryClient.prefetchQuery({
        queryKey: NOTIFICATIONS_QUERY_KEY(user.id, 'all'),
        queryFn: () => fetchNotifications(user.id, 'all'),
        staleTime: 1000 * 60 * 5,
      });
    }
  }, [user?.id, queryClient]);

  const handlePress = () => {
    navigationService.navigateToNotifications();
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Bell color={colors.primaryText} size={24} strokeWidth={2} />
      {notificationCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {notificationCount > 9 ? '9+' : notificationCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    padding: 8,
    marginRight: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cardBackground,
  },
  badgeText: {
    fontSize: SIZES.text10,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.white,
  },
});
