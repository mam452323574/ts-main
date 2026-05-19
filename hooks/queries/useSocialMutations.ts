import { useCallback, useRef, useState } from 'react';
import {
  InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { SOCIAL_COMMENTS_QUERY_KEY } from './useSocialComments';
import { SOCIAL_POST_QUERY_KEY } from './useSocialPostDetail';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  applyOptimisticLikeToSocialComment,
  applyOptimisticReactionToSocialPost,
  applyServerLikeStateToSocialComment,
  applyServerReactionStateToSocialPost,
  createSocialComment,
  createSocialPost,
  deleteSocialComment,
  deleteSocialPost,
  flattenSocialCommentsPages,
  followSocialAuthor,
  getSanitizedSocialCommentCount,
  hideSocialAuthor,
  removeSocialCommentFromPages,
  removeSocialPostFromFeedPages,
  reportSocialContent,
  setSocialCommentLike,
  setReactionOnSocialPost,
  SocialServiceError,
  updateSocialComment,
  updateSocialCommentLikeStateInPages,
  updateSocialPostLikeState,
  upsertSocialCommentInPages,
} from '@/services/social';
import { trackEvent, trackFailureEvent } from '@/services/analytics';
import type {
  ShareStoryPayload,
  SocialCategory,
  SocialComment,
  SocialCommentsPage,
  SocialFeedPage,
  SocialFollowAuthorResponse,
  SocialHideAuthorResponse,
  SocialPost,
  SocialReactionState,
  SocialReportContentRequest,
  SocialSetCommentLikeResponse,
  SocialSetReactionResponse,
} from '@/types';

interface CreateSocialPostDraft {
  category: SocialCategory;
  contentText?: string | null;
  scanId?: string | null;
  sharePayload?: ShareStoryPayload | null;
  assetSourceUri?: string | null;
}

interface CreateSocialCommentDraft {
  postId: string;
  contentText: string;
}

interface DeleteSocialPostDraft {
  postId: string;
}

interface UpdateSocialCommentDraft {
  postId: string;
  commentId: string;
  contentText: string;
}

interface DeleteSocialCommentDraft {
  postId: string;
  commentId: string;
}

interface SetSocialReactionDraft {
  postId: string;
  reaction: SocialReactionState;
}

interface SetSocialCommentLikeDraft {
  postId: string;
  commentId: string;
  liked: boolean;
}

type SocialFeedInfiniteData = InfiniteData<SocialFeedPage, string | null>;
type SocialFeedSnapshots = Array<[QueryKey, SocialFeedInfiniteData | undefined]>;
type SocialCommentsInfiniteData = InfiniteData<SocialCommentsPage, string | null>;

interface ReactionMutationContext {
  postId: string;
  mutationSequence: number;
  previousSnapshots: SocialFeedSnapshots;
  previousPostSnapshot: SocialPost | undefined;
}

interface CommentLikeMutationContext {
  postId: string;
  commentId: string;
  mutationSequence: number;
  previousComments: SocialCommentsInfiniteData | undefined;
}

interface SocialReactionUiError {
  postId: string;
  message: string;
  code?: string;
  status?: number;
  functionName?: string;
  requestId?: string;
}

interface SocialCommentLikeUiError {
  postId: string;
  commentId: string;
  message: string;
  code?: string;
  status?: number;
  functionName?: string;
  requestId?: string;
}

function isApprovedVisibleComment(comment: SocialComment | undefined) {
  return comment?.moderation_status === 'approved' && !comment.deleted_at;
}

function isOwnPendingVisibleComment(
  comment: SocialComment | undefined,
  viewerId?: string | null,
) {
  return (
    !!comment &&
    !!viewerId &&
    comment.author_id === viewerId &&
    comment.moderation_status === 'pending' &&
    !comment.deleted_at
  );
}

function isVisibleCommentForViewer(
  comment: SocialComment,
  viewerId?: string | null,
) {
  return isApprovedVisibleComment(comment) || isOwnPendingVisibleComment(comment, viewerId);
}

interface CachedSocialPostCommentCounts {
  commentCount: number;
  viewerVisibleCount?: number;
}

