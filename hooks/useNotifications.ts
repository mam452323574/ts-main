import { useEffect, useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import type {
  Notification,
  NotificationResponse,
  Subscription,
} from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { supabase } from '@/services/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { navigationService } from '@/services/navigation';
import { z } from 'zod';

import { logOperationalError } from '@/utils/observability';
import {
  getRuntimeCapabilities,
  logRuntimeDecisionOnce,
} from '@/utils/runtimeCapabilities';

// P3-P Phase 2 — schéma strict pour les notifications. Un attaquant qui
// usurpe une notif (push spoofing très limité car APN/FCM) ne peut pas
// injecter de routes arbitraires : seuls les `type` whitelistés sont traités.
const NOTIFICATION_PAYLOAD_SCHEMA = z
  .object({
    type: z.enum([
      'scan_ready',
      'super_scan_reset',
      'daily_reminder',
      'motivation',
      'reminder',
      'achievement',
    ]),
  })
  .passthrough();

const runtimeCapabilities = getRuntimeCapabilities();

function createNotificationsBridge() {
  if (runtimeCapabilities.canUseLocalNotifications) {
    try {
      return require('expo-notifications');
    } catch (error) {
      console.warn(
        '[useNotifications] Erreur de chargement de expo-notifications:',
        error
      );
    }
  }

  logRuntimeDecisionOnce('Notifications fallback enabled', {
    reason:
      runtimeCapabilities.platform === 'web'
        ? 'web-runtime'
        : 'expo-go-android',
  }, `notifications-fallback:${runtimeCapabilities.platform}`);

  return {
    setNotificationHandler: () => {},
    addNotificationReceivedListener: () => ({ remove: () => {} }),
    addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
    scheduleNotificationAsync: async () => 'mock-id',
    cancelScheduledNotificationAsync: async () => {},
    cancelAllScheduledNotificationsAsync: async () => {},
    getPermissionsAsync: async () => ({ status: 'denied' }),
    requestPermissionsAsync: async () => ({ status: 'denied' }),
    getExpoPushTokenAsync: async () => ({ data: null }),
    setNotificationChannelAsync: async () => {},
    SchedulableTriggerInputTypes: {
      TIME_INTERVAL: 'time_interval',
      DAILY: 'daily',
      DATE: 'date',
    },
    AndroidImportance: {
      MAX: 4,
    },
  };
}

const Notifications: any = createNotificationsBridge();

if (Notifications.setNotificationHandler) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

const NOTIFICATION_IDS = {
  DAILY_REMINDER: 'daily-reminder',
  SUPER_SCAN_RESET: 'super-scan-reset',
  MOTIVATION: 'motivation',
  SCAN_READY: 'scan-ready-',
};

export function useNotifications() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const notificationListener = useRef<Subscription | null>(null);
  const responseListener = useRef<Subscription | null>(null);
  const isMountedRef = useRef(true);
  const scheduledScanReadySignaturesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;

    isMountedRef.current = true;

    if (!runtimeCapabilities.canRegisterForPushNotifications) {
      if (runtimeCapabilities.isExpoGo) {
        logRuntimeDecisionOnce(
          'Expo Go limitations',
          {
            localNotificationsEnabled: runtimeCapabilities.canUseLocalNotifications,
            pushTokenRegistrationEnabled:
              runtimeCapabilities.canRegisterForPushNotifications,
            nativePurchasesEnabled: runtimeCapabilities.canUseNativePurchases,
            recommendation: 'use-development-build',
          },
          'expo-go-limitations',
        );
      }
    } else {
      registerForPushNotificationsAsync().then(async (token) => {
        if (!isMountedRef.current || !token) return;

        setExpoPushToken(token);
        await savePushTokenToDatabase(token);
      });
    }

    notificationListener.current =
      Notifications.addNotificationReceivedListener(
        (receivedNotification: Notification) => {
          if (isMountedRef.current) {
            setNotification(receivedNotification);
          }
        }
      );

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        (response: NotificationResponse) => {
          const data = response.notification.request.content.data;
          handleNotificationResponse(data);
        }
      );

    return () => {
      isMountedRef.current = false;

      if (notificationListener.current) {
        notificationListener.current.remove();
      }

      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user]);

  const savePushTokenToDatabase = async (token: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('user_profiles')
      .update({ push_token: token })
      .eq('id', user.id);

    if (error) {
      logOperationalError('[Notifications] Failed to save push token', error, {
        context: 'push_token_persistence',
      });
    }
  };

  const handleNotificationResponse = (data: unknown) => {
    try {
      // P3-P Phase 2 — validation Zod du payload avant routing. Un payload
      // non-conforme (champ `type` absent ou inconnu) tombe sur `/notifications`
      // par défaut (route sûre).
      const parsed = NOTIFICATION_PAYLOAD_SCHEMA.safeParse(data);
      const type = parsed.success ? parsed.data.type : null;
      let path = '/notifications';
      switch (type) {
        case 'scan_ready':
        case 'super_scan_reset':
        case 'daily_reminder':
        case 'motivation':
        case 'reminder':
          path = '/(tabs)';
          break;
        case 'achievement':
          path = '/notifications';
          break;
        default:
          path = '/notifications';
      }
      navigationService.dismissAllModalsAndNavigate(path);
    } catch (error) {
      logOperationalError('[Notifications] handleNotificationResponse failed', error);
    }
  };

  const scheduleLocalNotification = async (
    title: string,
    body: string,
    data?: any
  ) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
      },
    });
  };

  const scheduleDailyReminder = useCallback(async () => {
    if (Platform.OS === 'web') return;

    try {
      await Notifications.cancelScheduledNotificationAsync(
        NOTIFICATION_IDS.DAILY_REMINDER
      );

      const index = Math.floor(Math.random() * 6) + 1;
      const title = t(`notifications.daily_reminders.${index}.title`);
      const body = t(`notifications.daily_reminders.${index}.body`);

      await Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_IDS.DAILY_REMINDER,
        content: {
          title,
          body,
          data: { type: 'daily_reminder' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 10,
          minute: 0,
        },
      });
    } catch (error) {
      console.error(
        '[Notifications] Erreur planification rappel quotidien:',
        error
      );
    }
  }, [t]);

  const scheduleSuperScanReset = useCallback(async () => {
    if (Platform.OS === 'web') return;

    try {
      await Notifications.cancelScheduledNotificationAsync(
        NOTIFICATION_IDS.SUPER_SCAN_RESET
      );

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);

      const index = Math.floor(Math.random() * 3) + 1;
      const title = t(`notifications.super_scan_ready.${index}.title`);
      const body = t(`notifications.super_scan_ready.${index}.body`);

      await Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_IDS.SUPER_SCAN_RESET,
        content: {
          title,
          body,
          data: { type: 'super_scan_reset' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: tomorrow,
        },
      });
      console.log('[Notifications] Reset Super Scan planifie pour demain 8h');
    } catch (error) {
      console.error(
        '[Notifications] Erreur planification Super Scan reset:',
        error
      );
    }
  }, [t]);

  const scheduleScanReadyNotification = useCallback(
    async (scanType: import('@/types').ScanType, nextDateMs: number) => {
      if (Platform.OS === 'web') return;

      if (!Number.isFinite(nextDateMs)) return;

      const futureDate = new Date(nextDateMs);
      if (futureDate.getTime() <= Date.now()) return;

      const schedulingSignature = `${scanType}:${nextDateMs}:${locale}`;
      if (scheduledScanReadySignaturesRef.current[scanType] === schedulingSignature) {
        return;
      }

      scheduledScanReadySignaturesRef.current[scanType] = schedulingSignature;
      const notificationId = `${NOTIFICATION_IDS.SCAN_READY}${scanType}`;

      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);

        const title = t(`notifications.scan_${scanType}_title`);
        const body = t(`notifications.scan_${scanType}_body`);

        await Notifications.scheduleNotificationAsync({
          identifier: notificationId,
          content: {
            title,
            body,
            data: { type: 'scan_ready', scanType },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: futureDate,
          },
        });
        console.log(
          `[Notifications] Scan Ready planifie pour ${scanType} a ${futureDate.toLocaleString()}`
        );
      } catch (error) {
        if (scheduledScanReadySignaturesRef.current[scanType] === schedulingSignature) {
          delete scheduledScanReadySignaturesRef.current[scanType];
        }
        console.error(
          `[Notifications] Erreur planification Scan Ready (${scanType}):`,
          error
        );
      }
    },
    [locale, t]
  );

  const scheduleMotivationalNotification = useCallback(async () => {
    if (Platform.OS === 'web') return;

    try {
      await Notifications.cancelScheduledNotificationAsync(
        NOTIFICATION_IDS.MOTIVATION
      );

      const daysLater = 2 + Math.floor(Math.random() * 4);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysLater);
      futureDate.setHours(14, 0, 0, 0);

      const index = Math.floor(Math.random() * 6) + 1;
      const title = t(`notifications.motivational.${index}.title`);
      const body = t(`notifications.motivational.${index}.body`);

      await Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_IDS.MOTIVATION,
        content: {
          title,
          body,
          data: { type: 'motivation' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: futureDate,
        },
      });
    } catch (error) {
      console.error('[Notifications] Erreur planification motivation:', error);
    }
  }, [t]);

  const cancelAllScheduledNotifications = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log(
        '[Notifications] Toutes les notifications planifiees annulees'
      );
    } catch (error) {
      console.error('[Notifications] Erreur annulation notifications:', error);
    }
  }, []);

  return {
    expoPushToken,
    notification,
    scheduleLocalNotification,
    scheduleDailyReminder,
    scheduleSuperScanReset,
    scheduleMotivationalNotification,
    scheduleScanReadyNotification,
    cancelAllScheduledNotifications,
  };
}

async function registerForPushNotificationsAsync() {
  let token;
  const runtime = getRuntimeCapabilities();

  if (runtime.platform === 'web' || !runtime.canRegisterForPushNotifications) {
    return null;
  }

  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;

      if (!projectId || projectId === 'YOUR_EAS_PROJECT_ID') {
        console.warn(
          '[useNotifications] projectId EAS non configure. Executez "npx eas-cli project:init" ou configurez-le manuellement dans app.json'
        );
        return null;
      }

      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
      console.warn(
        '[useNotifications] Echec de recuperation du push token:',
        error
      );
      return null;
    }
  }

  if (runtime.platform === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1E3A2B',
    });
  }

  return token;
}
