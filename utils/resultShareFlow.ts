import { resolveAvatarUrl } from '@/services/avatar';
import { saveShareStorySocialComposerDraft } from '@/services/socialDraftStore';
import { getAnalysisResultScanType } from '@/utils/analysisNormalization';
import {
  buildShareStoryPayload,
  buildShareStoryRouteParams,
} from '@/utils/shareStory';
import type { ShareableAnalysisResult, UserProfile } from '@/types';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type RouterLike = {
  push: (...args: any[]) => void;
};

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'cancel' | 'default' | 'destructive';
  tone?: 'soft' | 'ghost';
};

type ShowAlertLike = (...args: any[]) => void;

interface ResultShareFlowOptions {
  analysisData: ShareableAnalysisResult;
  imageUri?: string;
  scanId?: string | null;
  locale: string;
  t: TranslateFn;
  userProfile?: Pick<UserProfile, 'avatar_url'> | null;
  socialEnabled?: boolean;
  isPreparingCommunityShare: boolean;
  setIsPreparingCommunityShare: (value: boolean) => void;
  router: RouterLike;
  showAlert: ShowAlertLike;
}

export function buildResultSharePreviewRoute(options: {
  analysisData: ShareableAnalysisResult;
  imageUri?: string;
  scanId?: string | null;
}) {
  return {
    pathname: '/share-story' as const,
    params: buildShareStoryRouteParams({
      analysisData: options.analysisData,
      imageUri: options.imageUri,
      scanId: options.scanId ?? undefined,
    }),
  };
}

export function openResultShareFlow(options: ResultShareFlowOptions) {
  if (getAnalysisResultScanType(options.analysisData) === 'fat_distribution_scan_v2') {
    options.showAlert(
      options.t('share_story.unavailable.title'),
      options.t('share_story.unsupported_super_message'),
      [{ text: options.t('common.ok') }],
    );
    return;
  }

  const openExternalSharePreview = () => {
    options.router.push(
      buildResultSharePreviewRoute({
        analysisData: options.analysisData,
        imageUri: options.imageUri,
        scanId: options.scanId,
      }),
    );
  };

  if (options.isPreparingCommunityShare) {
    return;
  }

  if (!options.socialEnabled) {
    openExternalSharePreview();
    return;
  }

  const handleCommunityShare = async () => {
    if (options.isPreparingCommunityShare) {
      return;
    }

    try {
      options.setIsPreparingCommunityShare(true);
      const resolvedAvatarUrl = await resolveAvatarUrl(
        options.userProfile?.avatar_url,
      );
      const sharePayload = buildShareStoryPayload({
        analysisData: options.analysisData,
        imageUri: options.imageUri,
        avatarUrl: resolvedAvatarUrl,
        locale: options.locale,
        t: options.t,
      });

      if (!sharePayload) {
        options.showAlert(
          options.t('share_story.unavailable.title'),
          options.t('share_story.unsupported_super_message'),
          [{ text: options.t('common.ok') }],
        );
        return;
      }

      const socialDraft = await saveShareStorySocialComposerDraft({
        scanId: options.scanId ?? null,
        payload: sharePayload,
      });

      options.router.push({
        pathname: '/social-compose' as const,
        params: {
          draftId: socialDraft.id,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : options.t('social.composer.error_submit');

      options.showAlert(options.t('social.composer.error_title'), message, [
        { text: options.t('common.ok') },
      ]);
    } finally {
      options.setIsPreparingCommunityShare(false);
    }
  };

  options.showAlert(
    options.t('share_story.chooser.title'),
    options.t('share_story.chooser.message'),
    [
      {
        text: options.t('share_story.chooser.external_action'),
        onPress: openExternalSharePreview,
      },
      {
        text: options.t('share_story.chooser.community_action'),
        onPress: () => {
          void handleCommunityShare();
        },
        tone: 'soft',
      },
      {
        text: options.t('common.cancel'),
        style: 'cancel',
        tone: 'ghost',
      },
    ],
    undefined,
    {
      dismissible: true,
      variant: 'info',
    },
  );
}
