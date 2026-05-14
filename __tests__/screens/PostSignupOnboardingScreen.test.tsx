import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as mockReactNative from 'react-native';

import { SUPPORTED_LOCALES, type LocaleCode } from '@/i18n/config';
import PostSignupOnboardingScreen from '@/screens/PostSignupOnboardingScreen';
import { DARK_COLORS, LIGHT_COLORS, SPACING } from '@/constants/theme';

const mockReplace = jest.fn();
const mockMarkTutorialSeen = jest.fn();
const mockUpdateAvatarUrl = jest.fn();
const mockClearPostSignupOnboardingPending = jest.fn();
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
    getOnboardingPromoAsset: (theme: any, slide: any) =>
      mockGetOnboardingPromoAsset(theme, slide),
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
jest.mock('@/hooks/queries/useFeatureFlags', () => ({
  useFeatureFlags: () => mockUseFeatureFlags(),
}));
jest.mock('@/hooks/queries/useGrowthExperience', () => ({
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
}));

jest.mock('@/utils/entryOfferSession', () => ({
  entryOfferSession: {
    markAutoPresentationStarted: (...args: unknown[]) =>
      mockMarkAutoPresentationStarted(...args),
  },
}));

const SLIDE_KEYS = ['scanner', 'coach', 'analytics', 'social', 'fridge'] as const;

const LOCALE_COPY: Record<
  LocaleCode,
  {
    next: string;
    skip: string;
    enterApp: string;
    slide1Title: string;
    slide1Subtitle: string;
  }
> = {
  fr: {
    next: 'Suivant',
    skip: 'Passer',
    enterApp: "Ouvrir l'app",
    slide1Title: 'Scanne d abord. Devine moins.',
    slide1Subtitle:
      'Une photo pour vos repas, votre visage ou votre corps. Health Scan en fait un point de depart clair.',
  },
  en: {
    next: 'Next',
    skip: 'Skip',
    enterApp: 'Open app',
    slide1Title: 'Scan first. Guess less.',
    slide1Subtitle:
      'One photo for your meals, face, or body. Health Scan turns it into a clear starting point.',
  },
  de: {
    next: 'Weiter',
    skip: 'Überspringen',
    enterApp: 'App öffnen',
    slide1Title: 'Scanne zuerst. Rate weniger.',
    slide1Subtitle:
      'Ein Foto für Mahlzeiten, Gesicht oder Körper. Health Scan macht daraus einen klaren Ausgangspunkt.',
  },
  it: {
    next: 'Avanti',
    skip: 'Salta',
    enterApp: "Apri l'app",
    slide1Title: 'Scansiona prima. Immagina meno.',
    slide1Subtitle:
      'Una foto per pasti, viso o corpo. Health Scan la trasforma in un punto di partenza chiaro.',
  },
  es: {
    next: 'Siguiente',
    skip: 'Omitir',
    enterApp: 'Abrir la app',
    slide1Title: 'Escanea primero. Adivina menos.',
    slide1Subtitle:
      'Una foto para tus comidas, rostro o cuerpo. Health Scan la convierte en un punto de partida claro.',
  },
  pt: {
    next: 'Próximo',
    skip: 'Pular',
    enterApp: 'Abrir o app',
    slide1Title: 'Escaneie primeiro. Suponha menos.',
    slide1Subtitle:
      'Uma foto para refeições, rosto ou corpo. O Health Scan transforma isso em um ponto de partida claro.',
  },
};

