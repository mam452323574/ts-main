import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileAvatar } from '@/components/ProfileAvatar';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

interface SocialIdentityRowProps {
  username?: string | null;
  avatarUrl?: string | null;
  meta?: string | null;
  avatarSize?: number;
  trailing?: ReactNode;
  onAvatarPress?: (() => void) | null;
  testID?: string;
}

export function SocialIdentityRow({
  username,
  avatarUrl,
  meta,
  avatarSize = 42,
  trailing,
  onAvatarPress,
  testID,
}: SocialIdentityRowProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.identity}>
        {onAvatarPress ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onAvatarPress}
            testID={testID ? `${testID}-avatar-pressable` : undefined}
          >
            <ProfileAvatar
              avatarUrl={avatarUrl}
              username={username}
              size={avatarSize}
              testID={testID ? `${testID}-avatar` : undefined}
            />
          </Pressable>
        ) : (
          <ProfileAvatar
            avatarUrl={avatarUrl}
            username={username}
            size={avatarSize}
            testID={testID ? `${testID}-avatar` : undefined}
          />
        )}
        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.username}>
            {username ?? t('common.unknown_user')}
          </Text>
          {meta ? (
            <Text numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      {trailing}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      gap: SPACING.sm,
    },
    text: {
      flex: 1,
      minWidth: 0,
      gap: 4,
      paddingVertical: 2,
    },
    username: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    meta: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: colors.textMuted ?? colors.gray,
    },
  });

export default SocialIdentityRow;
