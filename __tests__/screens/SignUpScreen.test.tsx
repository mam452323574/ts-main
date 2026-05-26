import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

import SignUpScreen from '@/screens/SignUpScreen';

jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
  Camera: 'Camera',
  Check: 'Check',
  Eye: 'Eye',
  EyeOff: 'EyeOff',
  ImagePlus: 'ImagePlus',
  Lock: 'Lock',
  Mail: 'Mail',
  Moon: 'Moon',
  Sun: 'Sun',
  UserRound: 'UserRound',
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

jest.mock('@/components/OAuthButton', () => ({
  OAuthButton: ({ provider, onPress, loading, disabled }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityState={{ disabled: disabled || loading }}
        testID={`oauth-${provider}-button`}
      >
        <Text>{loading ? 'Google loading' : 'Continuer avec Google'}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('@/components/ProfileAvatar', () => ({
  ProfileAvatar: ({ avatarUrl }: { avatarUrl?: string | null }) => {
    const { Text } = require('react-native');
    return <Text>{avatarUrl ? 'Avatar preview' : 'Avatar empty'}</Text>;
  },
}));

jest.mock('@/components/AvatarCropModal', () => ({
  AvatarCropModal: ({ visible, onConfirm }: any) => {
    if (!visible) {
      return null;
    }
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity
        testID="signup-avatar-crop-confirm"
        onPress={() =>
          onConfirm({ originX: 4, originY: 8, width: 300, height: 300 })
        }
      >
        <Text>Confirm crop</Text>
      </TouchableOpacity>
    );
  },
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
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
      white: '#fff',
    },
    theme: 'dark',
    isDark: true,
    setTheme: mockSetTheme,
    toggleTheme: jest.fn(),
  }),
}));

const mockSignUp = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockSendVerificationEmail = jest.fn();
const mockIsDisposableEmail = jest.fn();
const mockCreatePreparedAvatarLocalUri = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
    sendVerificationEmail: mockSendVerificationEmail,
    isDisposableEmail: mockIsDisposableEmail,
  }),
}));

jest.mock('@/services/avatar', () => ({
  createPreparedAvatarLocalUri: (...args: unknown[]) =>
    mockCreatePreparedAvatarLocalUri(...args),
}));

async function startSignup() {
  fireEvent.press(await screen.findByText('Commencer'));
  await screen.findByText('Comment doit-on vous appeler ?');
}

async function reachAvatar() {
  await startSignup();
  fireEvent.changeText(screen.getByTestId('signup-username-input'), 'testuser');
  fireEvent.press(screen.getByText('Suivant'));
  await screen.findByText('Ajoutez une photo de profil');
}

async function reachAppearance() {
  await reachAvatar();
  fireEvent.press(screen.getByTestId('signup-avatar-skip'));
  await screen.findByText('Apparence');
}

async function reachAccountMethod() {
  await reachAppearance();
  fireEvent.press(screen.getByText('Suivant'));
  await screen.findByText('Sauvegardez votre profil');
}

async function reachEmailCredentials() {
  await reachAccountMethod();
  fireEvent.press(screen.getByText("S'inscrire avec email"));
  await screen.findByPlaceholderText('Votre email');
}

