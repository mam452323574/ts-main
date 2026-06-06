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
    (segment: string) => segment === 'email-verification',
  ),
  isProfileSetupRoute: jest.fn((segment: string) => segment === 'username-setup'),
  isPostSignupOnboardingRoute: jest.fn(
    (segment: string) => segment === 'post-signup-onboarding',
  ),
  isProtectedRoute: jest.fn((segment: string) =>
    ['(tabs)', 'coach', 'coach-history', 'super-scan-result', 'recipes', 'exercises', 'entry-offer'].includes(segment),
  ),
  isAdminRoute: jest.fn(() => false),
  isPremiumRoute: jest.fn((segment: string) =>
    ['coach-history', 'super-scan-result', 'recipes', 'exercises', 'entry-offer'].includes(segment),
  ),
  isSpecialRoute: jest.fn((segment: string) => segment === 'premium-upgrade'),
}));

const mockSignOut = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useProtectedRoute — premium gate (P2-D)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirige un utilisateur free vers /premium-upgrade quand il visite une route premium', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach-history']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'free@example.com' },
      userProfile: {
        id: 'user-1',
        username: 'free',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/premium-upgrade');
    });
  });

  it('laisse un utilisateur premium accéder à une route premium', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach-history']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-2', email: 'premium@example.com' },
      userProfile: {
        id: 'user-2',
        username: 'premium',
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

  it('laisse un admin accéder aux routes premium (super-set des privilèges)', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['super-scan-result']);

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

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("ne redirige pas un utilisateur free hors d'une route premium", () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['(tabs)']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-3', email: 'free2@example.com' },
      userProfile: {
        id: 'user-3',
        username: 'free2',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('laisse un utilisateur free accéder à /coach pour les usages gratuits', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-4', email: 'free-coach@example.com' },
      userProfile: {
        id: 'user-4',
        username: 'free_coach',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('laisse un utilisateur free accéder à /coach/chat pour Noah', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach', 'chat']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-5', email: 'free-chat@example.com' },
      userProfile: {
        id: 'user-5',
        username: 'free_chat',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('laisse un utilisateur free accéder à /coach/conversations', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach', 'conversations']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-inbox', email: 'free-inbox@example.com' },
      userProfile: {
        id: 'user-inbox',
        username: 'free_inbox',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each([
    ['super-scan-result'],
    ['recipes'],
    ['exercises'],
    ['entry-offer'],
  ])(
    'redirige un free vers /premium-upgrade quand il visite la route premium %s',
    async (premiumSegment) => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue([premiumSegment]);

      mockUseAuth.mockReturnValue({
        user: { id: `user-${premiumSegment}`, email: 'free@example.com' },
        userProfile: {
          id: `user-${premiumSegment}`,
          username: 'free',
          account_tier: 'free',
          has_seen_tutorial: true,
        },
        loading: false,
        isEmailVerified: true,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/premium-upgrade');
      });
    },
  );

  it('laisse un premium accéder à /coach', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-premium-coach', email: 'premium@example.com' },
      userProfile: {
        id: 'user-premium-coach',
        username: 'premium_coach',
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

  it('laisse un premium accéder à /coach/chat', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach', 'chat']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-premium-chat', email: 'premium@example.com' },
      userProfile: {
        id: 'user-premium-chat',
        username: 'premium_chat',
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

  it('bloque un free sur coach-history même si /coach reste accessible', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['coach-history']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-coach-history', email: 'free@example.com' },
      userProfile: {
        id: 'user-coach-history',
        username: 'free_history',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/premium-upgrade');
    });
  });
});
