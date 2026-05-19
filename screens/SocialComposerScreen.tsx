import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  type KeyboardEvent,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import { AtSign, Camera, Globe2, Hash, ImagePlus } from 'lucide-react-native';

import { AppScreen } from '@/components/AppScreen';
import { OptimizedImage } from '@/components/OptimizedImage';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SocialCategoryPill } from '@/components/social/SocialCategoryPill';
import { SocialIdentityRow } from '@/components/social/SocialIdentityRow';
import { ShareStoryCard } from '@/components/share/ShareStoryCard';
import { SOCIAL_POST_MAX_LENGTH } from '@/constants/social';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSocialMutations } from '@/hooks/queries/useSocialMutations';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { trackEvent } from '@/services/analytics';
import {
  getSocialComposerDraft,
  removeSocialComposerDraft,
} from '@/services/socialDraftStore';
import {
  SocialServiceError,
  isGenericSocialPublishError,
  resolveSocialPublishErrorMessage,
  resolveDefaultSocialCategoryForSharePayload,
  validateSocialPostInput,
} from '@/services/social';
import { safeParseJsonRouteParam } from '@/utils/deepLinkSchemas';
import {
  getKeyboardAvoidingViewBehavior,
  getKeyboardSafeFooterPadding,
} from '@/utils/mobileLayout';
import { logOperationalError } from '@/utils/observability';
import { parseShareStoryPayload } from '@/utils/shareStory';
import type {
  ShareStoryPayload,
  SocialCategory,
  SocialComposerDraft,
} from '@/types';
import { Squircle } from '@/components/Squircle';

const CAPTURE_WIDTH = 1080;
const CAPTURE_HEIGHT = 1920;
const CAPTION_SCROLL_TOP_COMFORT_OFFSET = SPACING.xxxl * 2;
const FOOTER_COMPACT_GAP = SPACING.xs;
const FOOTER_COMPACT_TOP_PADDING = SPACING.sm;
const FOOTER_DEFAULT_GAP = SPACING.sm;
const FOOTER_DEFAULT_TOP_PADDING = SPACING.md;
const FOOTER_BOTTOM_PADDING = SPACING.sm;
const SCROLL_CONTENT_FOOTER_SPACING = SPACING.sm;

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseSharePayload(value: string | string[] | undefined) {
  const parsed = safeParseJsonRouteParam(value);
  if (parsed === null) {
    return null;
  }

  return parseShareStoryPayload(parsed);
}

function resolveCategoryFromLegacyParams(
  explicitCategory: string | string[] | undefined,
  sharePayload?: ShareStoryPayload | null,
) {
  const normalizedExplicitCategory = getSingleParam(explicitCategory);
  if (
    normalizedExplicitCategory === 'before_after' ||
    normalizedExplicitCategory === 'food' ||
    normalizedExplicitCategory === 'physique'
  ) {
    return normalizedExplicitCategory;
  }

  return resolveDefaultSocialCategoryForSharePayload(sharePayload);
}

function applyDraftToComposer(
  draft: SocialComposerDraft | null,
  legacySharePayload: ShareStoryPayload | null,
  legacyScanId: string | null,
  legacyCategoryParam: string | string[] | undefined,
) {
  if (draft) {
    return {
      source: draft.source,
      scanId: draft.scanId,
      category: draft.category,
      caption: draft.caption,
      sharePayload:
        draft.asset.kind === 'share_story' ? draft.asset.payload : null,
      selectedImageUri:
        draft.asset.kind === 'local_image' ? draft.asset.imageUri : null,
    };
  }

  return {
    source: legacySharePayload ? ('share_story' as const) : ('composer' as const),
    scanId: legacyScanId,
    category: resolveCategoryFromLegacyParams(
      legacyCategoryParam,
      legacySharePayload,
    ),
    caption: '',
    sharePayload: legacySharePayload,
    selectedImageUri: null,
  };
}

