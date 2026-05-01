import { renderHook, waitFor } from '@testing-library/react-native';

import { useProtectedRoute } from '@/hooks/useProtectedRoute';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: jest.fn().mockReturnValue([]),
  useRootNavigationState: () => ({ key: 'root-key' }),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: jest.fn(),
    alertElement: null,
  }),
}));

jest.mock('@/hooks/usePostSignupOnboardingPending', () => ({
  usePostSignupOnboardingPending: () => ({
    isPending: false,
    isLoading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/constants/routes', () => ({
  isPublicRoute: jest.fn((segment: string) => ['login', 'signup'].includes(segment)),
  isSharedRoute: jest.fn((segment: string) => segment === 'privacy-policy'),
  isEmailVerificationRoute: jest.fn(
    (segment: string) => segment === 'email-verification'
  ),
  isProfileSetupRoute: jest.fn((segment: string) => segment === 'username-setup'),
  isPostSignupOnboardingRoute: jest.fn(
    (segment: string) => segment === 'post-signup-onboarding'
  ),
  isProtectedRoute: jest.fn((segment: string) =>
    ['(tabs)', 'admin-social-moderation'].includes(segment)
  ),
  isAdminRoute: jest.fn(
    (segment: string) => segment === 'admin-social-moderation'
  ),
  isPremiumRoute: jest.fn(() => false),
  isSpecialRoute: jest.fn((segment: string) => segment === 'premium-upgrade'),
}));

const mockSignOut = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useProtectedRoute — admin gate (P1-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirige vers /(tabs) quand un user non-admin tente d\'accéder à admin-social-moderation', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['admin-social-moderation']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com' },
      userProfile: {
        id: 'user-1',
        username: 'user',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('laisse un admin accéder à admin-social-moderation', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['admin-social-moderation']);

    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', email: 'admin@example.com' },
      userProfile: {
        id: 'admin-1',
        username: 'admin',
        account_tier: 'admin',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    // Aucune redirection ne doit être déclenchée pour un admin sur la page admin
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
  });

  it('ne redirige pas un user premium hors d\'une route non-admin', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['(tabs)']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-2', email: 'user2@example.com' },
      userProfile: {
        id: 'user-2',
        username: 'user2',
        account_tier: 'premium',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