function readCachedSocialPostCommentCounts(
  queryClient: QueryClient,
  postId: string,
): CachedSocialPostCommentCounts | undefined {
  const cachedPost = queryClient.getQueryData<SocialPost>(
    SOCIAL_POST_QUERY_KEY(postId),
  );

  if (cachedPost) {
    return {
      commentCount: getSanitizedSocialCommentCount(cachedPost.comment_count),
      viewerVisibleCount:
        typeof cachedPost.viewer_visible_comment_count === 'number'
          ? getSanitizedSocialCommentCount(
              cachedPost.viewer_visible_comment_count,
            )
          : undefined,
    };
  }

  const feedSnapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
    queryKey: ['socialFeed'],
  });

  for (const [, snapshot] of feedSnapshots) {
    for (const post of snapshot?.pages.flatMap((page) => page.items) ?? []) {
      if (post.id === postId) {
        return {
          commentCount: getSanitizedSocialCommentCount(post.comment_count),
          viewerVisibleCount:
            typeof post.viewer_visible_comment_count === 'number'
              ? getSanitizedSocialCommentCount(
                  post.viewer_visible_comment_count,
                )
              : undefined,
        };
      }
    }
  }

  return undefined;
}

function setCachedSocialPostCommentCounts(
  queryClient: QueryClient,
  postId: string,
  counts: {
    commentCount?: number;
    viewerVisibleCount?: number;
  },
) {
  const hasCommentCount = typeof counts.commentCount === 'number';
  const hasViewerVisibleCount =
    typeof counts.viewerVisibleCount === 'number';
  const sanitizedCommentCount = hasCommentCount
    ? getSanitizedSocialCommentCount(counts.commentCount)
    : undefined;
  const sanitizedViewerVisibleCount = hasViewerVisibleCount
    ? getSanitizedSocialCommentCount(counts.viewerVisibleCount)
    : undefined;

  if (!hasCommentCount && !hasViewerVisibleCount) {
    return;
  }

  const snapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
    queryKey: ['socialFeed'],
  });

  for (const [queryKey, snapshot] of snapshots) {
    if (!snapshot) {
      continue;
    }

    let didPatchPost = false;
    const nextPages = snapshot.pages.map((page) => {
      let didPatchPage = false;
      const nextItems = page.items.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        didPatchPost = true;
        didPatchPage = true;
        return {
          ...post,
          ...(hasCommentCount ? { comment_count: sanitizedCommentCount } : {}),
          ...(hasViewerVisibleCount
            ? {
                viewer_visible_comment_count:
                  sanitizedViewerVisibleCount,
              }
            : {}),
        };
      });

      return didPatchPage ? { ...page, items: nextItems } : page;
    });

    if (didPatchPost) {
      queryClient.setQueryData<SocialFeedInfiniteData>(queryKey, {
        ...snapshot,
        pages: nextPages,
      });
    }
  }

  queryClient.setQueryData<SocialPost>(
    SOCIAL_POST_QUERY_KEY(postId),
    (currentPost) =>
      currentPost
        ? {
            ...currentPost,
            ...(hasCommentCount ? { comment_count: sanitizedCommentCount } : {}),
            ...(hasViewerVisibleCount
              ? {
                  viewer_visible_comment_count:
                    sanitizedViewerVisibleCount,
                }
              : {}),
          }
        : currentPost,
  );
}

function applyServerReactionState(
  pages: SocialFeedPage[] | undefined,
  response: SocialSetReactionResponse,
) {
  return updateSocialPostLikeState(pages, response.post_id, (post) => ({
    ...applyServerReactionStateToSocialPost(post, response),
  }));
}

function applyFollowStateToFeedPages(
  pages: SocialFeedPage[] | undefined,
  authorId: string,
  following: boolean,
): SocialFeedPage[] | null {
  if (!pages) {
    return null;
  }

  let didPatch = false;
  const nextPages = pages.map((page) => {
    let didPatchPage = false;
    const nextItems = page.items.map((post) => {
      if (post.author_id !== authorId) {
        return post;
      }
      if (post.viewer_follows_author === following) {
        return post;
      }
      didPatchPage = true;
      didPatch = true;
      return { ...post, viewer_follows_author: following };
    });
    return didPatchPage ? { ...page, items: nextItems } : page;
  });

  return didPatch ? nextPages : null;
}

function removeAuthorPostsFromFeedPages(
  pages: SocialFeedPage[] | undefined,
  authorId: string,
): SocialFeedPage[] | null {
  if (!pages) {
    return null;
  }

  let didFilter = false;
  const nextPages = pages.map((page) => {
    const nextItems = page.items.filter((post) => post.author_id !== authorId);
    if (nextItems.length === page.items.length) {
      return page;
    }
    didFilter = true;
    return { ...page, items: nextItems };
  });

  return didFilter ? nextPages : null;
}

