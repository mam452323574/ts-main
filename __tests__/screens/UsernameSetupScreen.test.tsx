import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import UsernameSetupScreen from '@/screens/UsernameSetupScreen';
import { updatePreAuthOnboardingDraft } from '@/utils/preAuthOnboarding';

jest.mock('lucide-react-native', () => ({
  AlertCircle: 'AlertCircle',
  ArrowLeft: 'ArrowLeft',
  Check: 'Check',
  UserRound: 'UserRound',
  X: 'X',
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, loading, disabled, testID }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        testID={testID}
      >
        <Text>{loading ? 'Loading...' : title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('@/components/ProfileAvatar', () => ({
  ProfileAvatar: ({ avatarUrl }: { avatarUrl?: string | null }) => {
    const { Text } = require('react-native');
    return <Text>{avatarUrl ? 'Draft avatar' : 'No avatar'}</Text>;
  },
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = jest.fn();
const mockCheckUsernameAvailability = jest.fn();
const mockPersistUsername = jest.fn();
const mockCompleteSignUp = jest.fn();
const mockRefreshUserProfile = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSetTheme = jest.fn();
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      cardBackground: '#fff',
      primary: 'blue',
      gray: 'gray',
      error: 'red',
      success: 'green',
      primaryText: 'black',
    },
    setTheme: mockSetTheme,
  }),
}));

const mockUploadAvatar = jest.fn();
jest.mock('@/services/avatar', () => ({
  uploadAvatarFromLocalUri: (...args: unknown[]) => mockUploadAvatar(...args),
}));

const mockMarkPending = jest.fn();
jest.mock('@/utils/postSignupOnboarding', () => ({
  markPostSignupOnboardingPending: (...args: unknown[]) => mockMarkPending(...args),
}));

async function waitForReadyScreen() {
  expect(await screen.findByText('Finalisez votre profil')).toBeTruthy();
}

async function makeUsernameAvailable(username = 'friendly') {
  fireEvent.changeText(screen.getByTestId('username-setup-input'), username);
  await act(async () => {
    jest.advanceTimersByTime(350);
    await Promise.resolve();
  });
  await waitFor(() => expect(mockCheckUsernameAvailability).toHaveBeenCalledWith(username));
}

describe('UsernameSetupScreen authenticated resume', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    await AsyncStorage.clear();
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com', app_metadata: {} },
      userProfile: null,
      isEmailVerified: true,
      checkUsernameAvailability: mockCheckUsernameAvailability,
      setUsername: mockPersistUsername,
      completeSignUp: mockCompleteSignUp,
      refreshUserProfile: mockRefreshUserProfile,
    });
    mockCheckUsernameAvailability.mockResolvedValue(true);
    mockPersistUsername.mockResolvedValue(undefined);
    mockCompleteSignUp.mockResolvedValue(undefined);
    mockRefreshUserProfile.mockResolvedValue(undefined);
    mockUploadAvatar.mockResolvedValue({ avatarReference: 'user-123/avatar.jpg' });
    mockMarkPending.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps fallback completion to one username intention', async () => {
    render(<UsernameSetupScreen />);
    await waitForReadyScreen();

    expect(screen.getByTestId('username-setup-input')).toBeTruthy();
    expect(screen.queryByText('Choisissez votre style')).toBeNull();
    expect(screen.getByText('Finaliser mon profil')).toBeTruthy();
  });

  it('restores and applies a signup draft for a new Google account', async () => {
    await updatePreAuthOnboardingDraft({
      username: 'draftuser',
      avatarLocalUri: 'file:///draft-avatar.jpg',
      selectedTheme: 'light',
      completionIntent: 'signup-google',
      lastStep: 'accountMethod',
    });
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        app_metadata: { provider: 'google' },
      },
      userProfile: null,
      isEmailVerified: true,
      checkUsernameAvailability: mockCheckUsernameAvailability,
      setUsername: mockPersistUsername,
      completeSignUp: mockCompleteSignUp,
      refreshUserProfile: mockRefreshUserProfile,
    });

    render(<UsernameSetupScreen />);
    await waitForReadyScreen();
    expect(screen.queryByTestId('username-setup-input')).toBeNull();
    expect(screen.getByText('Draft avatar')).toBeTruthy();
    expect(mockSetTheme).toHaveBeenCalledWith('light');

    await waitFor(() => {
      expect(mockUploadAvatar).toHaveBeenCalledWith('user-123', 'file:///draft-avatar.jpg');
      expect(mockPersistUsername).toHaveBeenCalledWith('draftuser', 'user-123/avatar.jpg');
      expect(mockCompleteSignUp).not.toHaveBeenCalled();
      expect(mockMarkPending).toHaveBeenCalledWith('user-123');
      expect(mockReplace).toHaveBeenCalledWith('/post-signup-onboarding');
    });
    expect(await AsyncStorage.getItem('pre_auth_onboarding_draft_v1')).toBeNull();
  });

  it('shows the correction field when a Google signup draft username was taken', async () => {
    await updatePreAuthOnboardingDraft({
      username: 'draftuser',
      completionIntent: 'signup-google',
      lastStep: 'accountMethod',
    });
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        app_metadata: { provider: 'google' },
      },
      userProfile: null,
      isEmailVerified: true,
      checkUsernameAvailability: mockCheckUsernameAvailability,
      setUsername: mockPersistUsername,
      completeSignUp: mockCompleteSignUp,
      refreshUserProfile: mockRefreshUserProfile,
    });
    mockCheckUsernameAvailability.mockResolvedValue(false);

    render(<UsernameSetupScreen />);

    expect(await screen.findByTestId('username-setup-input')).toBeTruthy();
    expect(screen.getByTestId('username-setup-input').props.value).toBe('draftuser');
    expect(mockPersistUsername).not.toHaveBeenCalled();
  });

  it('retains email profile completion for verified fallback users', async () => {
    render(<UsernameSetupScreen />);
    await waitForReadyScreen();
    await makeUsernameAvailable('emailuser');
    fireEvent.press(screen.getByText('Finaliser mon profil'));

    await waitFor(() => {
      expect(mockCompleteSignUp).toHaveBeenCalledWith('user-123', 'emailuser', undefined);
      expect(mockPersistUsername).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/post-signup-onboarding');
    });
  });

  it('lets an OAuth user continue without a draft photo if upload fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await updatePreAuthOnboardingDraft({
      username: 'draftuser',
      avatarLocalUri: 'file:///draft-avatar.jpg',
      completionIntent: 'signup-google',
      lastStep: 'accountMethod',
    });
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        app_metadata: { provider: 'google' },
      },
      userProfile: null,
      isEmailVerified: true,
      checkUsernameAvailability: mockCheckUsernameAvailability,
      setUsername: mockPersistUsername,
      completeSignUp: mockCompleteSignUp,
      refreshUserProfile: mockRefreshUserProfile,
    });
    mockUploadAvatar.mockRejectedValueOnce(new Error('upload failed'));

    render(<UsernameSetupScreen />);
    await waitForReadyScreen();
    expect(await screen.findByText('Continuer sans photo')).toBeTruthy();
    expect(screen.queryByTestId('username-setup-input')).toBeNull();
    fireEvent.press(screen.getByText('Continuer sans photo'));

    await waitFor(() => {
      expect(mockPersistUsername).toHaveBeenCalledWith('draftuser', undefined);
      expect(mockReplace).toHaveBeenCalledWith('/post-signup-onboarding');
    });
    consoleSpy.mockRestore();
  });
});