function buildLanguageMock(locale: LocaleCode) {
  const copy = LOCALE_COPY[locale];

  return {
    t: (key: string) =>
      (
        {
          'common.next': copy.next,
          'common.skip': copy.skip,
          'common.error': 'Erreur',
          'onboarding.enter_app': copy.enterApp,
          'onboarding.slide_1_title': copy.slide1Title,
          'onboarding.slide_1_subtitle': copy.slide1Subtitle,
          'onboarding.social_avatar_prompt_title':
            'Ajoutez une photo pour etre reconnu plus vite',
          'onboarding.social_avatar_prompt_subtitle':
            'Optionnel, mais pratique quand vous partagez vos scans et votre progression.',
        } as Record<string, string>
      )[key] ?? key,
    locale,
    language: locale,
    changeLanguage: jest.fn(),
  };
}

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
          'common.skip': 'Passer',
          'common.error': 'Erreur',
          'onboarding.enter_app': "Ouvrir l'app",
          'onboarding.social_avatar_prompt_title':
            'Ajoutez une photo pour etre reconnu plus vite',
          'onboarding.social_avatar_prompt_subtitle':
            'Optionnel, mais pratique quand vous partagez vos scans et votre progression.',
          'onboarding.slide_1_title': 'Scanne d abord. Devine moins.',
          'onboarding.slide_1_subtitle':
            'Une photo pour vos repas, votre visage ou votre corps. Health Scan en fait un point de depart clair.',
        } as Record<string, string>)[key] ?? key,
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

  it('renders the slides flow immediately without an avatar step', async () => {
    render(<PostSignupOnboardingScreen />);

    expect(await screen.findByTestId('post-signup-slides-step')).toBeTruthy();
    expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
    expect(screen.queryByTestId('post-signup-avatar-step')).toBeNull();
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

  it('renders the localized light promo hero with native slide copy when the active locale has an asset', async () => {
    mockUseLanguage.mockReturnValue(buildLanguageMock('en'));

    render(<PostSignupOnboardingScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
    });

    expect(screen.getByText('Scan first. Guess less.')).toBeTruthy();
    expect(
      screen.getByText(
        'One photo for your meals, face, or body. Health Scan turns it into a clear starting point.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('post-signup-fallback-slide-scanner')).toBeNull();
  });

  it.each(SUPPORTED_LOCALES)(
    'renders promo heroes in the new slide order for %s',
    async (locale) => {
      const copy = LOCALE_COPY[locale];

      mockUseLanguage.mockReturnValue(buildLanguageMock(locale));

      render(<PostSignupOnboardingScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
      });

      expect(screen.getByText(copy.slide1Title)).toBeTruthy();
      expect(screen.getByText(copy.slide1Subtitle)).toBeTruthy();

      for (const [index, slideKey] of SLIDE_KEYS.entries()) {
        expect(
          screen.getByTestId(`post-signup-promo-slide-${slideKey}`),
        ).toBeTruthy();
        expect(
          screen.queryByTestId(`post-signup-fallback-slide-${slideKey}`),
        ).toBeNull();

        if (index < SLIDE_KEYS.length - 1) {
          fireEvent.press(screen.getByText(copy.next));
          await waitFor(() => {
            expect(
              screen.getByTestId(
                `post-signup-promo-slide-${SLIDE_KEYS[index + 1]}`,
              ),
            ).toBeTruthy();
          });
        }
      }
    },
  );

  it('skips directly to the final slide and swaps the CTA', async () => {
    render(<PostSignupOnboardingScreen />);

    fireEvent.press(await screen.findByText('Passer'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-promo-slide-fridge')).toBeTruthy();
    });

    expect(screen.getByText("Ouvrir l'app")).toBeTruthy();
  });

  it('shows an optional avatar prompt on the social slide and lets the user resolve it inline', async () => {
    render(<PostSignupOnboardingScreen />);

    fireEvent.press(await screen.findByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(screen.getByText('Suivant'));

    await waitFor(() => {
      expect(
        screen.getByTestId('post-signup-social-avatar-prompt'),
      ).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('avatar-picker-select'));

    await waitFor(() => {
      expect(mockUpdateAvatarUrl).toHaveBeenCalledWith('avatars/test-user.jpg');
    });
  });

  it('uses a restrained hero crop for standard vertical promo assets', async () => {
    const resolveAssetSourceSpy = jest
      .spyOn(mockReactNative.Image, 'resolveAssetSource')
      .mockReturnValue({ width: 941, height: 1672, scale: 1 } as any);

    try {
      render(<PostSignupOnboardingScreen />);

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

  it('renders the localized dark promo hero for the scanner asset', async () => {
    mockUseLanguage.mockReturnValue(buildLanguageMock('fr'));
    mockUseTheme.mockReturnValue({
      colors: DARK_COLORS,
      isDark: true,
      toggleTheme: jest.fn(),
    });

    render(<PostSignupOnboardingScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-promo-slide-scanner')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-fallback-slide-scanner')).toBeNull();
  });

  it('passes the light theme through to the fridge fallback preview', async () => {
    mockGetOnboardingPromoAsset.mockImplementation((theme, slide) =>
      slide === 'fridge'
        ? null
        : mockActualOnboardingPromoAssets.getOnboardingPromoAsset(theme, slide),
    );

    render(<PostSignupOnboardingScreen />);

    fireEvent.press(await screen.findByText('Passer'));

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
    mockGetOnboardingPromoAsset.mockImplementation((theme, slide) =>
      slide === 'fridge'
        ? null
        : mockActualOnboardingPromoAssets.getOnboardingPromoAsset(theme, slide),
    );
    mockUseTheme.mockReturnValue({
      colors: DARK_COLORS,
      isDark: true,
      toggleTheme: jest.fn(),
    });

    render(<PostSignupOnboardingScreen />);

    fireEvent.press(await screen.findByText('Passer'));

    await waitFor(() => {
      expect(screen.getByTestId('post-signup-fallback-slide-fridge')).toBeTruthy();
    });

    expect(screen.queryByTestId('post-signup-promo-slide-fridge')).toBeNull();
    expect(screen.getByTestId('fridge-preview-theme').props.children).toBe('dark');
    expect(mockFridgeScanIllustration).toHaveBeenLastCalledWith(
      expect.objectContaining({ isDark: true }),
    );
  });

  it('completes onboarding from the final slide and clears the pending flag', async () => {
    render(<PostSignupOnboardingScreen />);

    fireEvent.press(await screen.findByText('Passer'));

    await waitFor(() => {
      expect(screen.getByText("Ouvrir l'app")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Ouvrir l'app"));

    await waitFor(() => {
      expect(mockMarkTutorialSeen).toHaveBeenCalledTimes(1);
      expect(mockClearPostSignupOnboardingPending).toHaveBeenCalledWith('user-123');
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });

    expect(mockMarkAutoPresentationStarted).not.toHaveBeenCalled();
  });
});
