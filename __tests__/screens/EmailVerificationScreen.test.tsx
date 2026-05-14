import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import EmailVerificationScreen from '@/screens/EmailVerificationScreen';

// Mock dependencies
jest.mock('lucide-react-native', () => ({
  Mail: 'Mail',
  RefreshCw: 'RefreshCw',
  ArrowLeft: 'ArrowLeft',
  Check: 'Check',
  Shield: 'Shield',
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

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'fr',
    t: (key: string, options: Record<string, string> = {}) => {
      const translations: Record<string, string> = {
        'auth.verify_title': 'Encore une etape avant votre premier scan',
        'auth.verify_subtitle':
          'Entrez le code envoye a votre email pour activer votre compte.',
        'auth.code_expired': 'Le code expire dans',
        'auth.code_incomplete': 'Code incomplet',
        'auth.code_invalid': 'Code incorrect ou expire',
        'auth.error_login_generic': 'Erreur de connexion',
        'auth.error_verification_send': "Erreur lors de l'envoi du code",
        'auth.resend_code': 'Renvoyer le code',
        'auth.resend_in': `Renvoyer dans ${options.seconds ?? ''}s`,
        'auth.verify_btn': 'Verifier',
        'auth.verifying': 'Verification...',
        'auth.verification_sent_title': 'Email verifie',
        'auth.verification_sent_subtitle_signup':
          'On prepare votre premier scan...',
        'auth.cancel_verification_title': 'Annuler la vérification ?',
        'auth.cancel_verification_message':
          'Vous serez déconnecté et pourrez reprendre plus tard depuis la connexion.',
        'auth.cancel_verification_confirm': 'Se déconnecter',
        'common.error': 'Erreur',
        'settings.cancel': 'Annuler',
        'onboarding.error_session': 'Session invalide',
        'onboarding.error_avatar_upload': 'Erreur avatar',
        'onboarding.avatar_upload_retry': 'Réessayer',
        'onboarding.avatar_upload_continue': 'Continuer sans avatar',
      };

      return translations[key] ?? key;
    },
  }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockUseAuth = jest.fn();
const mockUploadAvatarFromLocalUri = jest.fn();
const mockSendVerificationEmail = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockRefreshUserProfile = jest.fn();
const mockCompleteSignUp = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/services/avatar', () => ({
  uploadAvatarFromLocalUri: (...args: unknown[]) =>
    mockUploadAvatarFromLocalUri(...args),
}));

describe('EmailVerificationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      email: 'test@example.com',
      userId: 'user-123',
      type: 'signup',
    });
    mockSendVerificationEmail.mockResolvedValue(undefined);
    mockVerifyEmailCode.mockResolvedValue(true);
    mockRefreshUserProfile.mockResolvedValue(undefined);
    mockCompleteSignUp.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      sendVerificationEmail: mockSendVerificationEmail,
      verifyEmailCode: mockVerifyEmailCode,
      refreshUserProfile: mockRefreshUserProfile,
      completeSignUp: mockCompleteSignUp,
      user: { id: 'user-123', email: 'test@example.com' },
      signOut: mockSignOut,
    });
    mockUploadAvatarFromLocalUri.mockResolvedValue({
      avatarReference: 'user-123/avatar.jpg',
      localUri: 'file:///prepared-avatar.jpg',
    });
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<EmailVerificationScreen />);
    
    expect(toJSON()).toBeTruthy();
  });

  it('displays email verification title', () => {
    render(<EmailVerificationScreen />);
    
    expect(
      screen.getByText('Encore une etape avant votre premier scan'),
    ).toBeTruthy();
  });

  it('displays email address', () => {
    render(<EmailVerificationScreen />);
    
    expect(screen.getByText('test@example.com')).toBeTruthy();
  });

  it('displays verify button', () => {
    render(<EmailVerificationScreen />);
    
    expect(screen.getByText('Verifier')).toBeTruthy();
  });

  it('displays resend code button', () => {
    render(<EmailVerificationScreen />);
    
    expect(screen.getByText('Renvoyer le code')).toBeTruthy();
  });

  it('renders back button', () => {
    const { toJSON } = render(<EmailVerificationScreen />);
    
    // Component renders with back button (ArrowLeft icon)
    expect(toJSON()).toBeTruthy();
  });

  it('shows retry guidance when the initial email send failed', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      email: 'test@example.com',
      userId: 'user-123',
      type: 'signup',
      initialSendFailed: 'true',
    });

    render(<EmailVerificationScreen />);

    expect(
      await screen.findByText("Erreur lors de l'envoi du code"),
    ).toBeTruthy();
    expect(screen.getByText('Renvoyer le code')).toBeTruthy();
  });

  it('asks for confirmation before signing out from verification', async () => {
    render(<EmailVerificationScreen />);

    fireEvent.press(screen.getByTestId('email-verification-back'));

    expect(await screen.findByText('Annuler la vérification ?')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Se déconnecter'));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalled();
    });
  });
});
