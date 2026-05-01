import { openResultShareFlow } from '@/utils/resultShareFlow';

jest.mock('@/services/avatar', () => ({
  resolveAvatarUrl: jest.fn(),
}));

jest.mock('@/services/socialDraftStore', () => ({
  saveShareStorySocialComposerDraft: jest.fn(),
}));

describe('resultShareFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks sharing for fat_distribution_scan_v2 with an explicit MVP message', () => {
    const router = {
      push: jest.fn(),
    };
    const showAlert = jest.fn();
    const t = (key: string) => {
      const translations: Record<string, string> = {
        'share_story.unavailable.title': 'Sharing unavailable',
        'share_story.unsupported_super_message':
          'Sharing is not available yet for this new Super Scan format.',
        'common.ok': 'OK',
      };

      return translations[key] ?? key;
    };

    openResultShareFlow({
      analysisData: {
        scan_type: 'fat_distribution_scan_v2',
      } as any,
      imageUri: 'file:///fat-super.jpg',
      scanId: 'scan-fat-super',
      locale: 'en',
      t,
      userProfile: null,
      socialEnabled: true,
      isPreparingCommunityShare: false,
      setIsPreparingCommunityShare: jest.fn(),
      router,
      showAlert,
    });

    expect(showAlert).toHaveBeenCalledWith(
      'Sharing unavailable',
      'Sharing is not available yet for this new Super Scan format.',
      [{ text: 'OK' }],
    );
    expect(router.push).not.toHaveBeenCalled();
  });
});
