import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as mockReactNative from 'react-native';

import PostSignupOnboardingScreen from '@/screens/PostSignupOnboardingScreen';
import { DARK_COLORS, LIGHT_COLORS, SPACING } from '@/constants/theme';

const mockReplace = jest.fn();
const mockMarkTutorialSeen = jest.fn();
const mockUpdateAvatarUrl = jest.fn();
const mockClearPostSignupOnboardingPending = jest.fn();
const mockClearPostSignupOnboardingAvatarHandled = jest.fn();
const mockHasPostSignupOnboardingAvatarHandled = jest.fn();
const mockEnsureGrowthExperience = jest.fn();
const mockShouldPresentEntryOffer = jest.fn();
const mockFetchRevenueCatCustomerInfo = jest.fn();
const mockHasPremiumEntitlement = jest.fn();
const mockMarkAutoPresentationStarted = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLanguage = jest.fn();
const mockUseFeatureFlags = jest.fn();
const mockUseGrowthExperience = jest.fn();
const mockUsePostSignupOnboardingPending = jest.fn();
const mockUseTheme = jest.fn();
const mockActualOnboardingPromoAssets =
  jest.requireActual<typeof import('@/constants/onboardingPromoAssets')>(
    '@/constants/onboardingPromoAssets',
  );
const mockGetOnboardingPromoAsset = jest.fn(
  mockActualOnboardingPromoAssets.getOnboardingPromoAsset,
);
const mockFridgeScanIllustration = jest.fn(
  ({ isDark }: { isDark: boolean }) => {
    const { Text } = mockReactNative;

    return (
      <Text testID="fridge-preview-theme">{isDark ? 'dark' : 'light'}</Text>
    );
  },
);
const originalPlatform = mockReactNative.Platform.OS;
const reactNativeModule =
  jest.requireActual<typeof import('react-native')>('react-native');
const useWindowDimensionsSpy = jest.spyOn(
  reactNativeModule,
  'useWindowDimensions',
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@/constants/onboardingPromoAssets', () => {
  const actual = jest.requireActual('@/constants/onboardingPromoAssets');

  return {
    ...actual,
    getOnboardingPromoAsset: (theme: any, locale: any, slide: any) =>
      mockGetOnboardingPromoAsset(theme, locale, slide),
  };
});

