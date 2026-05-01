import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { X } from 'lucide-react-native';
import { ShareStoryCard } from '@/components/share/ShareStoryCard';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useResolvedAvatarUrl } from '@/hooks/useResolvedAvatarUrl';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  buildShareStoryPayload,
  parseShareableAnalysisData,
  resolveShareStoryExportErrorMessage,
} from '@/utils/shareStory';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultScaledRadius,
} from '@/utils/resultLayout';

const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const PREVIEW_MAX_WIDTH = 420;

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ShareStoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { userProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const { showAlert, alertElement } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(windowWidth), [windowWidth]);
  const captureTargetRef = useRef<any>(null);
  const resolvedAvatarUrl = useResolvedAvatarUrl(userProfile?.avatar_url);

  const [imageReady, setImageReady] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);
  const [headerLeftWidth, setHeaderLeftWidth] = useState(44);
  const [headerRightWidth, setHeaderRightWidth] = useState(44);

  const analysisData = useMemo(
    () => parseShareableAnalysisData(params.analysisData),
    [params.analysisData]
  );
  const imageUri = getParamValue(params.imageUri);

  const payload = useMemo(() => {
    if (!analysisData) {
      return null;
    }

    return buildShareStoryPayload({
      analysisData,
      imageUri,
      avatarUrl: resolvedAvatarUrl,
      locale,
      t,
    });
  }, [analysisData, imageUri, locale, resolvedAvatarUrl, t]);

  useEffect(() => {
    setImageReady(!payload?.heroImageUri);
  }, [payload?.heroImageUri]);

  const styles = useMemo(
    () => createStyles(colors, insets, isDark, layout),
    [colors, insets, isDark, layout],
  );
  const headerSideReserveWidth = Math.max(
    headerLeftWidth,
    headerRightWidth,
    layout.headerSlotSize,
  );
  const previewCardWidth = useMemo(() => {
    const horizontalPadding = insets.left + insets.right + SPACING.page * 2;
    const verticalPadding = insets.top + insets.bottom + SPACING.sm + SPACING.lg;
    const shellVerticalPadding = SPACING.sm * 2;
    const availableWidth = Math.max(windowWidth - horizontalPadding, 0);
    const availableHeight = Math.max(
      windowHeight - verticalPadding - headerHeight - SPACING.lg - shellVerticalPadding,
      0
    );

    const widthCandidates = [availableWidth, PREVIEW_MAX_WIDTH];
    if (availableHeight > 0) {
      widthCandidates.push(availableHeight * (9 / 16));
    }

    const nextWidth = Math.max(0, Math.min(...widthCandidates));
    return nextWidth > 0 ? nextWidth : Math.max(0, Math.min(availableWidth, PREVIEW_MAX_WIDTH));
  }, [
    headerHeight,
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    windowHeight,
    windowWidth,
  ]);
  const previewCardHeight = previewCardWidth > 0 ? previewCardWidth * (16 / 9) : 0;

  const handleLeftSlotLayout = ({ nativeEvent: { layout: eventLayout } }: LayoutChangeEvent) => {
    const nextWidth = Math.max(layout.headerSlotSize, Math.ceil(eventLayout.width));
    setHeaderLeftWidth(nextWidth);
  };

  const handleRightSlotLayout = ({ nativeEvent: { layout: eventLayout } }: LayoutChangeEvent) => {
    const nextWidth = Math.max(layout.headerSlotSize, Math.ceil(eventLayout.width));
    setHeaderRightWidth(nextWidth);
  };

  const handleHeaderLayout = ({ nativeEvent: { layout: eventLayout } }: LayoutChangeEvent) => {
    const nextHeight = Math.max(layout.headerMinHeight, Math.ceil(eventLayout.height));
    setHeaderHeight(nextHeight);
  };

  const handleClose = () => {
    router.back();
  };

  const handleShare = async () => {
    if (!payload || !imageReady || isSharing) {
      return;
    }

    try {
      setIsSharing(true);

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        showAlert(
          t('share_story.unavailable.title'),
          t('share_story.unavailable.message'),
          [{ text: t('common.ok') }]
        );
        return;
      }

      const captureUri = await captureRef(captureTargetRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
      });

      await Sharing.shareAsync(captureUri, {
        mimeType: 'image/png',
        dialogTitle: t('share_story.dialog.title'),
      });
    } catch (error) {
      const errorMessage = resolveShareStoryExportErrorMessage(error, t);
      if (!errorMessage) {
        return;
      }

      showAlert(
        t('share_story.error.title'),
        errorMessage,
        [{ text: t('common.ok') }]
      );
    } finally {
      setIsSharing(false);
    }
  };

  const shareReady = !!payload && imageReady && !isSharing;
  const previewTitle = t('share_story.header.title');
  const shareActionLabel = t('share_story.actions.share');
  const sharePreparingLabel = t('share_story.actions.preparing');

  const renderHeader = (showShareAction: boolean) => (
    <View onLayout={handleHeaderLayout} style={styles.header} testID="share-story-header">
      <View onLayout={handleLeftSlotLayout} style={styles.headerSideSlot}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={handleClose}
          style={styles.iconButton}
          testID="share-story-close-button"
        >
          <X color={colors.primaryText} size={20} />
        </TouchableOpacity>
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.headerTitleWrap,
          {
            left: headerSideReserveWidth,
            right: headerSideReserveWidth,
          },
        ]}
      >
        <Text
          {...RESULT_TEXT_PROPS}
          adjustsFontSizeToFit
          minimumFontScale={0.86}
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.headerTitle}
          testID="share-story-header-title"
        >
          {previewTitle}
        </Text>
      </View>

      <View
        onLayout={handleRightSlotLayout}
        style={[styles.headerSideSlot, styles.headerSideSlotTrailing]}
      >
        {showShareAction ? (
          <TouchableOpacity
            accessibilityLabel={isSharing ? sharePreparingLabel : shareActionLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: isSharing, disabled: !shareReady }}
            disabled={!shareReady}
            onPress={handleShare}
            style={styles.shareHeaderButton}
            testID="share-story-share-button"
          >
            {isSharing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
                <Text
                  {...RESULT_TEXT_PROPS}
                  adjustsFontSizeToFit
                  minimumFontScale={0.86}
                  numberOfLines={2}
                  style={[
                    styles.shareHeaderButtonText,
                    { opacity: shareReady ? 1 : 0.42 },
                  ]}
                >
                {shareActionLabel}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSidePlaceholder} />
        )}
      </View>
    </View>
  );

  if (!analysisData || !payload) {
    return (
      <View style={styles.screen} testID="share-story-empty-state">
        {alertElement}
        {renderHeader(false)}

        <View style={styles.emptyState}>
          <Text {...RESULT_TEXT_PROPS} style={styles.emptyTitle}>
            {t('share_story.empty.title')}
          </Text>
          <Text {...RESULT_TEXT_PROPS} style={styles.emptyText}>
            {t('share_story.empty.message')}
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleClose}>
            <Text
              {...RESULT_TEXT_PROPS}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
              numberOfLines={2}
              style={styles.emptyButtonText}
            >
              {t('common.back')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="share-story-screen">
      {alertElement}
      {renderHeader(true)}

      <View style={styles.previewArea}>
        <View style={styles.previewShell}>
          <View
            ref={captureTargetRef}
            collapsable={false}
            style={[
              styles.captureFrame,
              previewCardWidth > 0 && {
                width: previewCardWidth,
                height: previewCardHeight,
                borderRadius: getResultScaledRadius('hero', previewCardWidth / 360),
              },
            ]}
            testID="share-story-capture-frame"
          >
            <ShareStoryCard
              cardWidth={previewCardWidth}
              payload={payload}
              onHeroImageLoadEnd={() => setImageReady(true)}
              testID="share-story-card"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (
  colors: ThemeColors,
  insets: EdgeInsets,
  isDark: boolean,
  layout: ReturnType<typeof getResultLayoutState>,
) => {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: insets.top + SPACING.sm,
      paddingBottom: insets.bottom + SPACING.lg,
      paddingLeft: insets.left + SPACING.page,
      paddingRight: insets.right + SPACING.page,
    },
    header: {
      minHeight: layout.headerMinHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.lg,
      position: 'relative',
    },
    headerSideSlot: {
      minHeight: layout.headerSlotSize,
      flexShrink: 0,
      justifyContent: 'center',
    },
    headerSideSlotTrailing: {
      alignItems: 'flex-end',
    },
    headerSidePlaceholder: {
      width: layout.headerSlotSize,
      height: layout.headerSlotSize,
    },
    iconButton: {
      width: layout.headerSlotSize,
      height: layout.headerSlotSize,
      borderRadius: layout.headerSlotSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.06)
        : withAlpha(colors.primaryText, 0.04),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.08),
    },
    headerTitle: {
      textAlign: 'center',
      fontSize: layout.headerTitleFontSize,
      lineHeight: layout.headerTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      paddingHorizontal: SPACING.sm,
      includeFontPadding: false,
    },
    headerTitleWrap: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareHeaderButton: {
      minWidth: 44,
      minHeight: layout.headerSlotSize,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      borderRadius: layout.headerSlotSize / 2,
      backgroundColor: isDark
        ? withAlpha(colors.primary, 0.14)
        : withAlpha(colors.primary, 0.08),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark
        ? withAlpha(colors.primary, 0.22)
        : withAlpha(colors.primary, 0.16),
    },
    shareHeaderButtonText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
      textAlign: 'center',
      includeFontPadding: false,
    },
    previewArea: {
      flex: 1,
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewShell: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.sm,
    },
    captureFrame: {
      width: '100%',
      shadowColor: isDark ? '#000000' : mixColors(colors.primary, '#000000', 0.2),
      shadowOpacity: isDark ? 0.3 : 0.12,
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 28,
      elevation: 8,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
      gap: SPACING.md,
    },
    emptyTitle: {
      fontSize: SIZES.xl,
      lineHeight: 30,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
      flexShrink: 1,
    },
    emptyText: {
      fontSize: SIZES.md,
      lineHeight: 22,
      color: withAlpha(colors.primaryText, isDark ? 0.74 : 0.6),
      textAlign: 'center',
    },
    emptyButton: {
      minWidth: 160,
      minHeight: layout.ctaMinHeight,
      borderRadius: layout.ctaRadius,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
      backgroundColor: colors.primary,
      marginTop: SPACING.sm,
    },
    emptyButtonText: {
      color: colors.white,
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      textAlign: 'center',
      includeFontPadding: false,
    },
  });
};
