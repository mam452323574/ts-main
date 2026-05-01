import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';

// Mock expo-router
const mockReplace = jest.fn();
const mockUseRootNavigationState = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: jest.fn().mockReturnValue([]),
  useRootNavigationState: () => mockUseRootNavigationState(),
}));

const mockShowAlert = jest.fn();
const mockAlertElement = 'AlertElement';
jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    showAlert: mockShowAlert,
    alertElement: mockAlertElement,
  }),
}));

const mockUsePostSignupOnboardingPending = jest.fn();
jest.mock('@/hooks/usePostSignupOnboardingPending', () => ({
  usePostSignupOnboardingPending: () => mockUsePostSignupOnboardingPending(),
}));

// Mock route helpers
jest.mock('@/constants/routes', () => ({
  isPublicRoute: jest.fn((segment: string) => ['login', 'signup'].includes(segment)),
  isSharedRoute: jest.fn((segment: string) => segment === 'privacy-policy'),
  isEmailVerificationRoute: jest.fn((segment: string) => segment === 'email-verification'),
  isProfileSetupRoute: jest.fn((segment: string) => segment === 'username-setup'),
  isPostSignupOnboardingRoute: jest.fn(
    (segment: string) => segment === 'post-signup-onboarding'
  ),
  isProtectedRoute: jest.fn(
    (segment: string) =>
      ['(tabs)', 'recipes', 'exercises', 'post-signup-onboarding'].includes(
        segment
      )
  ),
  isAdminRoute: jest.fn(
    (segment: string) => segment === 'admin-social-moderation'
  ),
  isPremiumRoute: jest.fn((segment: string) =>
    [
      'coach',
      'coach-history',
      'super-scan-result',
      'recipes',
      'exercises',
      'entry-offer',
    ].includes(segment),
  ),
  isSpecialRoute: jest.fn((segment: string) => segment === 'premium-upgrade'),
}));

