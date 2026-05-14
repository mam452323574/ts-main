import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Check, X } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  AVATAR_CROP_MAX_SCALE,
  AVATAR_CROP_MIN_SCALE,
  clampAvatarCropTransform,
  getAvatarCropBaseScale,
  getAvatarCropSelection,
  normalizeAvatarCropSource,
  type AvatarCropSelection,
  type AvatarCropTransform,
} from '@/utils/avatarCrop';

export interface AvatarCropAsset {
  uri: string;
  width?: number | null;
  height?: number | null;
}

interface AvatarCropModalProps {
  visible: boolean;
  asset?: AvatarCropAsset | null;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: (selection: AvatarCropSelection) => void;
}

const CROP_MAX_SIZE = 320;
const CROP_HORIZONTAL_MARGIN = SPACING.xl * 2;

export function AvatarCropModal({
  visible,
  asset,
  confirming = false,
  onCancel,
  onConfirm,
}: AvatarCropModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  const cropSize = useMemo(
    () => Math.max(220, Math.min(CROP_MAX_SIZE, windowWidth - CROP_HORIZONTAL_MARGIN)),
    [windowWidth],
  );
  const source = useMemo(
    () =>
      normalizeAvatarCropSource({
        width: asset?.width ?? 1,
        height: asset?.height ?? 1,
      }),
    [asset?.height, asset?.width],
  );
  const baseScale = useMemo(
    () => getAvatarCropBaseScale(source, cropSize),
    [cropSize, source],
  );
  const baseImageWidth = source.width * baseScale;
  const baseImageHeight = source.height * baseScale;
  const styles = useMemo(
    () => createStyles(colors, isDark, cropSize),
    [colors, cropSize, isDark],
  );

  const scale = useSharedValue(AVATAR_CROP_MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(AVATAR_CROP_MIN_SCALE);
  const transformRef = useRef<AvatarCropTransform>({
    scale: AVATAR_CROP_MIN_SCALE,
    translateX: 0,
    translateY: 0,
  });

  const syncTransform = useCallback((nextTransform: AvatarCropTransform) => {
    transformRef.current = clampAvatarCropTransform({
      ...source,
      cropSize,
      ...nextTransform,
    });
  }, [cropSize, source]);

  useEffect(() => {
    if (!visible || !asset?.uri) {
      return;
    }

    const initialTransform = {
      scale: AVATAR_CROP_MIN_SCALE,
      translateX: 0,
      translateY: 0,
    };
    transformRef.current = initialTransform;
    scale.value = initialTransform.scale;
    translateX.value = initialTransform.translateX;
    translateY.value = initialTransform.translateY;
  }, [asset?.uri, scale, translateX, translateY, visible]);

  const clampOnUI = useCallback(
    (nextScale: number, nextTranslateX: number, nextTranslateY: number) => {
      'worklet';

      const boundedScale = Math.min(
        Math.max(nextScale, AVATAR_CROP_MIN_SCALE),
        AVATAR_CROP_MAX_SCALE,
      );
      const renderedWidth = baseImageWidth * boundedScale;
      const renderedHeight = baseImageHeight * boundedScale;
      const maxTranslateX = Math.max(0, (renderedWidth - cropSize) / 2);
      const maxTranslateY = Math.max(0, (renderedHeight - cropSize) / 2);

      return {
        scale: boundedScale,
        translateX: Math.min(Math.max(nextTranslateX, -maxTranslateX), maxTranslateX),
        translateY: Math.min(Math.max(nextTranslateY, -maxTranslateY), maxTranslateY),
      };
    },
    [baseImageHeight, baseImageWidth, cropSize],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onBegin(() => {
        panStartX.value = translateX.value;
        panStartY.value = translateY.value;
      })
      .onUpdate((event) => {
        const clamped = clampOnUI(
          scale.value,
          panStartX.value + event.translationX,
          panStartY.value + event.translationY,
        );
        translateX.value = clamped.translateX;
        translateY.value = clamped.translateY;
      })
      .onEnd(() => {
        runOnJS(syncTransform)({
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        });
      });

    const pinch = Gesture.Pinch()
      .onBegin(() => {
        pinchStartScale.value = scale.value;
      })
      .onUpdate((event) => {
        const clamped = clampOnUI(
          pinchStartScale.value * event.scale,
          translateX.value,
          translateY.value,
        );
        scale.value = clamped.scale;
        translateX.value = clamped.translateX;
        translateY.value = clamped.translateY;
      })
      .onEnd(() => {
        runOnJS(syncTransform)({
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        });
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [
    clampOnUI,
    panStartX,
    panStartY,
    pinchStartScale,
    scale,
    syncTransform,
    translateX,
    translateY,
  ]);

  const imageStyle = useAnimatedStyle(() => {
    const renderedWidth = baseImageWidth * scale.value;
    const renderedHeight = baseImageHeight * scale.value;

    return {
      width: renderedWidth,
      height: renderedHeight,
      left: (cropSize - renderedWidth) / 2 + translateX.value,
      top: (cropSize - renderedHeight) / 2 + translateY.value,
    };
  }, [baseImageHeight, baseImageWidth, cropSize]);

  const handleConfirm = () => {
    if (!asset?.uri || confirming) {
      return;
    }

    const currentTransform = clampAvatarCropTransform({
      ...source,
      cropSize,
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    });
    transformRef.current = currentTransform;
    onConfirm(
      getAvatarCropSelection({
        ...source,
        cropSize,
        ...currentTransform,
      }),
    );
  };

  return (
    <Modal
      visible={visible && !!asset?.uri}
      transparent
      animationType="fade"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop} testID="avatar-crop-modal">
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              disabled={confirming}
              onPress={onCancel}
              style={styles.iconButton}
              testID="avatar-crop-cancel"
            >
              <X color={colors.primaryText} size={20} />
            </Pressable>
            <Text style={styles.title}>{t('components.avatar.crop_title')}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={confirming}
              onPress={handleConfirm}
              style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
              testID="avatar-crop-confirm"
            >
              {confirming ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Check color={colors.background} size={20} />
              )}
              <Text style={styles.confirmButtonText}>
                {t('components.avatar.crop_confirm')}
              </Text>
            </Pressable>
          </View>

          <GestureDetector gesture={gesture}>
            <View style={styles.cropFrame} testID="avatar-crop-frame">
              {asset?.uri ? (
                <Animated.Image
                  source={{ uri: asset.uri }}
                  resizeMode="cover"
                  style={[styles.cropImage, imageStyle]}
                  testID="avatar-crop-image"
                />
              ) : null}
            </View>
          </GestureDetector>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean, cropSize: number) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
      backgroundColor: isDark ? 'rgba(3,8,16,0.88)' : 'rgba(10,16,32,0.58)',
    },
    sheet: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: SPACING.xl,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.xl + 8,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.10 : 0.08),
    },
    header: {
      width: '100%',
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
      backgroundColor: withAlpha(colors.primaryText, isDark ? 0.10 : 0.06),
    },
    confirmButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      borderRadius: 22,
      backgroundColor: colors.primaryText,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.2),
    },
    confirmButtonDisabled: {
      opacity: 0.65,
    },
    confirmButtonText: {
      color: colors.background,
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
    },
    cropFrame: {
      width: cropSize,
      height: cropSize,
      borderRadius: cropSize / 2,
      overflow: 'hidden',
      backgroundColor: colors.background,
      borderWidth: 2,
      borderColor: withAlpha(colors.white, isDark ? 0.42 : 0.72),
    },
    cropImage: {
      position: 'absolute',
    },
  });

export default AvatarCropModal;
