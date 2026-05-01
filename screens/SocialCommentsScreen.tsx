import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  type KeyboardEvent,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ChevronLeft, Ellipsis, Flag, Heart, Send } from 'lucide-react-native';

import { SocialPostCard } from '@/components/social/SocialPostCard';
import { SocialProfilePreviewModal } from '@/components/social/SocialProfilePreviewModal';
import { SocialIdentityRow } from '@/components/social/SocialIdentityRow';
import { SocialModerationBadge } from '@/components/social/SocialModerationBadge';
import { SOCIAL_REPORT_REASON_CODES } from '@/constants/social';
import { trackFailureEvent } from '@/services/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import {
  useSocialComments,
  useSocialMutations,
  useSocialPostDetail,
} from '@/hooks/queries';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  buildSocialAlertMessageWithDiagnostics,
  getDisplayedSocialCommentCount,
  prioritizeViewerSocialComments,
  recordSocialPostImpressions,
  recordSocialPostViews,
  shareSocialPostAsset,
  SocialServiceError,
  validateSocialCommentInput,
} from '@/services/social';
import {
  getKeyboardAvoidingViewBehavior,
  getKeyboardSafeFooterPadding,
} from '@/utils/mobileLayout';
import { logOperationalError } from '@/utils/observability';
import type {
  SocialComment,
  SocialModerationStatus,
  SocialPost,
  SocialReportReasonCode,
} from '@/types';

const COMMENT_AUTOSCROLL_BOTTOM_THRESHOLD = 2;
const FOOTER_COMPACT_TOP_PADDING = SPACING.sm;
const FOOTER_DEFAULT_TOP_PADDING = SPACING.md;
const FOOTER_BOTTOM_PADDING = SPACING.sm;
const SCROLL_CONTENT_FOOTER_SPACING = SPACING.sm;

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveCommentComposerAccess(options: {
  currentUserId?: string | null;
  postAuthorId?: string | null;
  postModerationStatus: SocialModerationStatus | null;
}) {
  if (!options.postModerationStatus) {
    return null;
  }

  if (options.postModerationStatus === 'approved') {
    return true;
  }

  return (
    options.postModerationStatus === 'pending' &&
    options.currentUserId === options.postAuthorId
  );
}

function isCommentInteractiveForViewer(
  comment: Pick<SocialComment, 'author_id' | 'moderation_status' | 'deleted_at'>,
  currentUserId?: string | null,
) {
  if (comment.deleted_at) {
    return false;
  }

  if (comment.moderation_status === 'approved') {
    return true;
  }

  return (
    comment.moderation_status === 'pending' &&
    comment.author_id === currentUserId
  );
}

function resolveCommentLikeAccess(options: {
  currentUserId?: string | null;
  postAuthorId?: string | null;
  postModerationStatus: SocialModerationStatus | null;
  comment: Pick<SocialComment, 'author_id' | 'moderation_status' | 'deleted_at'>;
}) {
  const postAllowsInteraction = options.postModerationStatus
    ? resolveCommentComposerAccess({
        currentUserId: options.currentUserId,
        postAuthorId: options.postAuthorId,
        postModerationStatus: options.postModerationStatus,
      })
    : true;

  if (postAllowsInteraction === false) {
    return false;
  }

  return isCommentInteractiveForViewer(options.comment, options.currentUserId);
}

function isOwnedComment(
  comment: Pick<SocialComment, 'author_id'>,
  currentUserId?: string | null,
) {
  return !!currentUserId && comment.author_id === currentUserId;
}

function isEditableCommentForViewer(
  comment: Pick<SocialComment, 'author_id' | 'moderation_status' | 'deleted_at'>,
  currentUserId?: string | null,
) {
  if (!isOwnedComment(comment, currentUserId) || comment.deleted_at) {
    return false;
  }

  return (
    comment.moderation_status === 'approved' ||
    comment.moderation_status === 'pending'
  );
}

function isDeletableCommentForViewer(
  comment: Pick<SocialComment, 'author_id' | 'deleted_at'>,
  currentUserId?: string | null,
) {
  return isOwnedComment(comment, currentUserId) && !comment.deleted_at;
}