// Mock useAuth
const mockSignOut = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowAlert.mockClear();
    mockUsePostSignupOnboardingPending.mockReturnValue({
      isPending: false,
      isLoading: false,
      refresh: jest.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: null,
      userProfile: null,
      loading: false,
      isEmailVerified: false,
      signOut: mockSignOut,
    });
    // Default: router is ready
    mockUseRootNavigationState.mockReturnValue({ key: 'root-key' });
  });

  it('returns isLoading from auth context', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      userProfile: null,
      loading: true,
      isEmailVerified: false,
      signOut: mockSignOut,
    });

    const { result } = renderHook(() => useProtectedRoute());
    
    expect(result.current.isLoading).toBe(true);
  });

  it('returns isLoopDetected as false initially', () => {
    const { result } = renderHook(() => useProtectedRoute());
    
    expect(result.current.isLoopDetected).toBe(false);
  });

  it('does not redirect when loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      userProfile: null,
      loading: true,
      isEmailVerified: false,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());
    
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to /login when user is not authenticated', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['some-protected-route']);
    
    mockUseAuth.mockReturnValue({
      user: null,
      userProfile: null,
      loading: false,
      isEmailVerified: false,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());
    
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('does not redirect when on login page and not authenticated', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['login']);
    
    mockUseAuth.mockReturnValue({
      user: null,
      userProfile: null,
      loading: false,
      isEmailVerified: false,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect when on privacy-policy page and not authenticated', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['privacy-policy']);

    mockUseAuth.mockReturnValue({
      user: null,
      userProfile: null,
      loading: false,
      isEmailVerified: false,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to email-verification when user has profile but email not verified', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['some-route']);
    
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: { id: 'user-123', username: null },
      loading: false,
      isEmailVerified: false,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());
    
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/email-verification',
        params: {
          email: 'test@example.com',
          userId: 'user-123',
          type: 'signup',
        },
      });
    });
  });

  it('redirects to username-setup when email verified but no username', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['some-route']);
    
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: { id: 'user-123', username: null },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());
    
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/username-setup');
    });
  });

  it('does not redirect to email-verification when privacy-policy is opened before verification', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['privacy-policy']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: { id: 'user-123', username: null },
      loading: false,
      isEmailVerified: false,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect to username-setup when privacy-policy is opened before profile completion', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['privacy-policy']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: { id: 'user-123', username: null },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to (tabs) when fully authenticated on public route', async () => {
    const { useSegments } = require('expo-router');
    // Use a public route (login) to trigger the redirect to (tabs)
    useSegments.mockReturnValue(['login']);
    
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: { id: 'user-123', username: 'testuser' },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());
    
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('does not redirect to (tabs) when fully authenticated on privacy-policy', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['privacy-policy']);

    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: { id: 'user-123', username: 'testuser' },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect when already on protected route', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['(tabs)']);
    
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: { id: 'user-123', username: 'testuser' },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());
    
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to post-signup-onboarding when pending onboarding exists', async () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['(tabs)']);
    mockUsePostSignupOnboardingPending.mockReturnValue({
      isPending: true,
      isLoading: false,
      refresh: jest.fn(),
    });

    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        has_seen_tutorial: false,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/post-signup-onboarding');
    });
  });

  it('does not redirect away when already on post-signup-onboarding', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['post-signup-onboarding']);
    mockUsePostSignupOnboardingPending.mockReturnValue({
      isPending: true,
      isLoading: false,
      refresh: jest.fn(),
    });

    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        has_seen_tutorial: false,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect away from privacy-policy when post-signup onboarding is pending', () => {
    const { useSegments } = require('expo-router');
    useSegments.mockReturnValue(['privacy-policy']);
    mockUsePostSignupOnboardingPending.mockReturnValue({
      isPending: true,
      isLoading: false,
      refresh: jest.fn(),
    });

    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
      userProfile: {
        id: 'user-123',
        username: 'testuser',
        has_seen_tutorial: false,
      },
      loading: false,
      isEmailVerified: true,
      signOut: mockSignOut,
    });

    renderHook(() => useProtectedRoute());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders without crashing', () => {
    expect(() => {
      renderHook(() => useProtectedRoute());
    }).not.toThrow();
  });

  describe('router readiness', () => {
    it('does not redirect when router is not ready', () => {
      mockUseRootNavigationState.mockReturnValue({ key: null });
      
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['some-route']);
      
      mockUseAuth.mockReturnValue({
        user: null,
        userProfile: null,
        loading: false,
        isEmailVerified: false,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());
      
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not redirect when navigation state is undefined', () => {
      mockUseRootNavigationState.mockReturnValue(undefined);
      
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['protected-route']);
      
      mockUseAuth.mockReturnValue({
        user: null,
        userProfile: null,
        loading: false,
        isEmailVerified: false,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());
      
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('special routes', () => {
    it('does not redirect on +not-found route', () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['+not-found']);
      
      mockUseAuth.mockReturnValue({
        user: null,
        userProfile: null,
        loading: false,
        isEmailVerified: false,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());
      
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('redirects to login on index route when unauthenticated', async () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['index']);
      
      mockUseAuth.mockReturnValue({
        user: null,
        userProfile: null,
        loading: false,
        isEmailVerified: false,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/login');
      });
    });

    it('redirects to login on empty segment when unauthenticated', async () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['']);
      
      mockUseAuth.mockReturnValue({
        user: null,
        userProfile: null,
        loading: false,
        isEmailVerified: false,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/login');
      });
    });

    it('redirects to tabs on empty segment when fully authenticated', async () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['']);

      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        userProfile: { id: 'user-123', username: 'testuser' },
        loading: false,
        isEmailVerified: true,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
      });
    });
  });

  describe('loop detection', () => {
    it('returns isLoopDetected as false initially', () => {
      const { result } = renderHook(() => useProtectedRoute());
      
      expect(result.current.isLoopDetected).toBe(false);
    });

    it('does not trigger loop detection for normal navigation', async () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['(tabs)']);
      
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        userProfile: { id: 'user-123', username: 'testuser' },
        loading: false,
        isEmailVerified: true,
        signOut: mockSignOut,
      });

      const { result } = renderHook(() => useProtectedRoute());
      
      await waitFor(() => {
        expect(result.current.isLoopDetected).toBe(false);
      });
      
      expect(mockShowAlert).not.toHaveBeenCalled();
    });

    it('does not show loop alert when navigating to different route types', async () => {
      const { useSegments } = require('expo-router');
      
      // Start on public route
      useSegments.mockReturnValue(['login']);
      mockUseAuth.mockReturnValue({
        user: null,
        userProfile: null,
        loading: false,
        isEmailVerified: false,
        signOut: mockSignOut,
      });

      const { result, rerender } = renderHook(() => useProtectedRoute());
      
      // Simulate user logging in - should redirect to protected route
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        userProfile: { id: 'user-123', username: 'testuser' },
        loading: false,
        isEmailVerified: true,
        signOut: mockSignOut,
      });
      
      rerender({});
      
      await waitFor(() => {
        expect(result.current.isLoopDetected).toBe(false);
      });
    });

    it('handles forceLogout state correctly', async () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['some-route']);
      
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        userProfile: { id: 'user-123', username: 'testuser' },
        loading: false,
        isEmailVerified: true,
        signOut: mockSignOut.mockResolvedValue(undefined),
      });

      renderHook(() => useProtectedRoute());
      
      // The hook should not enter emergency logout state under normal conditions
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('resets loop detection when reaching stable route', async () => {
      const { useSegments } = require('expo-router');
      
      // Simulate reaching a protected route
      useSegments.mockReturnValue(['(tabs)']);
      
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        userProfile: { id: 'user-123', username: 'testuser' },
        loading: false,
        isEmailVerified: true,
        signOut: mockSignOut,
      });

      const { result } = renderHook(() => useProtectedRoute());
      
      // Wait for any potential state changes
      await waitFor(() => {
        expect(result.current.isLoopDetected).toBe(false);
      });
      
      // No redirect should happen since we're already on a protected route
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('exposes the shared alert element used by navigation safeguards', () => {
      const { result } = renderHook(() => useProtectedRoute());

      expect(result.current.alertElement).toBe(mockAlertElement);
    });
  });

  describe('authentication flow', () => {
    it('does not redirect on email-verification route when email not verified', () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['email-verification']);
      
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        userProfile: { id: 'user-123', username: null },
        loading: false,
        isEmailVerified: false,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());
      
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not redirect on username-setup route when setting up profile', () => {
      const { useSegments } = require('expo-router');
      useSegments.mockReturnValue(['username-setup']);
      
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        userProfile: { id: 'user-123', username: null },
        loading: false,
        isEmailVerified: true,
        signOut: mockSignOut,
      });

      renderHook(() => useProtectedRoute());
      
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
