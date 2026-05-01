import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useLanguage } from '@/contexts/LanguageContext';

interface NotificationContextType {
  hasUnreadNotifications: boolean;
  notificationCount: number;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  checkForAchievements: () => Promise<void>;
  scheduleSuperScanReset: () => Promise<void>;
  scheduleScanReadyNotification: (scanType: import('@/types').ScanType, nextDateMs: number) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, userProfile } = useAuth();
  const { t, locale } = useLanguage();
  const {
    expoPushToken,
    scheduleLocalNotification,
    scheduleDailyReminder,
    scheduleSuperScanReset,
    scheduleMotivationalNotification,
    scheduleScanReadyNotification,
  } = useNotifications();
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const scheduledNotificationsSignatureRef = useRef<string | null>(null);

  const fetchUnreadNotifications = useCallback(async () => {
    if (!user) return;

    const { count, error } = await supabase
      .from('notification_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (!error && count !== null) {
      setNotificationCount(count);
      setHasUnreadNotifications(count > 0);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchUnreadNotifications();

    const subscription = supabase
      .channel('notification_logs_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_logs',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUnreadNotifications();
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user, fetchUnreadNotifications]);

  // Initialiser les notifications planifiees au demarrage
  // Initialiser et mettre à jour les notifications planifiees
  useEffect(() => {
    if (!user || !userProfile) {
      scheduledNotificationsSignatureRef.current = null;
      return;
    }

    const initScheduledNotifications = async () => {
      const settings = userProfile.notification_settings;
      const schedulingSignature = JSON.stringify({
        userId: user.id,
        locale,
        reminders: settings?.reminders !== false,
        achievements: settings?.achievements !== false,
        newContent: settings?.newContent !== false,
      });

      if (scheduledNotificationsSignatureRef.current === schedulingSignature) {
        return;
      }

      scheduledNotificationsSignatureRef.current = schedulingSignature;

      // Verifier si les rappels sont actives
      if (settings?.reminders !== false) {
        try {
          console.log('[NotificationContext] Mise à jour des notifications planifiées (Langue/Init)...');

          // Planifier le rappel quotidien (annule le précédent automatiquement dans la fonction)
          await scheduleDailyReminder();

          // Planifier une notification de motivation (annule la précédente automatiquement dans la fonction)
          await scheduleMotivationalNotification();

          console.log('[NotificationContext] Notifications reprogrammées avec succès');
        } catch (error) {
          scheduledNotificationsSignatureRef.current = null;
          console.error('[NotificationContext] Erreur initialisation notifications:', error);
        }
      }
    };

    initScheduledNotifications();
  }, [
    locale,
    scheduleDailyReminder,
    scheduleMotivationalNotification,
    user,
    userProfile,
  ]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('notification_logs')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (!error) {
      fetchUnreadNotifications();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  }, [user, fetchUnreadNotifications, queryClient]);

  const checkForAchievements = useCallback(async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('account_created_at, last_scan_date')
      .eq('id', user.id)
      .single();

    if (!profile) return;

    const accountAge = profile.account_created_at
      ? Date.now() - new Date(profile.account_created_at).getTime()
      : 0;

    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
    const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    const achievements = [
      { type: 'one_week', threshold: oneWeekMs, message: t('notifications.achievements.one_week') },
      { type: 'one_month', threshold: oneMonthMs, message: t('notifications.achievements.one_month') },
      { type: 'three_months', threshold: threeMonthsMs, message: t('notifications.achievements.three_months') },
      { type: 'six_months', threshold: sixMonthsMs, message: t('notifications.achievements.six_months') },
      { type: 'one_year', threshold: oneYearMs, message: t('notifications.achievements.one_year') },
    ];

    for (const achievement of achievements) {
      if (accountAge >= achievement.threshold) {
        const { data: existing } = await supabase
          .from('user_achievements')
          .select('id')
          .eq('user_id', user.id)
          .eq('achievement_type', achievement.type)
          .maybeSingle();

        if (!existing) {
          await supabase.from('user_achievements').insert({
            user_id: user.id,
            achievement_type: achievement.type,
          });

          await supabase.from('notification_logs').insert({
            user_id: user.id,
            notification_type: 'achievement',
            title: t('notifications.achievements.title'),
            body: achievement.message,
          });

          if (scheduleLocalNotification) {
            await scheduleLocalNotification(t('notifications.achievements.title'), achievement.message, {
              type: 'achievement',
              achievementType: achievement.type,
            });
          }
        }
      }
    }
  }, [user, scheduleLocalNotification]);

  return (
    <NotificationContext.Provider
      value={{
        hasUnreadNotifications,
        notificationCount,
        markNotificationAsRead,
        checkForAchievements,
        scheduleSuperScanReset,
        scheduleScanReadyNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}
