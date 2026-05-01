import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/contexts/ThemeContext';
import {
  FONT_WEIGHTS,
  mixColors,
  SIZES,
  withAlpha,
} from '@/constants/theme';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';

interface CoachPersonaAvatarProps {
  imageSource?: CoachPersonaVisual['imageSource'];
  fallbackLabel: string;
  haloTint: string;
  size?: number;
  dimmed?: boolean;
  emphasis?: 'default' | 'featured' | 'subtle';
  testID?: string;
}

export function CoachPersonaAvatar({
  imageSource,
  fallbackLabel,
  haloTint,
  size = 52,
  dimmed = false,
  emphasis = 'default',
  testID,
}: CoachPersonaAvatarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageSource]);

  const shellSize = Math.round(size * 1.16);
  const ringSize = Math.round(size * 1.06);
  const fallbackFontSize = Math.max(SIZES.text12, Math.round(size * 0.28));
  const shouldRenderImage = !!imageSource && !imageFailed;
  const resolvedEmphasis = dimmed ? 'subtle' : emphasis;
  const haloOpacity =
    resolvedEmphasis === 'featured'
      ? 0.3
      : resolvedEmphasis === 'subtle'
        ? 0.18
        : 0.24;
  const haloScale =
    resolvedEmphasis === 'featured'
      ? 1.14
      : resolvedEmphasis === 'subtle'
        ? 1.02
        : 1.05;
  const ringTintStrength =
    resolvedEmphasis === 'featured'
      ? 0.34
      : resolvedEmphasis === 'subtle'
        ? 0.18
        : 0.24;
  const ringBorderWidth = resolvedEmphasis === 'featured' ? 1.5 : 1;
  const ringBorderColor = withAlpha(
    colors.white,
    resolvedEmphasis === 'featured' ? 0.22 : 0.14,
  );
  const fallbackTintStrength =
    resolvedEmphasis === 'featured'
      ? 0.46
      : resolvedEmphasis === 'subtle'
        ? 0.28
        : 0.36;
  const fallbackLabelTint =
    resolvedEmphasis === 'featured'
      ? 0.34
      : resolvedEmphasis === 'subtle'
        ? 0.2
        : 0.26;
  const imageScale = resolvedEmphasis === 'featured' ? 1.03 : 1;

  return (
    <View
      style={[
        styles.shell,
        {
          width: shellSize,
          height: shellSize,
          borderRadius: shellSize / 2,
        },
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.halo,
          {
            backgroundColor: withAlpha(haloTint, haloOpacity),
            transform: [{ scale: haloScale }],
          },
        ]}
        testID={testID ? `${testID}-halo` : undefined}
      />
      <View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            backgroundColor: mixColors(
              colors.cardBackground,
              haloTint,
              ringTintStrength,
            ),
            borderColor: ringBorderColor,
            borderWidth: ringBorderWidth,
          },
          dimmed && styles.ringDimmed,
        ]}
        testID={testID ? `${testID}-ring` : undefined}
      >
        {shouldRenderImage ? (
          <Image
            source={imageSource}
            style={[
              styles.image,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                transform: [{ scale: imageScale }],
              },
              dimmed && styles.imageDimmed,
            ]}
            onError={() => setImageFailed(true)}
            testID={testID ? `${testID}-image` : undefined}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: mixColors(
                  colors.cardBackground,
                  haloTint,
                  fallbackTintStrength,
                ),
              },
            ]}
            testID={testID ? `${testID}-fallback` : undefined}
          >
            <Text
              style={[
                styles.fallbackLabel,
                {
                  color: mixColors(colors.white, haloTint, fallbackLabelTint),
                  fontSize: fallbackFontSize,
                },
              ]}
            >
              {fallbackLabel}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    shell: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    halo: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 999,
    },
    ring: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      overflow: 'hidden',
    },
    ringDimmed: {
      opacity: 0.88,
    },
    image: {
      backgroundColor: withAlpha(colors.primaryText, 0.06),
    },
    imageDimmed: {
      opacity: 0.72,
    },
    fallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackLabel: {
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.8,
      includeFontPadding: false,
    },
  });
