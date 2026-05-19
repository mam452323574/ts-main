import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Award, Bell, Sparkles, Clock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';
import { Squircle } from '@/components/Squircle';

interface NotificationCardProps {
  id: string;
  type: 'achievement' | 'reminder' | 'newContent';
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  onPress?: () => void;
  onMarkAsRead?: () => void;
}

export function NotificationCard({
  id,
  type,
  title,
  body,
  createdAt,
  isRead,
  onPress,
  onMarkAsRead,
}: NotificationCardProps) {
  const { colors, isDark } = useTheme();
  const { locale, t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const getIcon = () => {
    switch (type) {
      case 'achievement':
        return <Award color={colors.primary} size={24} fill={colors.primary} />;
      case 'reminder':
        return <Bell color={colors.secondary} size={24} />;
      case 'newContent':
        return <Sparkles color={colors.accent} size={24} />;
      default:
        return <Bell color={colors.gray} size={24} />;
    }
  };

  const getBackgroundColor = () => {
    if (!isRead) {
      return isDark ? colors.primaryLight : '#F0F9FF';
    }
    return colors.cardBackground;
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffInMs = now.getTime() - then.getTime();
    const diffInMinutes = Math.floor(diffInMs / 60000);
    const diffInHours = Math.floor(diffInMs / 3600000);
    const diffInDays = Math.floor(diffInMs / 86400000);

    if (diffInMinutes < 1) {
      return t('common.time_ago.just_now');
    } else if (diffInMinutes < 60) {
      return t('common.time_ago.minutes_ago', { count: diffInMinutes });
    } else if (diffInHours < 24) {
      return t('common.time_ago.hours_ago', { count: diffInHours });
    } else if (diffInDays === 1) {
      return t('common.time_ago.yesterday');
    } else if (diffInDays < 7) {
      return t('common.time_ago.days_ago', { count: diffInDays });
    } else {
      return then.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    }
  };

  const safeTitle = typeof title === 'string' ? title : '';
  const safeBody = typeof body === 'string' ? body : '';

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: getBackgroundColor() },
        !isRead && styles.unreadContainer,
      ]}
      onPress={onPress || onMarkAsRead}
      activeOpacity={0.7}
    >
      <Squircle style={styles.iconContainer}>{getIcon()}</Squircle>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, !isRead && styles.unreadTitle]}>{safeTitle}</Text>
          {!isRead && <Squircle style={styles.unreadBadge} />}
        </View>
        <Text style={styles.body} numberOfLines={2}>
          {safeBody}
        </Text>
        <View style={styles.footer}>
          <Clock color={colors.gray} size={14} />
          <Text style={styles.timestamp}>{getTimeAgo(createdAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: colors.lightGray, borderCurve: 'continuous',
  },
  unreadContainer: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md, borderCurve: 'continuous',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: SIZES.text16,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primaryText,
    flex: 1,
  },
  unreadTitle: {
    fontWeight: FONT_WEIGHTS.bold,
  },
  unreadBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: SPACING.xs, borderCurve: 'continuous',
  },
  body: {
    fontSize: SIZES.text14,
    color: colors.gray,
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  timestamp: {
    fontSize: SIZES.text12,
    color: colors.gray,
  },
});