export default function SocialComposerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { userProfile } = useAuth();
  const { alertElement, showAlert } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const { createPostMutation } = useSocialMutations();
  const showAlertRef = useRef(showAlert);
  const translateRef = useRef(t);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const captionInputRef = useRef<TextInput | null>(null);
  const captionScrollFrameRef = useRef<number | null>(null);
  const legacyScanId = getSingleParam(params.scanId) ?? null;
  const routeDraftId = getSingleParam(params.draftId) ?? null;
  const legacySharePayload = useMemo(
    () => parseSharePayload(params.sharePayload),
    [params.sharePayload],
  );
  const [caption, setCaption] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [prefillSharePayload, setPrefillSharePayload] =
    useState<ShareStoryPayload | null>(legacySharePayload);
  const [scanId, setScanId] = useState<string | null>(legacyScanId);
  const [draftSource, setDraftSource] = useState<'composer' | 'share_story'>(
    legacySharePayload ? 'share_story' : 'composer',
  );
  const [shareCardReady, setShareCardReady] = useState(
    !legacySharePayload?.heroImageUri,
  );
  const [category, setCategory] = useState<SocialCategory>(
    resolveCategoryFromLegacyParams(params.defaultCategory, legacySharePayload),
  );
  const [isHydratingDraft, setIsHydratingDraft] = useState(!!routeDraftId);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [isCaptionFocused, setIsCaptionFocused] = useState(false);
  const [captionSectionY, setCaptionSectionY] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const previewCaptureRef = useRef<View | null>(null);
  const submitInFlightRef = useRef(false);
  const isIos = Platform.OS === 'ios';

  useEffect(() => {
    showAlertRef.current = showAlert;
    translateRef.current = t;
  }, [showAlert, t]);

  useEffect(() => {
    let isMounted = true;

    const hydrateComposerDraft = async () => {
      setIsHydratingDraft(!!routeDraftId);

      const storedDraft = routeDraftId
        ? await getSocialComposerDraft(routeDraftId)
        : null;
      const nextComposerState = applyDraftToComposer(
        storedDraft,
        legacySharePayload,
        legacyScanId,
        params.defaultCategory,
      );

      if (!isMounted) {
        return;
      }

      if (routeDraftId && !storedDraft) {
        showAlertRef.current(
          translateRef.current('social.composer.error_title'),
          translateRef.current('social.composer.draft_missing'),
          [{ text: translateRef.current('common.ok') }],
        );
      }

      setCaption(nextComposerState.caption);
      setSelectedImageUri(nextComposerState.selectedImageUri);
      setPrefillSharePayload(nextComposerState.sharePayload);
      setScanId(nextComposerState.scanId);
      setCategory(nextComposerState.category);
      setDraftSource(nextComposerState.source);
      setShareCardReady(!nextComposerState.sharePayload?.heroImageUri);
      setIsHydratingDraft(false);
    };

    void hydrateComposerDraft();

    return () => {
      isMounted = false;
    };
  }, [
    legacyScanId,
    legacySharePayload,
    params.defaultCategory,
    routeDraftId,
  ]);

  useEffect(() => {
    if (isHydratingDraft) {
      return;
    }

    trackEvent('social_post_started', {
      source: draftSource,
      has_scan_id: !!scanId,
    });
  }, [draftSource, isHydratingDraft, scanId]);

  const isUsingGeneratedShareCard = !!prefillSharePayload && !selectedImageUri;
  const shareCardWidth = Math.min(
    windowWidth - SPACING.page * 2 - SPACING.lg * 2,
    360,
  );
  const shareCardHeight = shareCardWidth * (16 / 9);
  const canSubmit =
    !isHydratingDraft &&
    !isSubmittingPost &&
    !!category &&
    !createPostMutation.isPending &&
    !!(
      caption.trim() ||
      selectedImageUri ||
      (prefillSharePayload && shareCardReady)
    );
  const isKeyboardOpen = isKeyboardVisible && keyboardHeight > 0;
  const isCaptionEditing = isCaptionFocused || isKeyboardOpen;
  const footerBottomPadding = getKeyboardSafeFooterPadding({
    bottomInset: insets.bottom,
    restingPadding: FOOTER_BOTTOM_PADDING,
    keyboardPadding: FOOTER_BOTTOM_PADDING,
    keyboardVisible: isKeyboardOpen,
    minimumInsetPadding: SPACING.sm,
  });
  const scrollContentBottomPadding = Math.max(
    footerHeight + SCROLL_CONTENT_FOOTER_SPACING,
    SPACING.xxxl,
  );

  const scrollCaptionIntoView = useCallback(() => {
    const scrollView = scrollViewRef.current;
    if (!scrollView || captionSectionY === null) {
      return;
    }

    scrollView.scrollTo({
      y: Math.max(captionSectionY - CAPTION_SCROLL_TOP_COMFORT_OFFSET, 0),
      animated: true,
    });
  }, [captionSectionY]);

  const cancelScheduledCaptionScroll = useCallback(() => {
    if (captionScrollFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(captionScrollFrameRef.current);
    captionScrollFrameRef.current = null;
  }, []);

  const scheduleCaptionScrollIntoView = useCallback(() => {
    cancelScheduledCaptionScroll();
    captionScrollFrameRef.current = requestAnimationFrame(() => {
      captionScrollFrameRef.current = null;
      scrollCaptionIntoView();
    });
  }, [cancelScheduledCaptionScroll, scrollCaptionIntoView]);

  const handleCaptionFocus = useCallback(() => {
    setIsCaptionFocused(true);
    scheduleCaptionScrollIntoView();
  }, [scheduleCaptionScrollIntoView]);

  const handleCaptionBlur = useCallback(() => {
    cancelScheduledCaptionScroll();
    setIsCaptionFocused(false);
  }, [cancelScheduledCaptionScroll]);

  const insertCaptionToken = useCallback(
    (token: '#' | '@') => {
      setCaption((currentCaption) => {
        const separator =
          currentCaption.length === 0 || currentCaption.endsWith(' ') ? '' : ' ';
        return `${currentCaption}${separator}${token}`;
      });
      scheduleCaptionScrollIntoView();
      requestAnimationFrame(() => {
        captionInputRef.current?.focus();
      });
    },
    [scheduleCaptionScrollIntoView],
  );

  const handleCaptionSectionLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      const nextCaptionSectionY = Math.max(Math.round(layout.y), 0);
      setCaptionSectionY((currentCaptionSectionY) =>
        currentCaptionSectionY === nextCaptionSectionY
          ? currentCaptionSectionY
          : nextCaptionSectionY,
      );
    },
    [],
  );

  const handleFooterLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      const nextFooterHeight = Math.ceil(layout.height);
      setFooterHeight((currentFooterHeight) =>
        currentFooterHeight === nextFooterHeight
          ? currentFooterHeight
          : nextFooterHeight,
      );
    },
    [],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const handleKeyboardShow = (event: KeyboardEvent) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      if (isCaptionFocused) {
        scheduleCaptionScrollIntoView();
      }
    };

    const handleKeyboardHide = () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    };

    const keyboardShowSubscription = Keyboard.addListener(
      isIos ? 'keyboardWillShow' : 'keyboardDidShow',
      handleKeyboardShow,
    );
    const keyboardHideSubscription = Keyboard.addListener(
      isIos ? 'keyboardWillHide' : 'keyboardDidHide',
      handleKeyboardHide,
    );

    return () => {
      keyboardShowSubscription.remove();
      keyboardHideSubscription.remove();
    };
  }, [isCaptionFocused, isIos, scheduleCaptionScrollIntoView]);

  useEffect(() => cancelScheduledCaptionScroll, [cancelScheduledCaptionScroll]);

  useEffect(() => {
    if (!isCaptionFocused || captionSectionY === null) {
      return;
    }

    scheduleCaptionScrollIntoView();
  }, [
    captionSectionY,
    footerHeight,
    isCaptionFocused,
    isKeyboardOpen,
    scheduleCaptionScrollIntoView,
  ]);

  const pickImage = async (mode: 'camera' | 'library') => {
    try {
      if (mode === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          showAlert(
            t('social.composer.error_title'),
            t('components.avatar.perm_camera'),
            [{ text: t('common.ok') }],
          );
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.9,
          mediaTypes: ['images'],
        });

        if (!result.canceled && result.assets[0]) {
          setSelectedImageUri(result.assets[0].uri);
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.9,
        mediaTypes: ['images'],
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('social.composer.error_asset');
      showAlert(t('social.composer.error_title'), message, [{ text: t('common.ok') }]);
    }
  };

  const handleSubmit = async () => {
    if (submitInFlightRef.current || createPostMutation.isPending) {
      return;
    }

    try {
      submitInFlightRef.current = true;
      setIsSubmittingPost(true);

      let assetSourceUri: string | null = selectedImageUri;

      if (!assetSourceUri && prefillSharePayload) {
        if (!shareCardReady) {
          throw new Error(t('social.composer.generating_asset'));
        }

        assetSourceUri = await captureRef(previewCaptureRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
          width: CAPTURE_WIDTH,
          height: CAPTURE_HEIGHT,
        });
      }

      const normalizedCaption = caption.trim()
        ? validateSocialPostInput(caption)
        : '';

      await createPostMutation.mutateAsync({
        category,
        contentText: normalizedCaption,
        scanId,
        sharePayload: prefillSharePayload,
        assetSourceUri,
      });

      if (routeDraftId) {
        await removeSocialComposerDraft(routeDraftId);
      }

      router.back();
    } catch (error) {
      if (isGenericSocialPublishError(error)) {
        logOperationalError('[SocialComposer] Masked publish error', error, {
          masked_publish_error: true,
          function_name:
            error instanceof SocialServiceError ? error.functionName : undefined,
        });
      }

      const message = resolveSocialPublishErrorMessage(
        error,
        t('social.composer.error_submit'),
      );
      showAlert(t('social.composer.error_title'), message, [{ text: t('common.ok') }]);
    } finally {
      submitInFlightRef.current = false;
      setIsSubmittingPost(false);
    }
  };

  const renderAssetButtons = (compact = false) => (
    <View
      style={compact ? styles.compactAssetActions : styles.heroAssetActions}
      testID={compact ? 'social-compose-asset-actions-compact' : 'social-compose-asset-actions'}
    >
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => {
          void pickImage('library');
        }}
        style={compact ? styles.compactPrimaryButton : styles.heroPrimaryButton}
        testID="social-compose-library-button"
      >
        <ImagePlus color={compact ? colors.primaryText : colors.background} size={18} />
        <Text
          style={
            compact ? styles.compactPrimaryButtonLabel : styles.heroPrimaryButtonLabel
          }
        >
          {t('social.composer.pick_library')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => {
          void pickImage('camera');
        }}
        style={compact ? styles.compactSecondaryButton : styles.heroSecondaryButton}
        testID="social-compose-camera-button"
      >
        <Camera color={colors.primaryText} size={18} />
        <Text style={styles.heroSecondaryButtonLabel}>
          {t('social.composer.pick_camera')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AppScreen bottomInset={false} style={styles.container}>
      {alertElement}
      <KeyboardAvoidingView
        behavior={getKeyboardAvoidingViewBehavior()}
        style={styles.container}
        testID="social-compose-keyboard-shell"
      >
        <ScreenHeader
          title={t('social.composer.title')}
          subtitle={t('social.composer.subtitle')}
          variant="inline"
          topInset={false}
          onBack={() => router.back()}
          backTestID="social-compose-back-button"
          testID="social-compose-header"
        />

        <ScrollView
          ref={scrollViewRef}
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustKeyboardInsets={false}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: scrollContentBottomPadding },
          ]}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={isIos ? 'interactive' : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID="social-compose-scroll-view"
        >
          <View style={styles.identityRow}>
            <SocialIdentityRow
              username={userProfile?.username}
              avatarUrl={userProfile?.avatar_url}
              meta={t('social.composer.identity_meta')}
              avatarSize={40}
              testID="social-compose-identity"
            />
          </View>

          {isHydratingDraft ? (
            <Squircle style={styles.loadingCard} testID="social-compose-draft-loading">
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.helperText}>{t('social.composer.draft_loading')}</Text>
            </Squircle>
          ) : null}

          <View style={styles.heroSection}>
            <Text style={styles.sectionLabel}>{t('social.composer.asset_label')}</Text>
            {selectedImageUri ? (
              <Squircle style={styles.heroCard} testID="social-compose-asset-card">
                <View style={styles.heroHeaderRow}>
                  <Text style={styles.heroTitle}>{t('social.composer.asset_ready')}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setSelectedImageUri(null)}
                    style={styles.removeAssetButton}
                    testID="social-compose-remove-asset"
                  >
                    <Text style={styles.removeAssetLabel}>
                      {t('social.composer.remove_asset')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <OptimizedImage
                  source={{ uri: selectedImageUri }}
                  contentFit="cover"
                  recyclingKey={selectedImageUri}
                  style={styles.heroImagePreview}
                  testID="social-compose-image-preview"
                />
                {renderAssetButtons(true)}
              </Squircle>
            ) : prefillSharePayload ? (
              <Squircle style={styles.heroCard} testID="social-compose-asset-card">
                <View style={styles.heroHeaderBlock}>
                  <Text style={styles.prefillLabel}>{t('social.composer.prefill_label')}</Text>
                  <Text style={styles.heroTitle}>{t('social.composer.generated_preview')}</Text>
                </View>
                <Squircle
                  ref={previewCaptureRef}
                  collapsable={false}
                  style={[
                    styles.shareCardCapture,
                    {
                      width: shareCardWidth,
                      height: shareCardHeight,
                    },
                  ]}
                  testID="social-compose-share-preview"
                >
                  <ShareStoryCard
                    payload={prefillSharePayload}
                    cardWidth={shareCardWidth}
                    onHeroImageLoadEnd={() => setShareCardReady(true)}
                  />
                </Squircle>
                <Text style={styles.heroHelper}>
                  {isUsingGeneratedShareCard && !shareCardReady
                    ? t('social.composer.generating_asset')
                    : t('social.composer.generated_helper')}
                </Text>
                {renderAssetButtons(true)}
              </Squircle>
            ) : (
              <Squircle style={styles.heroCard} testID="social-compose-asset-card">
                <Squircle style={styles.heroPlaceholderIcon}>
                  <ImagePlus color={colors.primary} size={28} />
                </Squircle>
                <Text style={styles.heroTitle}>{t('social.composer.placeholder_title')}</Text>
                <Text style={styles.heroBody}>{t('social.composer.placeholder_body')}</Text>
                {renderAssetButtons(false)}
              </Squircle>
            )}
          </View>

          <View
            onLayout={handleCaptionSectionLayout}
            style={styles.composerSection}
            testID="social-compose-caption-section"
          >
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>{t('social.composer.caption_label')}</Text>
              <Text style={styles.helperText}>
                {t('social.composer.caption_count', {
                  count: caption.length,
                  max: SOCIAL_POST_MAX_LENGTH,
                })}
              </Text>
            </View>
            <TextInput
              ref={captionInputRef}
              multiline
              maxLength={SOCIAL_POST_MAX_LENGTH}
              placeholder={t('social.composer.caption_placeholder')}
              placeholderTextColor={colors.gray}
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              onBlur={handleCaptionBlur}
              onFocus={handleCaptionFocus}
              testID="social-compose-caption-input"
            />
            <View style={styles.quickToolsRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('social.composer.hashtags')}
                onPress={() => insertCaptionToken('#')}
                style={styles.quickToolButton}
                testID="social-compose-hashtag-button"
              >
                <Hash color={colors.primaryText} size={17} />
                <Text style={styles.quickToolLabel}>
                  {t('social.composer.hashtags')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('social.composer.mention')}
                onPress={() => insertCaptionToken('@')}
                style={styles.quickToolButton}
                testID="social-compose-mention-button"
              >
                <AtSign color={colors.primaryText} size={17} />
                <Text style={styles.quickToolLabel}>
                  {t('social.composer.mention')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {!isCaptionEditing ? (
            <View
              style={styles.composerSection}
              testID="social-compose-category-section"
            >
              <Text style={styles.sectionLabel}>{t('social.composer.category_label')}</Text>
              <View style={styles.categoryGrid}>
                {(['before_after', 'food', 'physique'] as const).map((item) => (
                  <SocialCategoryPill
                    key={item}
                    category={item}
                    selected={category === item}
                    onPress={() => setCategory(item)}
                  />
                ))}
              </View>
              <Squircle style={styles.visibilityRow} testID="social-compose-visibility-row">
                <Squircle style={styles.visibilityIcon}>
                  <Globe2 color={colors.primaryText} size={18} />
                </Squircle>
                <View style={styles.visibilityCopy}>
                  <Text style={styles.visibilityTitle}>
                    {t('social.composer.visibility_title')}
                  </Text>
                  <Text style={styles.visibilityBody}>
                    {t('social.composer.visibility_body')}
                  </Text>
                </View>
              </Squircle>
            </View>
          ) : null}
        </ScrollView>

        <View
          onLayout={handleFooterLayout}
          style={[
            styles.footer,
            {
              gap: isCaptionEditing ? FOOTER_COMPACT_GAP : FOOTER_DEFAULT_GAP,
              paddingTop: isCaptionEditing
                ? FOOTER_COMPACT_TOP_PADDING
                : FOOTER_DEFAULT_TOP_PADDING,
              paddingBottom: footerBottomPadding,
            },
          ]}
          testID="social-compose-footer"
        >
          <TouchableOpacity
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={() => {
              void handleSubmit();
            }}
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            testID="social-compose-submit"
          >
            {createPostMutation.isPending || isSubmittingPost ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.submitButtonLabel}>{t('social.composer.submit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    headerText: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    subtitle: {
      fontSize: SIZES.text14,
      color: colors.textMuted ?? colors.gray,
    },
    content: {
      paddingHorizontal: SPACING.page,
      paddingVertical: SPACING.md,
      gap: SPACING.lg,
    },
    identityRow: {
      paddingHorizontal: SPACING.xs,
    },
    loadingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    heroSection: {
      gap: SPACING.sm,
    },
    composerSection: {
      gap: SPACING.sm,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    sectionLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gray,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    captionInput: {
      minHeight: 128,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      color: colors.primaryText,
      fontSize: SIZES.text14,
      textAlignVertical: 'top',
      lineHeight: 22, borderCurve: 'continuous',
    },
    quickToolsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    quickToolButton: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    quickToolLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    helperText: {
      fontSize: SIZES.text12,
      color: colors.textMuted ?? colors.gray,
    },
    heroCard: {
      gap: SPACING.md,
      padding: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.06), borderCurve: 'continuous',
    },
    visibilityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.05),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    visibilityIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground, borderCurve: 'continuous',
    },
    visibilityCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    visibilityTitle: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    visibilityBody: {
      fontSize: SIZES.text12,
      lineHeight: 17,
      color: colors.textMuted ?? colors.gray,
    },
    heroHeaderBlock: {
      gap: SPACING.xs,
    },
    heroHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    heroPlaceholderIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.12),
      alignSelf: 'center', borderCurve: 'continuous',
    },
    heroTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    heroBody: {
      fontSize: SIZES.text14,
      lineHeight: 21,
      color: colors.textMuted ?? colors.gray,
    },
    heroHelper: {
      fontSize: SIZES.text12,
      color: colors.textMuted ?? colors.gray,
    },
    prefillLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    removeAssetButton: {
      minHeight: 32,
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    removeAssetLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    shareCardCapture: {
      alignSelf: 'center',
      overflow: 'hidden',
      borderRadius: BORDER_RADIUS.xl, borderCurve: 'continuous',
    },
    heroImagePreview: {
      width: '100%',
      aspectRatio: 4 / 5,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: withAlpha(colors.primaryText, 0.04), borderCurve: 'continuous',
    },
    heroAssetActions: {
      gap: SPACING.sm,
    },
    compactAssetActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    heroPrimaryButton: {
      minHeight: 52,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.primaryText,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.2),
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 4, borderCurve: 'continuous',
    },
    compactPrimaryButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primary, 0.12),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md, borderCurve: 'continuous',
    },
    heroPrimaryButtonLabel: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.background,
    },
    compactPrimaryButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    heroSecondaryButton: {
      minHeight: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.04),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md, borderCurve: 'continuous',
    },
    compactSecondaryButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.04),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md, borderCurve: 'continuous',
    },
    heroSecondaryButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    footer: {
      paddingHorizontal: SPACING.page,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      backgroundColor: colors.background,
    },
    footerHelper: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    submitButton: {
      minHeight: 52,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryText,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.2),
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 4, borderCurve: 'continuous',
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonLabel: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.background,
    },
  });
