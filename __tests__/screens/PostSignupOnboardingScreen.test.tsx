import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import PostSignupOnboardingScreen from '@/screens/PostSignupOnboardingScreen';

const mockReplace = jest.fn();
const mockMarkTutorialSeen = jest.fn();
const mockClearPending = jest.fn();
const mockEnsureGrowthExperience = jest.fn();
const mockShouldPresentEntryOffer = jest.fn();
const mockFetchRevenueCatCustomerInfo = jest.fn();
const mockHasPremiumEntitlement = jest.fn();
const mockMarkAutoPresentationStarted = jest.fn();
const mockUsePostSignupOnboardingPending = jest.fn();

jest.mock('lucide-react-native', () => ({
  Check: 'Check',
  ArrowLeft: 'ArrowLeft',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, disabled, loading }: any) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled || loading}>
        <Text>{loading ? 'Loading...' : title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#f8f8f7',
      cardBackground: '#ffffff',
      primary: '#28755d',
      primaryText: '#18201c',
      gray: '#68746f',
      error: '#b42318',
    },
    isDark: false,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'common.error': 'Erreur',
        'onboarding.final_title': 'Votre profil est prêt',
        'onboarding.final_subtitle': 'Tout est configuré.',
        'onboarding.profile_ready_label': 'Profil actif',
        'onboarding.enter_app': "Ouvrir l'app",
      } as Record<string, string>)[key] ?? key,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@example.com' },
    userProfile: {
      id: 'user-123',
      username: 'testuser',
      has_seen_tutorial: false,
      account_tier: 'free',
    },
    isEmailVerified: true,
    markTutorialSeen: mockMarkTutorialSeen,
  }),
}));

jest.mock('@/hooks/queries/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ data: { entry_offer_offering_id: 'entry-default' } }),
}));

jest.mock('@/hooks/queries/useGrowthExperience', () => ({
  useGrowthExperience: () => ({ data: null }),
}));

jest.mock('@/hooks/usePostSignupOnboardingPending', () => ({
  usePostSignupOnboardingPending: () => mockUsePostSignupOnboardingPending(),
}));

jest.mock('@/services/growthExperience', () => ({
  ensureGrowthExperience: (...args: unknown[]) => mockEnsureGrowthExperience(...args),
  shouldPresentEntryOffer: (...args: unknown[]) =>
    mockShouldPresentEntryOffer(...args),
}));

jest.mock('@/services/revenueCatOfferings', () => ({
  fetchRevenueCatCustomerInfo: (...args: unknown[]) =>
    mockFetchRevenueCatCustomerInfo(...args),
  hasPremiumEntitlement: (...args: unknown[]) =>
    mockHasPremiumEntitlement(...args),
}));

jest.mock('@/utils/postSignupOnboarding', () => ({
  clearPostSignupOnboardingPending: (...args: unknown[]) => mockClearPending(...args),
}));

jest.mock('@/utils/entryOfferSession', () => ({
  entryOfferSession: {
    markAutoPresentationStarted: (...args: unknown[]) =>
      mockMarkAutoPresentationStarted(...args),
  },
}));

describe('PostSignupOnboardingScreen finalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePostSignupOnboardingPending.mockReturnValue({
      isPending: true,
      isLoading: false,
    });
    mockMarkTutorialSeen.mockResolvedValue(undefined);
    mockClearPending.mockResolvedValue(undefined);
    mockEnsureGrowthExperience.mockResolvedValue({ experience: 'default' });
    mockShouldPresentEntryOffer.mockReturnValue(false);
    mockFetchRevenueCatCustomerInfo.mockResolvedValue({ entitlements: {} });
    mockHasPremiumEntitlement.mockReturnValue(false);
  });

  it('renders one sober confirmation screen without promotional slides or avatar prompts', async () => {
    render(<PostSignupOnboardingScreen />);

    expect(await screen.findByTestId('post-signup-finalization')).toBeTruthy();
    expect(screen.getByText('Votre profil est prêt')).toBeTruthy();
    expect(screen.getByText('@testuser')).toBeTruthy();
    expect(screen.queryByTestId('post-signup-slides-step')).toBeNull();
    expect(screen.queryByTestId('post-signup-social-avatar-prompt')).toBeNull();
  });

  it('marks setup complete and enters the existing app', async () => {
    render(<PostSignupOnboardingScreen />);
    fireEvent.press(await screen.findByText("Ouvrir l'app"));

    await waitFor(() => {
      expect(mockMarkTutorialSeen).toHaveBeenCalledTimes(1);
      expect(mockClearPending).toHaveBeenCalledWith('user-123');
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('preserves entry-offer routing when the existing decision requires it', async () => {
    mockShouldPresentEntryOffer.mockReturnValue(true);
    render(<PostSignupOnboardingScreen />);
    fireEvent.press(await screen.findByText("Ouvrir l'app"));

    await waitFor(() => {
      expect(mockMarkAutoPresentationStarted).toHaveBeenCalledWith('user-123');
      expect(mockReplace).toHaveBeenCalledWith('/entry-offer');
    });
  });
});