describe('SignUpScreen mobile-first flow', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSignUp.mockResolvedValue({ userId: 'user-123', email: 'test@example.com' });
    mockSignInWithGoogle.mockResolvedValue(undefined);
    mockSendVerificationEmail.mockResolvedValue(undefined);
    mockIsDisposableEmail.mockResolvedValue(false);
    mockCreatePreparedAvatarLocalUri.mockResolvedValue('file:///cropped-avatar.jpg');
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///wide-avatar.jpg', width: 1600, height: 900 }],
    });
  });

  it('opens with one primary intro action and a returning-user route', async () => {
    render(<SignUpScreen />);

    expect(await screen.findByText('Votre premier scan commence ici')).toBeTruthy();
    expect(
      screen.getByText(
        'Choisissez un pseudo et une apparence, puis rattachez votre profil avec Google ou email.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('signup-username-input')).toBeNull();

    fireEvent.press(screen.getByText("J'ai déjà un compte / Récupérer mon compte"));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('keeps pseudo, photo, appearance, method and email on distinct pages', async () => {
    render(<SignUpScreen />);
    await startSignup();

    expect(screen.getByTestId('signup-username-input')).toBeTruthy();
    expect(screen.queryByText('Apparence')).toBeNull();

    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'Friendly User!');
    expect(screen.getByTestId('signup-username-input').props.value).toBe('friendlyuser');
    fireEvent.press(screen.getByText('Suivant'));

    expect(await screen.findByText('Ajoutez une photo de profil')).toBeTruthy();
    expect(screen.queryByText('Sombre')).toBeNull();
    fireEvent.press(screen.getByTestId('signup-avatar-skip'));

    expect(await screen.findByText('Apparence')).toBeTruthy();
    expect(screen.getByText('Clair')).toBeTruthy();
    expect(screen.getByText('Sombre')).toBeTruthy();
    fireEvent.press(screen.getByText('Suivant'));

    expect(await screen.findByText('Sauvegardez votre profil')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Votre email')).toBeNull();
    fireEvent.press(screen.getByText("S'inscrire avec email"));

    expect(await screen.findByPlaceholderText('Votre email')).toBeTruthy();
  });

  it('uses keyboard adjustment only after entering a text step', async () => {
    const originalOS = ReactNative.Platform.OS;
    Object.defineProperty(ReactNative.Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    try {
      render(<SignUpScreen />);
      await screen.findByText('Commencer');
      expect(screen.UNSAFE_queryByType(ReactNative.KeyboardAvoidingView)).toBeNull();

      await startSignup();
      expect(screen.UNSAFE_getByType(ReactNative.KeyboardAvoidingView).props.behavior).toBe(
        'height',
      );
      expect(screen.UNSAFE_getByType(ReactNative.ScrollView).props.bounces).toBe(false);
    } finally {
      Object.defineProperty(ReactNative.Platform, 'OS', {
        value: originalOS,
        configurable: true,
      });
    }
  });

  it('crops an optional avatar before moving on', async () => {
    render(<SignUpScreen />);
    await reachAvatar();

    fireEvent.press(screen.getByTestId('signup-avatar-library'));
    fireEvent.press(await screen.findByTestId('signup-avatar-crop-confirm'));

    await waitFor(() => {
      expect(mockCreatePreparedAvatarLocalUri).toHaveBeenCalledWith(
        'file:///wide-avatar.jpg',
        { originX: 4, originY: 8, width: 300, height: 300 },
      );
      expect(screen.getByText('Avatar preview')).toBeTruthy();
    });
  });

  it('offers Google only after profile setup and stores no password for email signup', async () => {
    render(<SignUpScreen />);
    expect(screen.queryByText('Continuer avec Google')).toBeNull();
    await reachAccountMethod();

    fireEvent.press(screen.getByTestId('oauth-google-button'));
    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByText("S'inscrire avec email"));
    fireEvent.changeText(await screen.findByPlaceholderText('Votre email'), 'test@example.com');
    fireEvent.changeText(
      screen.getByPlaceholderText('Mot de passe (8+ car., minuscule + chiffre)'),
      'StrongerPass42!',
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Confirmez le mot de passe'),
      'StrongerPass42!',
    );
    fireEvent.press(screen.getByText("S'inscrire"));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'StrongerPass42!');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/email-verification',
        params: {
          email: 'test@example.com',
          userId: 'user-123',
          type: 'signup',
        },
      });
    });

    const stored = (
      await Promise.all(
        (await AsyncStorage.getAllKeys()).map((key) => AsyncStorage.getItem(key)),
      )
    ).join(' ');
    expect(stored).not.toContain('StrongerPass42!');
    expect(stored).toContain('"completionIntent":"signup-email"');
    expect(stored).toContain('"createdUserId":"user-123"');
  });

  it('clears Google completion intent when OAuth does not complete', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(new Error('cancelled'));
    render(<SignUpScreen />);
    await reachAccountMethod();

    fireEvent.press(screen.getByTestId('oauth-google-button'));

    await waitFor(async () => {
      const stored = await AsyncStorage.getItem('pre_auth_onboarding_draft_v1');
      expect(stored).toContain('"completionIntent":null');
    });
  });

  it('keeps email validation and verification fallback behavior', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSendVerificationEmail.mockRejectedValueOnce(new Error('send failed'));
    render(<SignUpScreen />);
    await reachEmailCredentials();

    fireEvent.changeText(screen.getByPlaceholderText('Votre email'), 'test@example.com');
    fireEvent.changeText(
      screen.getByPlaceholderText('Mot de passe (8+ car., minuscule + chiffre)'),
      'longenough',
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Confirmez le mot de passe'),
      'longenough',
    );
    fireEvent.press(screen.getByText("S'inscrire"));
    expect(
      await screen.findByText(
        'Le mot de passe doit faire au moins 8 caractères et contenir une minuscule et un chiffre',
      ),
    ).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText('Mot de passe (8+ car., minuscule + chiffre)'),
      'StrongerPass42!',
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Confirmez le mot de passe'),
      'StrongerPass42!',
    );
    fireEvent.press(screen.getByText("S'inscrire"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/email-verification',
        params: {
          email: 'test@example.com',
          userId: 'user-123',
          type: 'signup',
          initialSendFailed: 'true',
        },
      });
    });
    consoleSpy.mockRestore();
  });
});