jest.mock('@/components/Button', () => ({
  Button: ({
    title,
    onPress,
    disabled,
    loading,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => {
    const { Text, TouchableOpacity } = mockReactNative;

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
      >
        <Text>{loading ? 'Loading...' : title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('react-native-pager-view', () => {
  const mockReact = jest.requireActual('react');
  const { View } = mockReactNative;

  const MockPagerView = mockReact.forwardRef(
    (
      {
        children,
        initialPage = 0,
        onPageSelected,
        style,
      }: {
        children: React.ReactNode;
        initialPage?: number;
        onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
        style?: mockReactNative.StyleProp<mockReactNative.ViewStyle>;
      },
      ref: React.ForwardedRef<{ setPage: (nextPage: number) => void }>
    ) => {
      const pages = mockReact.Children.toArray(children);
      const [page, setPage] = mockReact.useState(initialPage);

      mockReact.useImperativeHandle(ref, () => ({
        setPage(nextPage: number) {
          setPage(nextPage);
          onPageSelected?.({ nativeEvent: { position: nextPage } });
        },
      }));

      return <View style={style}>{pages[page]}</View>;
    }
  );
  MockPagerView.displayName = 'MockPagerView';

  return {
    __esModule: true,
    default: MockPagerView,
  };
});

jest.mock('@/components/AvatarPicker', () => ({
  AvatarPicker: ({
    currentAvatarUrl,
    onAvatarSelected,
  }: {
    currentAvatarUrl?: string | null;
    onAvatarSelected: (avatarReference: string) => void;
  }) => {
    const { Text, TouchableOpacity, View } = mockReactNative;

    return (
      <View>
        <Text>{currentAvatarUrl ? 'Avatar present' : 'Avatar missing'}</Text>
        <TouchableOpacity
          onPress={() => onAvatarSelected('avatars/test-user.jpg')}
          testID="avatar-picker-select"
        >
          <Text>Select avatar</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

jest.mock('@/components/home/FridgeScanIllustration', () => ({
  FridgeScanIllustration: (props: { isDark: boolean }) =>
    mockFridgeScanIllustration(props),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => mockUseLanguage(),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockUseTheme(),
}));

jest.mock('@/hooks/queries', () => ({
  useFeatureFlags: () => mockUseFeatureFlags(),
  useGrowthExperience: () => mockUseGrowthExperience(),
}));

jest.mock('@/hooks/usePostSignupOnboardingPending', () => ({
  usePostSignupOnboardingPending: () => mockUsePostSignupOnboardingPending(),
}));

jest.mock('@/services/growthExperience', () => ({
  ensureGrowthExperience: (...args: unknown[]) =>
    mockEnsureGrowthExperience(...args),
  shouldPresentEntryOffer: (...args: unknown[]) =>
    mockShouldPresentEntryOffer(...args),
}));

jest.mock('@/services/revenueCatOfferings', () => ({
  fetchRevenueCatCustomerInfo: () => mockFetchRevenueCatCustomerInfo(),
  hasPremiumEntitlement: (...args: unknown[]) => mockHasPremiumEntitlement(...args),
}));

jest.mock('@/utils/postSignupOnboarding', () => ({
  clearPostSignupOnboardingPending: (...args: unknown[]) =>
    mockClearPostSignupOnboardingPending(...args),
  clearPostSignupOnboardingAvatarHandled: (...args: unknown[]) =>
    mockClearPostSignupOnboardingAvatarHandled(...args),
  hasPostSignupOnboardingAvatarHandled: (...args: unknown[]) =>
    mockHasPostSignupOnboardingAvatarHandled(...args),
}));

jest.mock('@/utils/entryOfferSession', () => ({
  entryOfferSession: {
    markAutoPresentationStarted: (...args: unknown[]) =>
      mockMarkAutoPresentationStarted(...args),
  },
}));

describe('PostSignupOnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(mockReactNative.Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    mockGetOnboardingPromoAsset.mockReset();
    mockGetOnboardingPromoAsset.mockImplementation(
      mockActualOnboardingPromoAssets.getOnboardingPromoAsset,
    );
    mockFridgeScanIllustration.mockClear();

    mockMarkTutorialSeen.mockResolvedValue(undefined);
    mockUpdateAvatarUrl.mockResolvedValue(undefined);
    mockClearPostSignupOnboardingPending.mockResolvedValue(undefined);
    mockClearPostSignupOnboardingAvatarHandled.mockResolvedValue(undefined);
    mockHasPostSignupOnboardingAvatarHandled.mockResolvedValue(false);
    mockEnsureGrowthExperience.mockResolvedValue({ experience: 'default' });
    mockShouldPresentEntryOffer.mockReturnValue(false);
    mockFetchRevenueCatCustomerInfo.mockResolvedValue({ entitlements: {} });
    mockHasPremiumEntitlement.mockReturnValue(false);
    mockUseFeatureFlags.mockReturnValue({
      data: { entry_offer_offering_id: 'entry-offer-default' },
    });
    mockUseLanguage.mockReturnValue({
      t: (key: string) =>
        ({
          'common.next': 'Suivant',
          'onboarding.avatar_title': 'Ajoutez une photo de profil',
          'onboarding.avatar_subtitle': "C'est optionnel pour l'instant.",
          'onboarding.avatar_change_title': 'Photo de profil',
          'onboarding.avatar_change_subtitle':
            'Gardez-la ou changez-la plus tard.',
          'onboarding.avatar_skip': 'Passer pour le moment',
          'onboarding.enter_app': "Ouvrir l'app",
          'onboarding.slide_1_eyebrow': 'Scanner',
          'onboarding.slide_1_title': 'Scanne ce qui compte',
          'onboarding.slide_1_subtitle':
            'Capture visage, corps et repas en quelques secondes.',
        })[key] ?? key,
      locale: 'fr',
      language: 'fr',
      changeLanguage: jest.fn(),
    });
    mockUseGrowthExperience.mockReturnValue({ data: null });
    mockUsePostSignupOnboardingPending.mockReturnValue({
      isPending: true,
      isLoading: false,
      refresh: jest.fn(),
    });
    mockUseTheme.mockReturnValue({
      colors: LIGHT_COLORS,
      isDark: false,
      toggleTheme: jest.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: null,
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });
  });

  it('renders the avatar step first without rendering the intro slides', async () => {
    render(<PostSignupOnboardingScreen />);

    expect(await screen.findByTestId('post-signup-avatar-step')).toBeTruthy();
    expect(screen.queryByTestId('post-signup-slides-step')).toBeNull();
    expect(screen.queryByText('Ouvrir l\'app')).toBeNull();
  });

  it('compacts onboarding content padding on short Android devices', async () => {
    Object.defineProperty(mockReactNative.Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 360,
      height: 720,
      scale: 3,
      fontScale: 1,
    });

    render(<PostSignupOnboardingScreen />);

    const content = await screen.findByTestId('post-signup-content');
    const contentStyle = mockReactNative.StyleSheet.flatten(content.props.style);

    expect(contentStyle).toEqual(
      expect.objectContaining({
        paddingTop: SPACING.lg,
        paddingBottom: SPACING.sm + SPACING.lg,
        paddingHorizontal: SPACING.lg,
      }),
    );
  });

  it('starts directly on slides when the pre-auth flow already handled avatar', async () => {
    mockHasPostSignupOnboardingAvatarHandled.mockResolvedValue(true);

    render(<PostSignupOnboardingScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-slides-step')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-avatar-step')).toBeNull();
  });

  it('lets a user without an avatar skip cleanly into the slides step', async () => {
    render(<PostSignupOnboardingScreen />);

    fireEvent.press(await screen.findByTestId('post-signup-skip-avatar'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-slides-step')).toBeTruthy();
    });

    expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
    expect(screen.queryByTestId('post-signup-avatar-step')).toBeNull();
  });

  it('renders the localized light promo hero with native slide copy when the active locale has an asset', async () => {
    mockUseLanguage.mockReturnValue({
      t: (key: string) =>
        ({
          'common.next': 'Next',
          'onboarding.avatar_change_title': 'Profile photo',
          'onboarding.avatar_change_subtitle': 'Keep it or change it later.',
          'onboarding.enter_app': 'Open app',
          'onboarding.slide_1_eyebrow': 'Scanner',
          'onboarding.slide_1_title': 'Scan what matters',
          'onboarding.slide_1_subtitle':
            'Capture face, body, and meals in seconds.',
        })[key] ?? key,
      locale: 'en',
      language: 'en',
      changeLanguage: jest.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    await screen.findByTestId('post-signup-avatar-step');

    fireEvent.press(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
    });

    expect(screen.getByText('Scan what matters')).toBeTruthy();
    expect(
      screen.getByText('Capture face, body, and meals in seconds.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('post-signup-fallback-slide-scanner')).toBeNull();
  });

  it('renders final promo heroes for every onboarding slide', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    await screen.findByTestId('post-signup-avatar-step');

    fireEvent.press(screen.getByText('Suivant'));

    const slideKeys = ['scanner', 'coach', 'social', 'analytics', 'fridge'];

    for (const [index, slideKey] of slideKeys.entries()) {
      await waitFor(() => {
        expect(
          screen.getByTestId(`post-signup-promo-slide-${slideKey}`),
        ).toBeTruthy();
      });

      expect(
        screen.queryByTestId(`post-signup-fallback-slide-${slideKey}`),
      ).toBeNull();

      if (index < slideKeys.length - 1) {
        fireEvent.press(screen.getByText('Suivant'));
      }
    }
  });

  it('uses a restrained hero crop for standard vertical promo assets', async () => {
    const resolveAssetSourceSpy = jest
      .spyOn(mockReactNative.Image, 'resolveAssetSource')
      .mockReturnValue({ width: 941, height: 1672, scale: 1 } as any);

    try {
      render(<PostSignupOnboardingScreen />);

      fireEvent.press(await screen.findByTestId('post-signup-skip-avatar'));

      await waitFor(() => {
        expect(
          screen.getByTestId('post-signup-promo-hero-image-scanner'),
        ).toBeTruthy();
      });

      const image = screen.getByTestId('post-signup-promo-hero-image-scanner');
      const imageStyle = mockReactNative.StyleSheet.flatten(image.props.style);

      expect(imageStyle.transform).toEqual([{ scale: 1.045 }]);
    } finally {
      resolveAssetSourceSpy.mockRestore();
    }
  });

  it('uses a more conservative hero crop for wider promo assets', async () => {
    const resolveAssetSourceSpy = jest
      .spyOn(mockReactNative.Image, 'resolveAssetSource')
      .mockReturnValue({ width: 1024, height: 1536, scale: 1 } as any);

    try {
      render(<PostSignupOnboardingScreen />);

      fireEvent.press(await screen.findByTestId('post-signup-skip-avatar'));

      await waitFor(() => {
        expect(
          screen.getByTestId('post-signup-promo-hero-image-scanner'),
        ).toBeTruthy();
      });

      const image = screen.getByTestId('post-signup-promo-hero-image-scanner');
      const imageStyle = mockReactNative.StyleSheet.flatten(image.props.style);

      expect(imageStyle.transform).toEqual([{ scale: 1.025 }]);
    } finally {
      resolveAssetSourceSpy.mockRestore();
    }
  });

  it('renders the localized dark promo hero when the active locale has a dark scanner asset', async () => {
    mockUseLanguage.mockReturnValue({
      t: (key: string) =>
        ({
          'common.next': 'Next',
          'onboarding.avatar_change_title': 'Profile photo',
          'onboarding.avatar_change_subtitle': 'Keep it or change it later.',
          'onboarding.enter_app': 'Open app',
        })[key] ?? key,
      locale: 'en',
      language: 'en',
      changeLanguage: jest.fn(),
    });
    mockUseTheme.mockReturnValue({
      colors: DARK_COLORS,
      isDark: true,
      toggleTheme: jest.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    await screen.findByTestId('post-signup-avatar-step');

    fireEvent.press(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-fallback-slide-scanner')).toBeNull();
  });

  it('renders the localized dark promo hero for the french scanner asset', async () => {
    mockUseLanguage.mockReturnValue({
      t: (key: string) =>
        ({
          'common.next': 'Suivant',
          'onboarding.avatar_change_title': 'Photo de profil',
          'onboarding.avatar_change_subtitle':
            'Gardez-la ou changez-la plus tard.',
          'onboarding.enter_app': "Ouvrir l'app",
        })[key] ?? key,
      locale: 'fr',
      language: 'fr',
      changeLanguage: jest.fn(),
    });
    mockUseTheme.mockReturnValue({
      colors: DARK_COLORS,
      isDark: true,
      toggleTheme: jest.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    await screen.findByTestId('post-signup-avatar-step');

    fireEvent.press(screen.getByText('Suivant'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-fallback-slide-scanner')).toBeNull();
  });

  it('passes the light theme through to the fridge fallback preview', async () => {
    mockGetOnboardingPromoAsset.mockImplementation((theme, locale, slide) =>
      slide === 'fridge'
        ? null
        : mockActualOnboardingPromoAssets.getOnboardingPromoAsset(
            theme,
            locale,
            slide,
          ),
    );
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    await screen.findByTestId('post-signup-avatar-step');

    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-fallback-slide-fridge')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-promo-slide-fridge')).toBeNull();
    expect(screen.getByTestId('fridge-preview-theme').props.children).toBe('light');
    expect(mockFridgeScanIllustration).toHaveBeenLastCalledWith(
      expect.objectContaining({ isDark: false }),
    );
  });

  it('passes the dark theme through to the fridge fallback preview', async () => {
    mockGetOnboardingPromoAsset.mockImplementation((theme, locale, slide) =>
      slide === 'fridge'
        ? null
        : mockActualOnboardingPromoAssets.getOnboardingPromoAsset(
            theme,
            locale,
            slide,
          ),
    );
    mockUseTheme.mockReturnValue({
      colors: DARK_COLORS,
      isDark: true,
      toggleTheme: jest.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    await screen.findByTestId('post-signup-avatar-step');

    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-fallback-slide-fridge')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-promo-slide-fridge')).toBeNull();
    expect(screen.getByTestId('fridge-preview-theme').props.children).toBe('dark');
    expect(mockFridgeScanIllustration).toHaveBeenLastCalledWith(
      expect.objectContaining({ isDark: true }),
    );
  });

  it('keeps existing-avatar users on the full avatar step before the slides', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    expect(await screen.findByTestId('post-signup-avatar-step')).toBeTruthy();
    expect(screen.queryByTestId('post-signup-skip-avatar')).toBeNull();
    expect(screen.getByText('Photo de profil')).toBeTruthy();

    fireEvent.press(screen.getByText('Suivant'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-slides-step')).toBeTruthy();
    });
  });

  it('moves from the avatar step to the slides after an avatar selection', async () => {
    render(<PostSignupOnboardingScreen />);

    fireEvent.press(await screen.findByTestId('avatar-picker-select'));

    await waitFor(() => {
      expect(mockUpdateAvatarUrl).toHaveBeenCalledWith('avatars/test-user.jpg');
    });

    fireEvent.press(screen.getByText('Suivant'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-slides-step')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-avatar-step')).toBeNull();
  });

  it('completes onboarding from the slides step and clears the pending flag', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        avatar_url: 'avatars/existing-user.jpg',
        has_seen_tutorial: false,
        account_tier: 'free',
      },
      isEmailVerified: true,
      markTutorialSeen: mockMarkTutorialSeen,
      updateAvatarUrl: mockUpdateAvatarUrl,
    });

    render(<PostSignupOnboardingScreen />);

    await screen.findByTestId('post-signup-avatar-step');

    // 1 press : avatar -> slide 0
    fireEvent.press(screen.getByText('Suivant'));
    // 4 presses : slide 0 -> 1 -> 2 -> 3 -> 4 (last)
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));

    await waitFor(() => {
      expect(screen.getByText('Ouvrir l\'app')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Ouvrir l\'app'));

    await waitFor(() => {
      expect(mockMarkTutorialSeen).toHaveBeenCalledTimes(1);
      expect(mockClearPostSignupOnboardingPending).toHaveBeenCalledWith('user-123');
      expect(mockClearPostSignupOnboardingAvatarHandled).toHaveBeenCalledWith('user-123');
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });

    expect(mockMarkAutoPresentationStarted).not.toHaveBeenCalled();
  });
});
