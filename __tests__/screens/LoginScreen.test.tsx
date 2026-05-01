import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '@/screens/LoginScreen';

// Mock dependencies
jest.mock('lucide-react-native', () => ({
  Heart: 'Heart',
  Mail: 'Mail',
  Lock: 'Lock',
  Eye: 'Eye',
  EyeOff: 'EyeOff',
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, loading }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={loading} testID="login-button">
        <Text>{loading ? 'Loading...' : title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('@/components/OAuthButton', () => ({
  OAuthButton: () => null,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

const mockSignIn = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockSendVerificationEmail = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signInWithOAuth: mockSignInWithOAuth,
    sendVerificationEmail: mockSendVerificationEmail,
  }),
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({ nextStep: 'ready', userId: 'user-123' });
    mockSendVerificationEmail.mockResolvedValue(undefined);
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<LoginScreen />);
    
    expect(toJSON()).toBeTruthy();
  });

  it('displays app title', () => {
    render(<LoginScreen />);
    
    expect(screen.getByText('Health Scan')).toBeTruthy();
  });

  it('displays login subtitle', () => {
    render(<LoginScreen />);
    
    expect(screen.getByText('Connectez-vous à votre compte')).toBeTruthy();
  });

  it('displays email and password inputs', () => {
    render(<LoginScreen />);
    
    expect(screen.getByPlaceholderText('Votre email')).toBeTruthy();
    expect(screen.getByPlaceholderText('Votre mot de passe')).toBeTruthy();
  });

  it('displays login button', () => {
    render(<LoginScreen />);
    
    expect(screen.getByText('Se Connecter')).toBeTruthy();
  });

  it('displays signup link', () => {
    render(<LoginScreen />);
    
    expect(screen.getByText(/Pas de compte/)).toBeTruthy();
  });

  it('allows email input', () => {
    render(<LoginScreen />);
    
    const emailInput = screen.getByPlaceholderText('Votre email');
    fireEvent.changeText(emailInput, 'test@example.com');
    
    expect(emailInput.props.value).toBe('test@example.com');
  });

  it('allows password input', () => {
    render(<LoginScreen />);
    
    const passwordInput = screen.getByPlaceholderText('Votre mot de passe');
    fireEvent.changeText(passwordInput, 'password123');
    
    expect(passwordInput.props.value).toBe('password123');
  });

  it('shows error when submitting empty form', async () => {
    render(<LoginScreen />);
    
    fireEvent.press(screen.getByText('Se Connecter'));
    
    expect(await screen.findByText('Veuillez remplir tous les champs')).toBeTruthy();
  });

  it('navigates to signup when link is pressed', () => {
    render(<LoginScreen />);
    
    const signupText = screen.getByText(/Pas de compte/);
    fireEvent.press(signupText.parent!);
    
    expect(mockPush).toHaveBeenCalledWith('/signup');
  });

  it('keeps unverified users on verification when the resend fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSignIn.mockResolvedValue({
      nextStep: 'email_verification',
      userId: 'user-123',
    });
    mockSendVerificationEmail.mockRejectedValue(new Error('resend failed'));

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Votre email'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Votre mot de passe'), 'password123');
    fireEvent.press(screen.getByText('Se Connecter'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
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