function buildReactionUiError(
  postId: string,
  error: unknown,
): SocialReactionUiError {
  if (error instanceof SocialServiceError) {
    return {
      postId,
      message: error.message,
      code: error.code,
      status: error.status,
      functionName: error.functionName,
      requestId: error.requestId,
    };
  }

  if (error instanceof Error) {
    return {
      postId,
      message: error.message,
    };
  }

  return {
    postId,
    message: 'The reaction could not be saved.',
  };
}

function buildCommentLikeUiError(
  postId: string,
  commentId: string,
  error: unknown,
): SocialCommentLikeUiError {
  if (error instanceof SocialServiceError) {
    return {
      postId,
      commentId,
      message: error.message,
      code: error.code,
      status: error.status,
      functionName: error.functionName,
      requestId: error.requestId,
    };
  }

  if (error instanceof Error) {
    return {
      postId,
      commentId,
      message: error.message,
    };
  }

  return {
    postId,
    commentId,
    message: 'The comment like could not be saved.',
  };
}

export const useSocialMutations = () => {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { locale } = useLanguage();
  const reactionMutationSequenceRef = useRef(0);
  const latestReactionMutationSequenceByPostRef = useRef<Record<string, number>>({});
  const commentLikeMutationSequenceRef = useRef(0);
  const latestCommentLikeMutationSequenceByCommentRef = useRef<
    Record<string, number>
  >({});
  const [pendingReactionSequences, setPendingReactionSequences] = useState<
    Record<string, number>
  >({});
  const [pendingCommentLikeSequences, setPendingCommentLikeSequences] = useState<
    Record<string, number>
  >({});
  const [pendingDeletePostIds, setPendingDeletePostIds] = useState<Record<string, boolean>>(
    {},
  );
  const [pendingUpdateCommentIds, setPendingUpdateCommentIds] = useState<
    Record<string, boolean>
  >({});
  const [pendingDeleteCommentIds, setPendingDeleteCommentIds] = useState<
    Record<string, boolean>
  >({});
  const [reactionError, setReactionError] = useState<SocialReactionUiError | null>(
    null,
  );
  const [commentLikeError, setCommentLikeError] =
    useState<SocialCommentLikeUiError | null>(null);

  const isLatestReactionMutation = useCallback(
    (postId: string, mutationSequence: number) =>
      latestReactionMutationSequenceByPostRef.current[postId] === mutationSequence,
    [],
  );

  const clearPendingReaction = useCallback(
    (postId: string, mutationSequence: number) => {
      if (
        latestReactionMutationSequenceByPostRef.current[postId] ===
        mutationSequence
      ) {
        delete latestReactionMutationSequenceByPostRef.current[postId];
      }

      setPendingReactionSequences((currentState) => {
        if (currentState[postId] !== mutationSequence) {
          return currentState;
        }

        const { [postId]: _removedPostId, ...remainingPendingState } =
          currentState;
        return remainingPendingState;
      });
    },
    [],
  );

  const isLatestCommentLikeMutation = useCallback(
    (commentId: string, mutationSequence: number) =>
      latestCommentLikeMutationSequenceByCommentRef.current[commentId] ===
      mutationSequence,
    [],
  );

  const clearPendingCommentLike = useCallback(
    (commentId: string, mutationSequence: number) => {
      if (
        latestCommentLikeMutationSequenceByCommentRef.current[commentId] ===
        mutationSequence
      ) {
        delete latestCommentLikeMutationSequenceByCommentRef.current[commentId];
      }

      setPendingCommentLikeSequences((currentState) => {
        if (currentState[commentId] !== mutationSequence) {
          return currentState;
        }

        const { [commentId]: _removedCommentId, ...remainingPendingState } =
          currentState;
        return remainingPendingState;
      });
    },
    [],
  );

  const clearReactionError = useCallback(() => {
    setReactionError(null);
  }, []);

  const clearCommentLikeError = useCallback(() => {
    setCommentLikeError(null);
  }, []);

  const setReactionMutation = useMutation({
    mutationFn: ({ postId, reaction }: SetSocialReactionDraft) =>
      setReactionOnSocialPost(postId, reaction),
    onMutate: async ({ postId, reaction }): Promise<ReactionMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['socialFeed'] });
      await queryClient.cancelQueries({
        queryKey: SOCIAL_POST_QUERY_KEY(postId),
        exact: true,
      });

      const previousSnapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
        queryKey: ['socialFeed'],
      });
      const previousPostSnapshot = queryClient.getQueryData<SocialPost>(
        SOCIAL_POST_QUERY_KEY(postId),
      );
      const mutationSequence = reactionMutationSequenceRef.current + 1;
      reactionMutationSequenceRef.current = mutationSequence;
      latestReactionMutationSequenceByPostRef.current[postId] = mutationSequence;
      setPendingReactionSequences((currentState) => ({
        ...currentState,
        [postId]: mutationSequence,
      }));
      setReactionError(null);

      for (const [queryKey, snapshot] of previousSnapshots) {
        if (!snapshot) {
          continue;
        }

        queryClient.setQueryData<SocialFeedInfiniteData>(queryKey, {
          ...snapshot,
          pages: updateSocialPostLikeState(
            snapshot.pages,
            postId,
            (post) => applyOptimisticReactionToSocialPost(post, reaction),
          ) ?? snapshot.pages,
        });
      }

      queryClient.setQueryData<SocialPost>(
        SOCIAL_POST_QUERY_KEY(postId),
        (currentPost) =>
          currentPost
            ? applyOptimisticReactionToSocialPost(currentPost, reaction)
            : currentPost,
      );

      return {
        postId,
        mutationSequence,
        previousSnapshots,
        previousPostSnapshot,
      };
    },
    onError: (error, draft, context) => {
      if (!context || !isLatestReactionMutation(context.postId, context.mutationSequence)) {
        return;
      }

      for (const [queryKey, snapshot] of context?.previousSnapshots ?? []) {
        queryClient.setQueryData(queryKey, snapshot);
      }
      queryClient.setQueryData(
        SOCIAL_POST_QUERY_KEY(context.postId),
        context.previousPostSnapshot,
      );

      trackFailureEvent('social_post_reaction_failed', error, {
        post_id: draft.postId,
        reaction: draft.reaction,
      });
      setReactionError(buildReactionUiError(draft.postId, error));
    },
    onSuccess: (response, _draft, context) => {
      if (
        !context ||
        !isLatestReactionMutation(context.postId, context.mutationSequence)
      ) {
        return;
      }

      const snapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
        queryKey: ['socialFeed'],
      });

      for (const [queryKey, snapshot] of snapshots) {
        if (!snapshot) {
          continue;
        }

        queryClient.setQueryData<SocialFeedInfiniteData>(queryKey, {
          ...snapshot,
          pages:
            applyServerReactionState(snapshot.pages, response) ?? snapshot.pages,
        });
      }

      queryClient.setQueryData<SocialPost>(
        SOCIAL_POST_QUERY_KEY(context.postId),
        (currentPost) =>
          currentPost
            ? applyServerReactionStateToSocialPost(currentPost, response)
            : currentPost,
      );

      setReactionError(null);
    },
    onSettled: (_response, _error, draft, context) => {
      const postId = context?.postId ?? draft.postId;
      const mutationSequence = context?.mutationSequence;

      if (
        !postId ||
        typeof mutationSequence !== 'number' ||
        !isLatestReactionMutation(postId, mutationSequence)
      ) {
        return;
      }

      clearPendingReaction(postId, mutationSequence);
      void queryClient.invalidateQueries({
        queryKey: ['socialFeed'],
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({
        queryKey: SOCIAL_POST_QUERY_KEY(postId),
        exact: true,
        refetchType: 'none',
      });
    },
  });

  const setCommentLikeMutation = useMutation({
    mutationFn: ({ commentId, liked }: SetSocialCommentLikeDraft) =>
      setSocialCommentLike(commentId, liked),
    onMutate: async ({
      postId,
      commentId,
      liked,
    }): Promise<CommentLikeMutationContext> => {
      const commentsQueryKey = SOCIAL_COMMENTS_QUERY_KEY(postId);
      await queryClient.cancelQueries({
        queryKey: commentsQueryKey,
        exact: true,
      });

      const previousComments =
        queryClient.getQueryData<SocialCommentsInfiniteData>(commentsQueryKey);
      const mutationSequence = commentLikeMutationSequenceRef.current + 1;
      commentLikeMutationSequenceRef.current = mutationSequence;
      latestCommentLikeMutationSequenceByCommentRef.current[commentId] =
        mutationSequence;
      setPendingCommentLikeSequences((currentState) => ({
        ...currentState,
        [commentId]: mutationSequence,
      }));
      setCommentLikeError(null);

      if (previousComments) {
        const nextPages = updateSocialCommentLikeStateInPages(
          previousComments.pages,
          commentId,
          (comment) => applyOptimisticLikeToSocialComment(comment, liked),
        );

        if (nextPages) {
          queryClient.setQueryData<SocialCommentsInfiniteData>(commentsQueryKey, {
            ...previousComments,
            pages: nextPages,
          });
        }
      }

      return {
        postId,
        commentId,
        mutationSequence,
        previousComments,
      };
    },
    onError: (error, draft, context) => {
      if (
        !context ||
        !isLatestCommentLikeMutation(
          context.commentId,
          context.mutationSequence,
        )
      ) {
        return;
      }

      queryClient.setQueryData(
        SOCIAL_COMMENTS_QUERY_KEY(context.postId),
        context.previousComments,
      );
      setCommentLikeError(
        buildCommentLikeUiError(draft.postId, draft.commentId, error),
      );
    },
    onSuccess: (
      response: SocialSetCommentLikeResponse,
      _draft,
      context,
    ) => {
      if (
        !context ||
        !isLatestCommentLikeMutation(
          context.commentId,
          context.mutationSequence,
        )
      ) {
        return;
      }

      const commentsQueryKey = SOCIAL_COMMENTS_QUERY_KEY(context.postId);
      queryClient.setQueryData<SocialCommentsInfiniteData>(
        commentsQueryKey,
        (currentData) => {
          if (!currentData) {
            return currentData;
          }
          const nextPages = updateSocialCommentLikeStateInPages(
            currentData.pages,
            response.comment_id,
            (comment) => applyServerLikeStateToSocialComment(comment, response),
          );
          if (!nextPages) {
            return currentData;
          }
          return { ...currentData, pages: nextPages };
        },
      );
      setCommentLikeError(null);
    },
    onSettled: (_response, _error, draft, context) => {
      const postId = context?.postId ?? draft.postId;
      const commentId = context?.commentId ?? draft.commentId;
      const mutationSequence = context?.mutationSequence;

      if (
        !postId ||
        !commentId ||
        typeof mutationSequence !== 'number' ||
        !isLatestCommentLikeMutation(commentId, mutationSequence)
      ) {
        return;
      }

      clearPendingCommentLike(commentId, mutationSequence);
      void queryClient.invalidateQueries({
        queryKey: SOCIAL_COMMENTS_QUERY_KEY(postId),
        exact: true,
        refetchType: 'none',
      });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: (draft: CreateSocialPostDraft) => {
      if (!userProfile?.id) {
        throw new Error('Authentication required');
      }

      return createSocialPost({
        viewerProfile: {
          id: userProfile.id,
          username: userProfile.username,
          avatar_url: userProfile.avatar_url,
        },
        languageCode: locale,
        ...draft,
      });
    },
    onSuccess: async (post) => {
      trackEvent(
        post.moderation_state === 'rejected'
          ? 'social_post_rejected'
          : 'social_post_published',
        {
          category: post.category,
          moderation_state:
            post.moderation_state ?? post.moderation_status ?? 'pending',
        },
      );
      await queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
    },
    onError: (error, draft) => {
      if (!draft.assetSourceUri) {
        return;
      }

      trackFailureEvent('social_upload_failed', error, {
        category: draft.category,
        has_scan_id: !!draft.scanId,
        has_share_payload: !!draft.sharePayload,
      });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: (draft: CreateSocialCommentDraft) => {
      if (!userProfile?.id) {
        throw new Error('Authentication required');
      }

      return createSocialComment({
        viewerProfile: {
          id: userProfile.id,
          username: userProfile.username,
          avatar_url: userProfile.avatar_url,
        },
        postId: draft.postId,
        contentText: draft.contentText,
      });
    },
    onSuccess: async (comment: SocialComment) => {
      trackEvent(
        comment.moderation_state === 'rejected'
          ? 'social_comment_rejected'
          : 'social_comment_created',
        {
          moderation_state:
            comment.moderation_state ?? comment.moderation_status ?? 'pending',
          },
      );
      const commentsQueryKey = SOCIAL_COMMENTS_QUERY_KEY(comment.post_id);
      const currentData =
        queryClient.getQueryData<SocialCommentsInfiniteData>(commentsQueryKey);
      const cachedCountsBefore = readCachedSocialPostCommentCounts(
        queryClient,
        comment.post_id,
      );
      const existingComment = flattenSocialCommentsPages(currentData?.pages).find(
        (item) => item.id === comment.id,
      );
      const shouldShowCreatedComment = isVisibleCommentForViewer(
        comment,
        userProfile?.id,
      );
      const nextPages = shouldShowCreatedComment
        ? upsertSocialCommentInPages(currentData?.pages, comment)
        : currentData?.pages;
      const insertedVisibleComment = shouldShowCreatedComment && !existingComment;

      if (nextPages && (currentData || shouldShowCreatedComment)) {
        const nextData: SocialCommentsInfiniteData = currentData
          ? { ...currentData, pages: nextPages }
          : {
              pages: nextPages,
              pageParams: [null],
            };

        queryClient.setQueryData<SocialCommentsInfiniteData>(commentsQueryKey, nextData);
      }

      if (insertedVisibleComment && cachedCountsBefore) {
        const nextCounts: {
          commentCount?: number;
          viewerVisibleCount?: number;
        } = {};

        if (isApprovedVisibleComment(comment)) {
          nextCounts.commentCount = cachedCountsBefore.commentCount + 1;
          if (cachedCountsBefore.viewerVisibleCount !== undefined) {
            nextCounts.viewerVisibleCount =
              cachedCountsBefore.viewerVisibleCount + 1;
          }
        } else if (
          isOwnPendingVisibleComment(comment, userProfile?.id) &&
          cachedCountsBefore.viewerVisibleCount !== undefined
        ) {
          nextCounts.viewerVisibleCount =
            cachedCountsBefore.viewerVisibleCount + 1;
        }

        setCachedSocialPostCommentCounts(
          queryClient,
          comment.post_id,
          nextCounts,
        );
      }

      await queryClient.invalidateQueries({
        queryKey: commentsQueryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: SOCIAL_POST_QUERY_KEY(comment.post_id),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: (draft: UpdateSocialCommentDraft) => {
      if (!userProfile?.id) {
        throw new Error('Authentication required');
      }

      return updateSocialComment(draft.commentId, draft.contentText);
    },
    onMutate: async ({ postId, commentId }) => {
      await queryClient.cancelQueries({
        queryKey: SOCIAL_COMMENTS_QUERY_KEY(postId),
        exact: true,
      });
      setPendingUpdateCommentIds((currentState) => ({
        ...currentState,
        [commentId]: true,
      }));
    },
    onSuccess: async (comment, draft) => {
      const commentsQueryKey = SOCIAL_COMMENTS_QUERY_KEY(draft.postId);
      const currentData =
        queryClient.getQueryData<SocialCommentsInfiniteData>(commentsQueryKey);
      const nextPages = upsertSocialCommentInPages(currentData?.pages, comment);

      if (currentData) {
        queryClient.setQueryData<SocialCommentsInfiniteData>(commentsQueryKey, {
          ...currentData,
          pages: nextPages,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: commentsQueryKey,
        exact: true,
      });
      await queryClient.invalidateQueries({
        queryKey: SOCIAL_POST_QUERY_KEY(draft.postId),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
    },
    onSettled: (_response, _error, draft) => {
      setPendingUpdateCommentIds((currentState) => {
        if (!currentState[draft.commentId]) {
          return currentState;
        }

        const { [draft.commentId]: _removedCommentId, ...remainingPendingState } =
          currentState;
        return remainingPendingState;
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (draft: DeleteSocialCommentDraft) => {
      if (!userProfile?.id) {
        throw new Error('Authentication required');
      }

      return deleteSocialComment(draft.commentId);
    },
    onMutate: async ({ postId, commentId }) => {
      await queryClient.cancelQueries({
        queryKey: SOCIAL_COMMENTS_QUERY_KEY(postId),
        exact: true,
      });
      setPendingDeleteCommentIds((currentState) => ({
        ...currentState,
        [commentId]: true,
      }));
    },
    onSuccess: async (_response, draft) => {
      const commentsQueryKey = SOCIAL_COMMENTS_QUERY_KEY(draft.postId);
      const currentData =
        queryClient.getQueryData<SocialCommentsInfiniteData>(commentsQueryKey);
      const cachedCountsBefore = readCachedSocialPostCommentCounts(
        queryClient,
        draft.postId,
      );
      const deletedComment = flattenSocialCommentsPages(currentData?.pages).find(
        (comment) => comment.id === draft.commentId,
      );

      if (currentData) {
        const nextPages = removeSocialCommentFromPages(
          currentData.pages,
          draft.commentId,
        );
        const nextData: SocialCommentsInfiniteData = {
          ...currentData,
          pages: nextPages,
        };
        queryClient.setQueryData<SocialCommentsInfiniteData>(
          commentsQueryKey,
          nextData,
        );
      }

      if (deletedComment && cachedCountsBefore) {
        const nextCounts: {
          commentCount?: number;
          viewerVisibleCount?: number;
        } = {};

        if (isApprovedVisibleComment(deletedComment)) {
          nextCounts.commentCount = Math.max(
            0,
            cachedCountsBefore.commentCount - 1,
          );
          if (cachedCountsBefore.viewerVisibleCount !== undefined) {
            nextCounts.viewerVisibleCount = Math.max(
              0,
              cachedCountsBefore.viewerVisibleCount - 1,
            );
          }
        } else if (
          isOwnPendingVisibleComment(deletedComment, userProfile?.id) &&
          cachedCountsBefore.viewerVisibleCount !== undefined
        ) {
          nextCounts.viewerVisibleCount = Math.max(
            0,
            cachedCountsBefore.viewerVisibleCount - 1,
          );
        }

        setCachedSocialPostCommentCounts(
          queryClient,
          draft.postId,
          nextCounts,
        );
      }

      await queryClient.invalidateQueries({
        queryKey: commentsQueryKey,
        exact: true,
      });
      await queryClient.invalidateQueries({
        queryKey: SOCIAL_POST_QUERY_KEY(draft.postId),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
    },
    onSettled: (_response, _error, draft) => {
      setPendingDeleteCommentIds((currentState) => {
        if (!currentState[draft.commentId]) {
          return currentState;
        }

        const { [draft.commentId]: _removedCommentId, ...remainingPendingState } =
          currentState;
        return remainingPendingState;
      });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: ({ postId }: DeleteSocialPostDraft) => {
      if (!userProfile?.id) {
        throw new Error('Authentication required');
      }

      return deleteSocialPost(postId);
    },
    onMutate: async ({ postId }) => {
      await queryClient.cancelQueries({ queryKey: ['socialFeed'] });
      setPendingDeletePostIds((currentState) => ({
        ...currentState,
        [postId]: true,
      }));
    },
    onError: (error, draft) => {
      trackFailureEvent('social_post_delete_failed', error, {
        post_id: draft.postId,
      });
    },
    onSuccess: async (_response, draft) => {
      const postId = draft.postId;
      const snapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
        queryKey: ['socialFeed'],
      });

      for (const [queryKey, snapshot] of snapshots) {
        if (!snapshot) {
          continue;
        }

        queryClient.setQueryData<SocialFeedInfiniteData>(queryKey, {
          ...snapshot,
          pages:
            removeSocialPostFromFeedPages(snapshot.pages, postId) ?? snapshot.pages,
        });
      }

      queryClient.removeQueries({
        queryKey: SOCIAL_POST_QUERY_KEY(postId),
        exact: true,
      });
      queryClient.removeQueries({
        queryKey: SOCIAL_COMMENTS_QUERY_KEY(postId),
        exact: true,
      });

      await queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
      await queryClient.invalidateQueries({
        queryKey: SOCIAL_POST_QUERY_KEY(postId),
        exact: true,
      });
      await queryClient.invalidateQueries({
        queryKey: SOCIAL_COMMENTS_QUERY_KEY(postId),
      });
    },
    onSettled: (_response, _error, draft) => {
      setPendingDeletePostIds((currentState) => {
        if (!currentState[draft.postId]) {
          return currentState;
        }

        const { [draft.postId]: _removedPostId, ...remainingPendingState } =
          currentState;
        return remainingPendingState;
      });
    },
  });

  const reportContentMutation = useMutation({
    mutationFn: (request: SocialReportContentRequest) =>
      reportSocialContent(request),
    onError: (error, request) => {
      trackFailureEvent('moderation_report_submission_failed', error, {
        target_type: request.target_type,
        reason_code: request.reason_code,
      });
    },
    onSuccess: (_response, request) => {
      trackEvent('social_report_submitted', {
        target_type: request.target_type,
        reason_code: request.reason_code,
      });
      void queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
      if (request.target_post_id) {
        void queryClient.invalidateQueries({
          queryKey: SOCIAL_POST_QUERY_KEY(request.target_post_id),
          exact: true,
        });
        void queryClient.invalidateQueries({
          queryKey: SOCIAL_COMMENTS_QUERY_KEY(request.target_post_id),
        });
      }
    },
  });

  const followAuthorMutation = useMutation({
    mutationFn: ({
      authorId,
      action,
    }: {
      authorId: string;
      action?: 'follow' | 'unfollow';
    }) => followSocialAuthor(authorId, action),
    onMutate: async ({ authorId, action }) => {
      await queryClient.cancelQueries({ queryKey: ['socialFeed'] });
      const previousSnapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
        queryKey: ['socialFeed'],
      });

      // Optimistic state: explicit > inferred toggle from cache.
      let optimisticFollowing: boolean | null = null;
      if (action === 'follow') {
        optimisticFollowing = true;
      } else if (action === 'unfollow') {
        optimisticFollowing = false;
      } else {
        for (const [, snapshot] of previousSnapshots) {
          if (!snapshot) continue;
          for (const page of snapshot.pages) {
            const match = page.items.find((post) => post.author_id === authorId);
            if (match) {
              optimisticFollowing = !(match.viewer_follows_author === true);
              break;
            }
          }
          if (optimisticFollowing !== null) break;
        }
      }

      if (optimisticFollowing !== null) {
        for (const [queryKey, snapshot] of previousSnapshots) {
          if (!snapshot) continue;
          const nextPages = applyFollowStateToFeedPages(
            snapshot.pages,
            authorId,
            optimisticFollowing,
          );
          if (nextPages) {
            queryClient.setQueryData<SocialFeedInfiniteData>(queryKey, {
              ...snapshot,
              pages: nextPages,
            });
          }
        }
      }

      return { authorId, previousSnapshots };
    },
    onError: (error, draft, context) => {
      if (!context) return;
      for (const [queryKey, snapshot] of context.previousSnapshots) {
        queryClient.setQueryData(queryKey, snapshot);
      }
      trackFailureEvent('social_follow_author_failed', error, {
        author_id: draft.authorId,
        action: draft.action ?? 'toggle',
      });
    },
    onSuccess: (response: SocialFollowAuthorResponse) => {
      // Reconcile cache with server truth.
      const snapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
        queryKey: ['socialFeed'],
      });
      for (const [queryKey, snapshot] of snapshots) {
        if (!snapshot) continue;
        const nextPages = applyFollowStateToFeedPages(
          snapshot.pages,
          response.author_id,
          response.following,
        );
        if (nextPages) {
          queryClient.setQueryData<SocialFeedInfiniteData>(queryKey, {
            ...snapshot,
            pages: nextPages,
          });
        }
      }
      trackEvent('social_author_follow_toggled', {
        author_id: response.author_id,
        following: response.following,
      });
    },
  });

  const hideAuthorMutation = useMutation({
    mutationFn: ({
      authorId,
      action,
    }: {
      authorId: string;
      action?: 'hide' | 'unhide';
    }) => hideSocialAuthor(authorId, action),
    onMutate: async ({ authorId, action }) => {
      await queryClient.cancelQueries({ queryKey: ['socialFeed'] });
      const previousSnapshots = queryClient.getQueriesData<SocialFeedInfiniteData>({
        queryKey: ['socialFeed'],
      });

      // Only remove from cache for 'hide' or toggle-into-hidden. 'unhide' has
      // no client-side effect because the posts are not in the cache anymore.
      const shouldRemove = action !== 'unhide';
      if (shouldRemove) {
        for (const [queryKey, snapshot] of previousSnapshots) {
          if (!snapshot) continue;
          const nextPages = removeAuthorPostsFromFeedPages(snapshot.pages, authorId);
          if (nextPages) {
            queryClient.setQueryData<SocialFeedInfiniteData>(queryKey, {
              ...snapshot,
              pages: nextPages,
            });
          }
        }
      }

      return { authorId, previousSnapshots };
    },
    onError: (error, draft, context) => {
      if (!context) return;
      for (const [queryKey, snapshot] of context.previousSnapshots) {
        queryClient.setQueryData(queryKey, snapshot);
      }
      trackFailureEvent('social_hide_author_failed', error, {
        author_id: draft.authorId,
        action: draft.action ?? 'toggle',
      });
    },
    onSuccess: (response: SocialHideAuthorResponse) => {
      // If the server confirms unhide, invalidate feed to fetch the now-visible posts.
      if (!response.hidden) {
        void queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
      }
      trackEvent('social_author_hide_toggled', {
        author_id: response.author_id,
        hidden: response.hidden,
      });
    },
  });

  return {
    createPostMutation,
    createCommentMutation,
    updateCommentMutation,
    deleteCommentMutation,
    deletePostMutation,
    setCommentLikeMutation,
    setReactionMutation,
    reportContentMutation,
    followAuthorMutation,
    hideAuthorMutation,
    commentLikeError,
    reactionError,
    clearCommentLikeError,
    clearReactionError,
    isDeletePending: (postId: string) => pendingDeletePostIds[postId] === true,
    isCommentLikePending: (commentId: string) =>
      typeof pendingCommentLikeSequences[commentId] === 'number',
    isCommentUpdatePending: (commentId: string) =>
      pendingUpdateCommentIds[commentId] === true,
    isCommentDeletePending: (commentId: string) =>
      pendingDeleteCommentIds[commentId] === true,
    isReactionPending: (postId: string) =>
      typeof pendingReactionSequences[postId] === 'number',
  };
};

export type UseSocialMutationsResult = ReturnType<typeof useSocialMutations>;
