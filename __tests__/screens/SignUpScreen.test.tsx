import React from 'react';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import * as mockReactNative from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import SignUpScreen from '@/screens/SignUpScreen';
import { SPACING } from '@/constants/theme';

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
  Button: ({ title, onPress, loading, disabled }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled || loading}>
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
  AvatarCropModal: ({ visible, onConfirm, onCancel }: any) => {
    if (!visible) {
      return null;
    }

    const React = require('react');
    const { Text, TouchableOpacity, View } = require('react-native');

    return (
      <View testID="signup-avatar-crop-modal">
        <TouchableOpacity
          testID="signup-avatar-crop-confirm"
          onPress={() =>
            onConfirm({
              originX: 4,
              originY: 8,
              width: 300,
              height: 300,
            })
          }
        >
          <Text>Confirm crop</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="signup-avatar-crop-cancel" onPress={onCancel}>
          <Text>Cancel crop</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const originalPlatform = mockReactNative.Platform.OS;
const reactNativeModule =
  jest.requireActual<typeof import('react-native')>('react-native');
const useWindowDimensionsSpy = jest.spyOn(
  reactNativeModule,
  'useWindowDimensions',
);
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
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
      lightGray: '#eee',
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
const passwordPlaceholder = 'Mot de passe (8+ car., minuscule + chiffre)';
const confirmPasswordPlaceholder = 'Confirmez le mot de passe';
const signUpButtonLabel = "S'inscrire";

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

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

describe('SignUpScreen friendly flow', () => {
  beforeEach(async () => {
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

  it('starts on the intro step', async () => {
    render(<SignUpScreen />);

    expect(
      await screen.findByText('Votre premier scan commence ici'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Choisissez un pseudo, une apparence, puis confirmez votre email. Encore une étape avant votre premier scan.',
      ),
    ).toBeTruthy();
  });

  it('uses compact Android auth-shell spacing and keyboard height avoidance', async () => {
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

    render(<SignUpScreen />);

    const keyboardShell = screen.UNSAFE_getByType(
      mockReactNative.KeyboardAvoidingView,
    );
    await screen.findByTestId('auth-shell-content');
    const contentStyle = mockReactNative.StyleSheet.flatten(
      screen.getByTestId('auth-shell-content').props.style,
    );

    expect(keyboardShell.props.behavior).toBe('height');
    expect(contentStyle).toEqual(
      expect.objectContaining({
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.xxl + SPACING.md,
        paddingBottom: SPACING.sm + SPACING.lg,
        gap: SPACING.lg,
        justifyContent: 'flex-start',
      }),
    );
  });

  it('moves through profile setup and avatar skip before showing account fields', async () => {
    render(<SignUpScreen />);

    fireEvent.press(await screen.findByText('Suivant'));
    expect(await screen.findByText('Préparez votre profil de scan')).toBeTruthy();
    expect(screen.getByText('Sombre')).toBeTruthy();
    expect(screen.getByText('Clair')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'Friendly User!');
    expect(screen.getByTestId('signup-username-input').props.value).toBe('friendlyuser');
    expect(await screen.findByText('Pseudo prêt')).toBeTruthy();

    fireEvent.press(screen.getByTestId('signup-avatar-skip'));
    fireEvent.press(screen.getByText('Suivant'));
    expect(await screen.findByText('Créez votre compte')).toBeTruthy();
    expect(screen.getByPlaceholderText('Votre email')).toBeTruthy();
    expect(screen.getByPlaceholderText(passwordPlaceholder)).toBeTruthy();
  });

  it('shows Google only on the account step and starts Google signup', async () => {
    render(<SignUpScreen />);

    expect(screen.queryByText('Continuer avec Google')).toBeNull();

    fireEvent.press(await screen.findByText('Suivant'));
    expect(await screen.findByText('Préparez votre profil de scan')).toBeTruthy();
    expect(screen.queryByText('Continuer avec Google')).toBeNull();

    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'testuser');
    fireEvent.press(screen.getByText('Suivant'));

    expect(await screen.findByText('Continuer avec Google')).toBeTruthy();
    fireEvent.press(screen.getByTestId('oauth-google-button'));

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    });
  });

  it('disables Google signup while it is loading', async () => {
    const deferred = createDeferred<void>();
    mockSignInWithGoogle.mockReturnValueOnce(deferred.promise);

    render(<SignUpScreen />);

    fireEvent.press(await screen.findByText('Suivant'));
    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'testuser');
    fireEvent.press(screen.getByText('Suivant'));
    fireEvent.press(await screen.findByTestId('oauth-google-button'));

    expect(await screen.findByText('Google loading')).toBeTruthy();
    expect(
      screen.getByTestId('oauth-google-button').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
  });

  it('creates the account only on the account step and never stores the password', async () => {
    render(<SignUpScreen />);

    fireEvent.press(await screen.findByText('Suivant'));
    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'testuser');
    fireEvent.press(screen.getByText('Suivant'));

    fireEvent.changeText(await screen.findByPlaceholderText('Votre email'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText(passwordPlaceholder), 'StrongerPass42!');
    fireEvent.changeText(screen.getByPlaceholderText(confirmPasswordPlaceholder), 'StrongerPass42!');
    fireEvent.press(screen.getByText(signUpButtonLabel));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'StrongerPass42!');
      expect(mockSendVerificationEmail).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/email-verification',
        params: {
          email: 'test@example.com',
          userId: 'user-123',
          type: 'signup',
        },
      });
    });

    const storedKeys = await AsyncStorage.getAllKeys();
    const storedValues = (
      await Promise.all(storedKeys.map((key) => AsyncStorage.getItem(key)))
    ).join(' ');
    expect(storedValues).not.toContain('StrongerPass42!');
  });

  it('blocks passwords that would be rejected by secure-signup', async () => {
    render(<SignUpScreen />);

    fireEvent.press(await screen.findByText('Suivant'));
    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'testuser');
    fireEvent.press(screen.getByText('Suivant'));

    fireEvent.changeText(await screen.findByPlaceholderText('Votre email'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText(passwordPlaceholder), 'longenough');
    fireEvent.changeText(screen.getByPlaceholderText(confirmPasswordPlaceholder), 'longenough');
    fireEvent.press(screen.getByText(signUpButtonLabel));

    expect(
      await screen.findByText(
        'Le mot de passe doit faire au moins 8 caractères et contenir une minuscule et un chiffre',
      ),
    ).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('continues to verification when the initial email send fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSendVerificationEmail.mockRejectedValueOnce(new Error('resend failed'));

    render(<SignUpScreen />);

    fireEvent.press(await screen.findByText('Suivant'));
    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'testuser');
    fireEvent.press(screen.getByText('Suivant'));

    fireEvent.changeText(await screen.findByPlaceholderText('Votre email'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText(passwordPlaceholder), 'StrongerPass42!');
    fireEvent.changeText(screen.getByPlaceholderText(confirmPasswordPlaceholder), 'StrongerPass42!');
    fireEvent.press(screen.getByText(signUpButtonLabel));

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

  it('crops the pre-auth avatar before saving it in the draft', async () => {
    render(<SignUpScreen />);

    fireEvent.press(await screen.findByText('Suivant'));
    fireEvent.changeText(screen.getByTestId('signup-username-input'), 'testuser');
    fireEvent.press(await screen.findByTestId('signup-avatar-library'));
    fireEvent.press(await screen.findByTestId('signup-avatar-crop-confirm'));

    await waitFor(() => {
      expect(mockCreatePreparedAvatarLocalUri).toHaveBeenCalledWith(
        'file:///wide-avatar.jpg',
        {
          originX: 4,
          originY: 8,
          width: 300,
          height: 300,
        },
      );
      expect(screen.getByText('Avatar preview')).toBeTruthy();
    });

    const draft = JSON.parse(
      (await AsyncStorage.getItem('pre_auth_onboarding_draft_v1')) ?? '{}',
    );
    expect(draft.avatarLocalUri).toBe('file:///cropped-avatar.jpg');
    expect(draft.avatarSkipped).toBe(false);
  });

  it('keeps the existing login link behavior', async () => {
    render(<SignUpScreen />);

    const loginText = await screen.findByText(/Déjà un compte/);
    fireEvent.press(loginText.parent!);

    expect(mockBack).toHaveBeenCalled();
  });
});
