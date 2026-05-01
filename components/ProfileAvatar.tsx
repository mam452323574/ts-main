import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { FONT_WEIGHTS, SIZES, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useResolvedAvatarUrl } from '@/hooks/useResolvedAvatarUrl';

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  username?: string | null;
  size?: number;
  testID?: string;
  style?: any;
}

function resolveFallbackLabel(username?: string | null) {
  const trimmedUsername = username?.trim();
  if (!trimmedUsername) {
    return '?';
  }

  return trimmedUsername.slice(0, 1).toUpperCase();
}

export function ProfileAvatar({
  avatarUrl,
  username,
  size = 42,
  testID,
  style,
}: ProfileAvatarProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const resolvedAvatarUrl = useResolvedAvatarUrl(avatarUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const avatarSizeStyle = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden' as const,
    }),
    [size],
  );
  const fallbackFontSize = Math.max(16, Math.round(size * 0.38));
  const shouldRenderImage = !!resolvedAvatarUrl && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  if (shouldRenderImage) {
    return (
      <Image
        source={{ uri: resolvedAvatarUrl }}
        resizeMode="cover"
        style={[styles.avatar, avatarSizeStyle, style]}
        onError={() => setImageFailed(true)}
        testID={testID}
      />
    );
  }

  return (
    <View
      style={[styles.avatarFallback, avatarSizeStyle, style]}
      testID={testID ? `${testID}-fallback` : undefined}
    >
      <Text style={[styles.avatarFallbackLabel, { fontSize: fallbackFontSize }]}>
        {resolveFallbackLabel(username)}
      </Text>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    avatar: {
      backgroundColor: withAlpha(colors.primaryText, 0.04),
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.10 : 0.06),
    },
    avatarFallbackLabel: {
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      includeFontPadding: false,
      fontSize: SIZES.text16,
    },
  });

export default ProfileAvatar;