export default function SocialCommentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const postId = getSingleParam(params.postId) ?? '';
  // Audit S-12 : on n'utilise plus postAuthorId / postModerationStatus comme fallback
  // (parametres de route facilement forgeables). Les permissions UI doivent etre
  // calculees uniquement a partir de postDetail (recupere via RPC authentifiee).
  const focusComposerOnOpen = getSingleParam(params.focusComposer) === '1';
  const { userProfile } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { alertElement, showAlert } = useCustomAlert();
  const commentsListRef = useRef<FlashListRef<SocialComment> | null>(null);
  const commentsScrollFrameRef = useRef<number | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const focusComposerHandledRef = useRef(false);
  const recordedDetailMetricsPostIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [profilePreviewTarget, setProfilePreviewTarget] = useState<{
    userId: string;
    username?: string | null;
    avatarUrl?: string | null;
  } | null>(null);
  const {
    data: postDetail,
    error: postError,
    isLoading: isPostLoading,
    isPending: isPostPending,
    isFetching: isPostFetching,
    isRefetching: isPostRefetching,
    refetch: refetchPost,
  } = useSocialPostDetail(postId);
  const {
    comments,
    data: commentsInfiniteData,
    error: commentsError,
    isLoading,
    isPending,
    isFetching,
    isRefetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useSocialComments(postId);
  const {
    createCommentMutation,
    deletePostMutation,
    setReactionMutation,
    updateCommentMutation = {
      isPending: false,
      mutateAsync: async () => undefined,
    },
    deleteCommentMutation = {
      isPending: false,
      mutateAsync: async () => undefined,
    },
    reportContentMutation,
    setCommentLikeMutation,
    commentLikeError,
    clearCommentLikeError,
    isCommentLikePending,
    isCommentUpdatePending = () => false,
    isCommentDeletePending = () => false,
    isDeletePending,
    isReactionPending,
  } = useSocialMutations();
  const threadUnavailable =
    !postId ||
    (postError instanceof SocialServiceError && postError.code === 'post_not_found') ||
    (commentsError instanceof SocialServiceError &&
      commentsError.code === 'post_not_found');
  const backendError =
    (postError instanceof Error && !threadUnavailable ? postError : null) ??
    (commentsError instanceof Error && !threadUnavailable ? commentsError : null);
  const commentItems = useMemo(
    () => prioritizeViewerSocialComments(comments, userProfile?.id),
    [comments, userProfile?.id],
  );
  const resolvedPostAuthorId = postDetail?.author_id ?? null;
  const resolvedPostModerationStatus = postDetail?.moderation_status ?? null;
  const displayedCommentCount = getDisplayedSocialCommentCount(postDetail);
  const editingComment = useMemo(
    () =>
      editingCommentId
        ? commentItems.find((comment) => comment.id === editingCommentId) ?? null
        : null,
    [commentItems, editingCommentId],
  );
  const isInitialLoading =
    !threadUnavailable &&
    !backendError &&
    !postDetail &&
    Boolean(isPostPending || isPostLoading || isPending || isLoading);
  const isRefreshing =
    !isInitialLoading &&
    Boolean(isPostRefetching || isPostFetching || isRefetching || isFetching);
  const isCommentsLoading =
    !threadUnavailable &&
    !backendError &&
    !!postDetail &&
    !commentsInfiniteData &&
    Boolean(isPending || isLoading);
  const visibleCommentLikeError =
    commentLikeError?.postId === postId ? commentLikeError : null;
  const canCreateComment = resolveCommentComposerAccess({
    currentUserId: userProfile?.id,
    postAuthorId: resolvedPostAuthorId,
    postModerationStatus: resolvedPostModerationStatus,
  });
  const shouldShowReadOnlyComposer =
    canCreateComment === false && !threadUnavailable && !backendError;
  const isIos = Platform.OS === 'ios';
  const keyboardVerticalOffset = 0;
  const isKeyboardOpen = isKeyboardVisible && keyboardHeight > 0;
  const footerTopPadding = isKeyboardOpen
    ? FOOTER_COMPACT_TOP_PADDING
    : FOOTER_DEFAULT_TOP_PADDING;
  const footerBottomPadding = getKeyboardSafeFooterPadding({
    bottomInset: insets.bottom,
    restingPadding: FOOTER_BOTTOM_PADDING,
    keyboardPadding: FOOTER_BOTTOM_PADDING,
    keyboardVisible: isKeyboardOpen,
    minimumInsetPadding: SPACING.sm,
  });
  const isEditingComment = editingComment !== null;
  const activeCommentMutationPending = isEditingComment
    ? updateCommentMutation.isPending
    : createCommentMutation.isPending;
  const scrollContentBottomPadding = Math.max(
    footerHeight + SCROLL_CONTENT_FOOTER_SPACING,
    SPACING.xxxl,
  );
  const commentLikeErrorDiagnostics = useMemo(() => {
    if (!visibleCommentLikeError) {
      return null;
    }

    const diagnostics: string[] = [];

    if (visibleCommentLikeError.functionName) {
      diagnostics.push(
        `${t('social.errors.reaction_route_label')}: ${visibleCommentLikeError.functionName}`,
      );
    }

    if (visibleCommentLikeError.code) {
      diagnostics.push(
        `${t('social.errors.reaction_code_label')}: ${visibleCommentLikeError.code}`,
      );
    }

    if (typeof visibleCommentLikeError.status === 'number') {
      diagnostics.push(
        `${t('social.errors.reaction_status_label')}: ${visibleCommentLikeError.status}`,
      );
    }

    if (visibleCommentLikeError.requestId) {
      diagnostics.push(
        `${t('social.errors.reaction_request_id_label')}: ${visibleCommentLikeError.requestId}`,
      );
    }

    return diagnostics.join(' | ');
  }, [t, visibleCommentLikeError]);
  const formatCommentActionErrorMessage = useCallback(
    (error: unknown, fallbackMessage: string) =>
      buildSocialAlertMessageWithDiagnostics(error, fallbackMessage, {
        routeLabel: t('social.errors.reaction_route_label'),
        codeLabel: t('social.errors.reaction_code_label'),
        requestIdLabel: t('social.errors.reaction_request_id_label'),
        statusLabel: t('social.errors.reaction_status_label'),
      }),
    [t],
  );
  const handleManualRefresh = useCallback(async () => {
    clearCommentLikeError();
    setIsManualRefreshing(true);
    try {
      await Promise.allSettled([refetchPost(), refetch()]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [clearCommentLikeError, refetch, refetchPost]);

  const cancelScheduledCommentsScroll = useCallback(() => {
    if (commentsScrollFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(commentsScrollFrameRef.current);
    commentsScrollFrameRef.current = null;
  }, []);

  const shouldAutoscrollToEnd = useCallback(() => {
    if (!commentItems.length) {
      return true;
    }

    try {
      const visibleIndices = commentsListRef.current?.computeVisibleIndices?.();
      if (
        !visibleIndices ||
        typeof visibleIndices.endIndex !== 'number' ||
        visibleIndices.endIndex < 0
      ) {
        return true;
      }

      return (
        commentItems.length - 1 - visibleIndices.endIndex <=
        COMMENT_AUTOSCROLL_BOTTOM_THRESHOLD
      );
    } catch {
      return true;
    }
  }, [commentItems.length]);

  const scrollCommentsToEnd = useCallback(() => {
    if (!shouldAutoscrollToEnd()) {
      return;
    }

    commentsListRef.current?.scrollToEnd({ animated: true });
  }, [shouldAutoscrollToEnd]);

  const scheduleCommentsScrollToEnd = useCallback(() => {
    cancelScheduledCommentsScroll();
    commentsScrollFrameRef.current = requestAnimationFrame(() => {
      commentsScrollFrameRef.current = null;
      scrollCommentsToEnd();
    });
  }, [cancelScheduledCommentsScroll, scrollCommentsToEnd]);

  const scrollCommentsToStart = useCallback(() => {
    const commentsList = commentsListRef.current;

    if (!commentsList) {
      return;
    }

    if (typeof commentsList.scrollToIndex === 'function') {
      void commentsList.scrollToIndex({ index: 0, animated: true });
      return;
    }

    commentsList.scrollToOffset?.({ offset: 0, animated: true });
  }, []);

  const handleFocusCommentComposer = useCallback(() => {
    if (canCreateComment === false || threadUnavailable || backendError) {
      return;
    }

    scheduleCommentsScrollToEnd();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [backendError, canCreateComment, scheduleCommentsScrollToEnd, threadUnavailable]);

  const handleOpenProfilePreview = useCallback(
    (identity: {
      userId: string;
      username?: string | null;
      avatarUrl?: string | null;
    }) => {
      setProfilePreviewTarget(identity);
    },
    [],
  );

  const handleSharePost = useCallback(async () => {
    if (!postDetail?.asset_url) {
      return;
    }

    try {
      await shareSocialPostAsset(
        postDetail.asset_url,
        postDetail.id,
        t('social.actions.share'),
      );
    } catch (error) {
      trackFailureEvent('social_share_failed', error, {
        post_id: postDetail.id,
      });
      logOperationalError('[Social] Failed to share post asset from detail', error, {
        post_id: postDetail.id,
      });
      const message =
        error instanceof SocialServiceError
          ? error.message
          : t('social.errors.share_failed');
      showAlert(t('social.errors.share_title'), message, [{ text: t('common.ok') }]);
    }
  }, [postDetail, showAlert, t]);

  const handleSetReaction = useCallback(
    (post: SocialPost, nextReaction: 'like' | 'dislike' | 'neutral') => {
      if (isReactionPending(post.id)) {
        return;
      }

      setReactionMutation.mutate({
        postId: post.id,
        reaction: nextReaction,
      });
    },
    [isReactionPending, setReactionMutation],
  );

  const submitDeletePost = useCallback(async () => {
    if (!postDetail) {
      return;
    }

    try {
      await deletePostMutation.mutateAsync({
        postId: postDetail.id,
      });
      router.back();
    } catch (error) {
      const message = buildSocialAlertMessageWithDiagnostics(
        error,
        t('social.delete.error_submit'),
        {
          routeLabel: t('social.errors.reaction_route_label'),
          codeLabel: t('social.errors.reaction_code_label'),
          requestIdLabel: t('social.errors.reaction_request_id_label'),
          statusLabel: t('social.errors.reaction_status_label'),
        },
      );
      showAlert(t('social.delete.error_title'), message, [{ text: t('common.ok') }]);
    }
  }, [deletePostMutation, postDetail, router, showAlert, t]);

  const handleDeletePost = useCallback(() => {
    if (!postDetail || isDeletePending(postDetail.id)) {
      return;
    }

    showAlert(
      t('social.delete.confirm_title'),
      t('social.delete.confirm_message'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
        {
          text: t('social.actions.delete'),
          style: 'destructive' as const,
          onPress: () => {
            void submitDeletePost();
          },
        },
      ],
    );
  }, [isDeletePending, postDetail, showAlert, submitDeletePost, t]);

  const handleReportPost = useCallback(() => {
    if (!postDetail) {
      return;
    }

    showAlert(
      t('social.report.title'),
      t('social.report.message'),
      [
        ...SOCIAL_REPORT_REASON_CODES.filter((reasonCode) => reasonCode !== 'other').map(
          (reasonCode) => ({
            text: t(`social.report.reasons.${reasonCode}`),
            onPress: () => {
              void reportContentMutation
                .mutateAsync({
                  target_type: 'post',
                  target_post_id: postDetail.id,
                  reason_code: reasonCode as SocialReportReasonCode,
                })
                .catch((error) => {
                  const message =
                    error instanceof SocialServiceError
                      ? error.message
                      : t('social.report.error_submit');
                  showAlert(t('social.report.error_title'), message, [
                    { text: t('common.ok') },
                  ]);
                });
            },
          }),
        ),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ],
    );
  }, [postDetail, reportContentMutation, showAlert, t]);

  const handleInputFocus = useCallback(() => {
    setIsInputFocused(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    cancelScheduledCommentsScroll();
    setIsInputFocused(false);
  }, [cancelScheduledCommentsScroll]);

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
  }, [isIos]);

  useEffect(() => cancelScheduledCommentsScroll, [cancelScheduledCommentsScroll]);

  useEffect(() => {
    if (!editingCommentId) {
      return;
    }

    if (!editingComment) {
      setEditingCommentId(null);
      setDraft('');
      return;
    }

    const animationFrame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [editingComment, editingCommentId]);

  useEffect(() => {
    if (
      !focusComposerOnOpen ||
      focusComposerHandledRef.current ||
      isInitialLoading ||
      !postDetail
    ) {
      return;
    }

    focusComposerHandledRef.current = true;
    handleFocusCommentComposer();
  }, [focusComposerOnOpen, handleFocusCommentComposer, isInitialLoading, postDetail]);

  useEffect(() => {
    if (!postDetail?.id || recordedDetailMetricsPostIdRef.current === postDetail.id) {
      return;
    }

    recordedDetailMetricsPostIdRef.current = postDetail.id;

    void recordSocialPostImpressions([postDetail.id], 'detail').catch((error) => {
      logOperationalError('[Social] Failed to record social detail impression', error, {
        post_id: postDetail.id,
      });
    });

    if (!userProfile?.id) {
      return;
    }

    void recordSocialPostViews([postDetail.id]).catch((error) => {
      logOperationalError('[Social] Failed to record social detail view', error, {
        post_id: postDetail.id,
      });
    });
  }, [postDetail?.id, userProfile?.id]);

  const resetEditingState = useCallback(() => {
    setEditingCommentId(null);
    setDraft('');
  }, []);

  const handleStartEditingComment = useCallback(
    (comment: SocialComment) => {
      if (isCommentUpdatePending(comment.id) || isCommentDeletePending(comment.id)) {
        return;
      }

      setEditingCommentId(comment.id);
      setDraft(comment.content_text);
    },
    [isCommentDeletePending, isCommentUpdatePending],
  );

  const handleDeleteComment = useCallback(
    async (comment: SocialComment) => {
      if (isCommentDeletePending(comment.id)) {
        return;
      }

      try {
        await deleteCommentMutation.mutateAsync({
          postId,
          commentId: comment.id,
        });

        if (editingCommentId === comment.id) {
          resetEditingState();
        }
      } catch (error) {
        const message = formatCommentActionErrorMessage(
          error,
          t('social.comments.delete_error'),
        );
        showAlert(t('social.comments.error_title'), message, [
          { text: t('common.ok') },
        ]);
      }
    },
    [
      deleteCommentMutation,
      editingCommentId,
      formatCommentActionErrorMessage,
      isCommentDeletePending,
      postId,
      resetEditingState,
      showAlert,
      t,
    ],
  );

  const handleConfirmDeleteComment = useCallback(
    (comment: SocialComment) => {
      showAlert(
        t('social.comments.delete_confirm_title'),
        t('social.comments.delete_confirm_message'),
        [
          {
            text: t('common.cancel'),
            style: 'cancel' as const,
          },
          {
            text: t('social.actions.delete'),
            style: 'destructive' as const,
            onPress: () => {
              void handleDeleteComment(comment);
            },
          },
        ],
      );
    },
    [handleDeleteComment, showAlert, t],
  );

  const handleCommentActions = useCallback(
    (comment: SocialComment) => {
      const buttons: Array<{
        text: string;
        style?: 'cancel' | 'destructive';
        onPress?: () => void;
      }> = [];

      if (isEditableCommentForViewer(comment, userProfile?.id)) {
        buttons.push({
          text: t('social.actions.edit'),
          onPress: () => handleStartEditingComment(comment),
        });
      }

      if (isDeletableCommentForViewer(comment, userProfile?.id)) {
        buttons.push({
          text: t('social.actions.delete'),
          style: 'destructive',
          onPress: () => handleConfirmDeleteComment(comment),
        });
      }

      buttons.push({
        text: t('common.cancel'),
        style: 'cancel',
      });

      showAlert(
        t('social.comments.manage_title'),
        t('social.comments.manage_message'),
        buttons,
      );
    },
    [
      handleConfirmDeleteComment,
      handleStartEditingComment,
      showAlert,
      t,
      userProfile?.id,
    ],
  );

  const handleSubmit = async () => {
    try {
      const normalizedComment = validateSocialCommentInput(draft);

      if (editingComment) {
        if (
          isCommentUpdatePending(editingComment.id) ||
          isCommentDeletePending(editingComment.id)
        ) {
          return;
        }

        await updateCommentMutation.mutateAsync({
          postId,
          commentId: editingComment.id,
          contentText: normalizedComment,
        });
        resetEditingState();
        return;
      }

      await createCommentMutation.mutateAsync({
        postId,
        contentText: normalizedComment,
      });
      setDraft('');
      requestAnimationFrame(() => {
        scrollCommentsToStart();
      });
    } catch (error) {
      const message = formatCommentActionErrorMessage(
        error,
        editingComment
          ? t('social.comments.edit_error')
          : t('social.comments.error_submit'),
      );

      showAlert(
        editingComment
          ? t('social.comments.edit_title')
          : t('social.comments.error_title'),
        message,
        [{ text: t('common.ok') }],
      );
    }
  };

  const handleReportComment = (comment: SocialComment) => {
    showAlert(
      t('social.comments.report_title'),
      t('social.comments.report_message'),
      [
        ...SOCIAL_REPORT_REASON_CODES.filter((reasonCode) => reasonCode !== 'other').map(
          (reasonCode) => ({
            text: t(`social.report.reasons.${reasonCode}`),
            onPress: () => {
              void reportContentMutation
                .mutateAsync({
                  target_type: 'comment',
                  target_comment_id: comment.id,
                  reason_code: reasonCode as SocialReportReasonCode,
                })
                .catch((error) => {
                  const message =
                    error instanceof SocialServiceError
                      ? error.message
                      : t('social.comments.report_error');
                  showAlert(t('social.report.error_title'), message, [
                    { text: t('common.ok') },
                  ]);
                });
            },
          }),
        ),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ],
    );
  };

  const handleCommentLike = useCallback(
    (comment: SocialComment) => {
      if (!postId || threadUnavailable || backendError) {
        return;
      }

      setCommentLikeMutation.mutate({
        postId,
        commentId: comment.id,
        liked: !comment.viewer_has_liked,
      });
    },
    [backendError, postId, setCommentLikeMutation, threadUnavailable],
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {alertElement}
      <KeyboardAvoidingView
        behavior={getKeyboardAvoidingViewBehavior()}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.container}
        testID="social-comments-keyboard-shell"
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
            testID="social-comments-back-button"
          >
            <ChevronLeft color={colors.primaryText} size={20} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('social.post_detail.title')}</Text>
            <Text style={styles.subtitle}>{t('social.post_detail.subtitle')}</Text>
          </View>
        </View>

        <View style={styles.contentArea}>
          {visibleCommentLikeError ? (
            <View
              style={styles.reactionErrorCard}
              testID="social-comment-like-error"
            >
              <View style={styles.reactionErrorHeader}>
                <Text style={styles.reactionErrorTitle}>
                  {t('social.errors.reaction_title')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={clearCommentLikeError}
                  style={styles.reactionErrorDismissButton}
                  testID="social-comment-like-error-dismiss"
                >
                  <Text style={styles.reactionErrorDismissLabel}>
                    {t('common.ok')}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.reactionErrorBody}>
                {visibleCommentLikeError.message || t('social.errors.reaction_failed')}
              </Text>
              {commentLikeErrorDiagnostics ? (
                <Text style={styles.reactionErrorMeta}>
                  {commentLikeErrorDiagnostics}
                </Text>
              ) : null}
            </View>
          ) : null}

          {threadUnavailable ? (
            <View style={styles.centeredState}>
              <Text style={styles.emptyTitle}>{t('social.comments.missing_title')}</Text>
              <Text style={styles.emptyBody}>{t('social.comments.missing_body')}</Text>
            </View>
          ) : isInitialLoading ? (
            <View style={styles.centeredState} testID="social-comments-loading-state">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlashList
              ref={commentsListRef}
              automaticallyAdjustContentInsets={false}
              automaticallyAdjustKeyboardInsets={false}
              contentInsetAdjustmentBehavior="never"
              data={backendError ? [] : commentItems}
              keyExtractor={(item) => item.id}
              keyboardDismissMode={isIos ? 'interactive' : undefined}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: scrollContentBottomPadding },
              ]}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              refreshing={isManualRefreshing}
              onRefresh={handleManualRefresh}
              ListHeaderComponent={
                postDetail ? (
                  <View
                    style={styles.postHeaderSection}
                    testID="social-post-detail-header"
                  >
                    <SocialPostCard
                      post={{
                        ...postDetail,
                        comment_count: displayedCommentCount,
                      }}
                      currentUserId={userProfile?.id}
                      commentsEnabled
                      deleteDisabled={isDeletePending(postDetail.id)}
                      reactionsDisabled={isReactionPending(postDetail.id)}
                      onAvatarPress={() =>
                        handleOpenProfilePreview({
                          userId: postDetail.author_id,
                          username: postDetail.author_username,
                          avatarUrl: postDetail.author_avatar_url,
                        })
                      }
                      onLikePress={() =>
                        handleSetReaction(
                          postDetail,
                          postDetail.viewer_reaction === 'like' ? 'neutral' : 'like',
                        )
                      }
                      onDislikePress={() =>
                        handleSetReaction(
                          postDetail,
                          postDetail.viewer_reaction === 'dislike'
                            ? 'neutral'
                            : 'dislike',
                        )
                      }
                      onCommentPress={handleFocusCommentComposer}
                      onDeletePress={() => handleDeletePost()}
                      onReportPress={() => handleReportPost()}
                      onSharePress={
                        postDetail.asset_url ? () => void handleSharePost() : null
                      }
                    />

                    <View
                      style={styles.commentsSectionHeader}
                      testID="social-post-detail-comments-header"
                    >
                      <Text style={styles.commentsSectionTitle}>
                        {t('social.post_detail.comments_title')}
                      </Text>
                      <Text style={styles.commentsSectionMeta}>
                        {t('social.post_detail.comments_count', {
                          count: displayedCommentCount,
                        })}
                      </Text>
                    </View>

                  </View>
                ) : null
              }
              ListEmptyComponent={
                backendError ? (
                  <View style={styles.centeredState} testID="social-comments-error-state">
                    <Text style={styles.emptyTitle}>{t('social.comments.error_title')}</Text>
                    <Text style={styles.emptyBody}>{backendError.message}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => {
                        void handleManualRefresh();
                      }}
                      style={styles.retryButton}
                      testID="social-comments-retry"
                    >
                      <Text style={styles.retryButtonLabel}>{t('common.retry')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : isCommentsLoading ? (
                  <View
                    style={styles.centeredState}
                    testID="social-comments-loading-state"
                  >
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <View style={styles.listEmptyState}>
                    <Text style={styles.emptyTitle}>{t('social.comments.empty_title')}</Text>
                    <Text style={styles.emptyBody}>{t('social.comments.empty_body')}</Text>
                  </View>
                )
              }
              ListFooterComponent={
                hasNextPage && !backendError ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={isFetchingNextPage}
                    onPress={() => {
                      if (!isFetchingNextPage) {
                        void fetchNextPage();
                      }
                    }}
                    style={styles.loadMoreButton}
                    testID="social-comments-load-more"
                  >
                    {isFetchingNextPage ? (
                      <ActivityIndicator size="small" color={colors.gray} />
                    ) : (
                      <Text style={styles.loadMoreButtonLabel}>
                        {t('social.comments.load_more')}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item }) => {
                const canLikeComment = resolveCommentLikeAccess({
                  currentUserId: userProfile?.id,
                  postAuthorId: resolvedPostAuthorId,
                  postModerationStatus: resolvedPostModerationStatus,
                  comment: item,
                });
                const isOwnerComment = isOwnedComment(item, userProfile?.id);
                const commentMenuDisabled =
                  isCommentUpdatePending(item.id) || isCommentDeletePending(item.id);
                const likeButtonDisabled =
                  !postId ||
                  threadUnavailable ||
                  !!backendError ||
                  !canLikeComment ||
                  isCommentLikePending(item.id);

                return (
                  <View style={styles.commentCard}>
                    <SocialIdentityRow
                      username={item.author_username}
                      avatarUrl={item.author_avatar_url}
                      avatarSize={38}
                      meta={
                        item.author_id === userProfile?.id &&
                        item.moderation_status !== 'approved' &&
                        item.moderation_status !== 'pending'
                          ? t(`social.moderation.${item.moderation_status}`)
                          : null
                      }
                      onAvatarPress={() =>
                        handleOpenProfilePreview({
                          userId: item.author_id,
                          username: item.author_username,
                          avatarUrl: item.author_avatar_url,
                        })
                      }
                      testID={`social-comment-identity-${item.id}`}
                    />
                    <Text style={styles.commentBody}>{item.content_text}</Text>
                    <View style={styles.commentActionsRow}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={likeButtonDisabled}
                        onPress={() => handleCommentLike(item)}
                        style={[
                          styles.commentActionButton,
                          item.viewer_has_liked && styles.commentActionButtonActive,
                          likeButtonDisabled && styles.commentActionButtonDisabled,
                        ]}
                        testID={`social-comment-like-${item.id}`}
                      >
                        <Heart
                          color={
                            item.viewer_has_liked ? colors.primary : colors.primaryText
                          }
                          fill={item.viewer_has_liked ? colors.primary : 'transparent'}
                          size={16}
                        />
                        <Text
                          style={[
                            styles.commentActionLabel,
                            item.viewer_has_liked && styles.commentActionLabelActive,
                          ]}
                          testID={`social-comment-like-count-${item.id}`}
                        >
                          {item.like_count}
                        </Text>
                      </TouchableOpacity>

                      {item.author_id !== userProfile?.id ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => handleReportComment(item)}
                          style={styles.commentActionButton}
                          testID={`social-comment-report-${item.id}`}
                        >
                          <Flag color={colors.primaryText} size={16} />
                          <Text style={styles.commentActionLabel}>
                            {t('social.actions.report')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      {isOwnerComment ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          disabled={commentMenuDisabled}
                          onPress={() => handleCommentActions(item)}
                          style={[
                            styles.commentActionButton,
                            commentMenuDisabled && styles.commentActionButtonDisabled,
                          ]}
                          testID={`social-comment-menu-${item.id}`}
                        >
                          <Ellipsis color={colors.primaryText} size={16} />
                          <Text style={styles.commentActionLabel}>
                            {t('social.comments.manage_label')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              }}
              showsVerticalScrollIndicator={false}
              testID="social-comments-list"
            />
          )}
        </View>

        <View
          onLayout={handleFooterLayout}
          style={[
            styles.composer,
            {
              paddingTop: footerTopPadding,
              paddingBottom: footerBottomPadding,
            },
          ]}
          testID="social-comments-footer"
        >
          {shouldShowReadOnlyComposer ? (
            <View style={styles.readOnlyComposer} testID="social-comments-read-only">
              {resolvedPostModerationStatus ? (
                <SocialModerationBadge moderationState={resolvedPostModerationStatus} />
              ) : null}
              <View style={styles.readOnlyCopy}>
                <Text style={styles.readOnlyTitle}>
                  {t('social.comments.read_only_title')}
                </Text>
                <Text style={styles.readOnlyBody}>
                  {t('social.comments.read_only_body')}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.composerContent}>
              {isEditingComment ? (
                <View
                  style={styles.editingBanner}
                  testID="social-comments-editing-banner"
                >
                  <View style={styles.editingBannerCopy}>
                    <Text style={styles.editingBannerTitle}>
                      {t('social.comments.edit_title')}
                    </Text>
                    <Text style={styles.editingBannerBody}>
                      {t('social.comments.editing_body')}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.composerRow} testID="social-comments-composer-row">
                <TextInput
                  ref={inputRef}
                  multiline
                  value={draft}
                  onChangeText={setDraft}
                  onBlur={handleInputBlur}
                  onFocus={handleInputFocus}
                  placeholder={
                    isEditingComment
                      ? t('social.comments.edit_placeholder')
                      : t('social.comments.placeholder')
                  }
                  placeholderTextColor={colors.gray}
                  style={styles.input}
                  testID="social-comments-input"
                />
                {isEditingComment ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={updateCommentMutation.isPending}
                    onPress={resetEditingState}
                    style={styles.secondaryComposerButton}
                    testID="social-comments-cancel-edit"
                  >
                    <Text style={styles.secondaryComposerButtonLabel}>
                      {t('common.cancel')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={
                    !draft.trim() ||
                    activeCommentMutationPending ||
                    !postId ||
                    threadUnavailable ||
                    !!backendError ||
                    canCreateComment === false ||
                    (editingComment ? isCommentDeletePending(editingComment.id) : false)
                  }
                  onPress={() => {
                    void handleSubmit();
                  }}
                  style={[
                    styles.sendButton,
                    isEditingComment && styles.sendButtonWide,
                    (!draft.trim() ||
                      activeCommentMutationPending ||
                      !postId ||
                      threadUnavailable ||
                      !!backendError ||
                      canCreateComment === false ||
                      (editingComment
                        ? isCommentDeletePending(editingComment.id)
                        : false)) &&
                      styles.sendButtonDisabled,
                  ]}
                  testID="social-comments-submit"
                >
                  {activeCommentMutationPending ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : isEditingComment ? (
                    <Text style={styles.sendButtonLabel}>{t('common.save')}</Text>
                  ) : (
                    <Send color={colors.white} size={18} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <SocialProfilePreviewModal
          visible={profilePreviewTarget !== null}
          userId={profilePreviewTarget?.userId}
          fallbackUsername={profilePreviewTarget?.username}
          fallbackAvatarUrl={profilePreviewTarget?.avatarUrl}
          onClose={() => setProfilePreviewTarget(null)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    contentArea: {
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
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
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
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.sm,
    },
    postHeaderSection: {
      gap: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    commentsSectionHeader: {
      gap: 2,
    },
    commentsSectionTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    commentsSectionMeta: {
      fontSize: SIZES.text14,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    loadMoreButton: {
      alignSelf: 'center',
      marginTop: SPACING.lg,
      marginBottom: SPACING.md,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      minHeight: 34,
      justifyContent: 'center',
    },
    loadMoreButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.primaryText,
    },
    itemSeparator: {
      height: SPACING.md,
    },
    commentCard: {
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      gap: SPACING.sm,
    },
    commentBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: colors.primaryText,
    },
    commentActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    commentActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.xs,
      minHeight: 34,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    commentActionButtonActive: {
      backgroundColor: withAlpha(colors.primary, 0.14),
    },
    commentActionButtonDisabled: {
      opacity: 0.5,
    },
    commentActionLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    commentActionLabelActive: {
      color: colors.primary,
    },
    reactionErrorCard: {
      marginHorizontal: SPACING.page,
      marginBottom: SPACING.sm,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.18),
      gap: SPACING.xs,
    },
    reactionErrorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    reactionErrorTitle: {
      flex: 1,
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    reactionErrorDismissButton: {
      minHeight: 30,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? withAlpha(colors.primaryText, 0.06),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    reactionErrorDismissLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    reactionErrorBody: {
      fontSize: SIZES.text14,
      lineHeight: 21,
      color: colors.primaryText,
    },
    reactionErrorMeta: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    centeredState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.page,
      paddingVertical: SPACING.xxxl,
      gap: SPACING.sm,
    },
    listEmptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.xxxl,
      gap: SPACING.sm,
    },
    emptyTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    emptyBody: {
      fontSize: SIZES.text14,
      lineHeight: 22,
      color: colors.textMuted ?? colors.gray,
      textAlign: 'center',
    },
    retryButton: {
      minHeight: 40,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.primary, 0.12),
    },
    retryButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primary,
    },
    composer: {
      paddingHorizontal: SPACING.page,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      backgroundColor: colors.cardBackground,
    },
    composerContent: {
      gap: SPACING.sm,
      width: '100%',
    },
    composerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: SPACING.sm,
      width: '100%',
    },
    readOnlyComposer: {
      flex: 1,
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    readOnlyCopy: {
      gap: SPACING.xs,
    },
    readOnlyTitle: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    readOnlyBody: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textMuted ?? colors.gray,
    },
    editingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: withAlpha(colors.primary, 0.1),
    },
    editingBannerCopy: {
      flex: 1,
      gap: 2,
    },
    editingBannerTitle: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    editingBannerBody: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? colors.gray,
    },
    input: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      maxHeight: 120,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
      color: colors.primaryText,
      fontSize: SIZES.text14,
      textAlignVertical: 'top',
    },
    secondaryComposerButton: {
      minHeight: 44,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
    },
    secondaryComposerButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendButtonWide: {
      width: 'auto',
      minWidth: 96,
      paddingHorizontal: SPACING.lg,
    },
    sendButtonLabel: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.white,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
  });
