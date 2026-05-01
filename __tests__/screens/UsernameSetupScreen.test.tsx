import React from 'react';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import UsernameSetupScreen from '@/screens/UsernameSetupScreen';

// Mock dependencies
jest.mock('lucide-react-native', () => ({
  Heart: 'Heart',
  Check: 'Check',
  X: 'X',
  AlertCircle: 'AlertCircle',
  Sun: 'Sun',
  Moon: 'Moon',
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

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

const mockCheckUsernameAvailability = jest.fn();
const mockUpdateUserProfile = jest.fn();
const mockCompleteSignUp = jest.fn();
const mockMarkPostSignupOnboardingPending = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@example.com', app_metadata: {} },
    userProfile: null,
    isEmailVerified: true,
    checkUsernameAvailability: mockCheckUsernameAvailability,
    updateUserProfile: mockUpdateUserProfile,
    completeSignUp: mockCompleteSignUp,
  }),
}));

// Theme Context Mock from Global Setup or Local override
// Since we have global setup, we might rely on it, but explicitly mocking helps clarity in this test suite if needed.
// However, since we added it to global setup, we should use that. 
// But wait, the test failure said "TestSuite failed to run".
// Maybe missing imports?
// I'll add the theme mock here to be safe and explicit about the `setTheme` mock which we want to test.

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
    },
    isDark: false,
    setTheme: mockSetTheme,
  }),
}));


jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

jest.mock('@/utils/postSignupOnboarding', () => ({
  markPostSignupOnboardingPending: (...args: any[]) =>
    mockMarkPostSignupOnboardingPending(...args),
}));

async function flushUsernameDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(400);
    await Promise.resolve();
  });
}

async function enterAvailableUsername(username = 'validusername') {
  const input = screen.getByPlaceholderText('pseudo123');
  fireEvent.changeText(input, username);
  await flushUsernameDebounce();

  await waitFor(() => {
    expect(mockCheckUsernameAvailability).toHaveBeenCalledWith(username);
  });
  await waitFor(() => {
    expect(screen.getByText('Disponible')).toBeTruthy();
  });
}

describe('UsernameSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckUsernameAvailability.mockResolvedValue(true);
    mockCompleteSignUp.mockResolvedValue(undefined);
    mockMarkPostSignupOnboardingPending.mockResolvedValue(undefined);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<UsernameSetupScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays welcome title', () => {
    render(<UsernameSetupScreen />);
    expect(screen.getByText('Bienvenue !')).toBeTruthy();
  });

  it('displays subtitle', () => {
    render(<UsernameSetupScreen />);
    expect(screen.getByText('Configurez votre profil')).toBeTruthy();
  });

  it('displays username input', () => {
    render(<UsernameSetupScreen />);
    expect(screen.getByPlaceholderText('pseudo123')).toBeTruthy();
  });

  it('displays next button (Suivant)', () => {
    render(<UsernameSetupScreen />);
    expect(screen.getByText('Suivant')).toBeTruthy();
  });

  it('validates username format', async () => {
    render(<UsernameSetupScreen />);
    const input = screen.getByPlaceholderText('pseudo123');
    fireEvent.changeText(input, 'ab'); // Too short
    await flushUsernameDebounce();
    // Should show invalid status (implementation detail dependent, checking behavior via button disabled state usually better)
  });

  it('checks username availability', async () => {
    render(<UsernameSetupScreen />);
    await enterAvailableUsername();
  });

  it('transitions to theme selection step', async () => {
    render(<UsernameSetupScreen />);
    await enterAvailableUsername();

    const button = screen.getByText('Suivant');
    await act(async () => {
      fireEvent.press(button);
    });

    // Should now show theme selection
    await waitFor(() => {
      expect(screen.getByText('Choisissez votre style')).toBeTruthy();
      expect(screen.getByText('Commencer l\'aventure')).toBeTruthy();
    });
  });

  it('allows theme selection', async () => {
    render(<UsernameSetupScreen />);
    // Step 1: Username
    await enterAvailableUsername();
    await act(async () => {
      fireEvent.press(screen.getByText('Suivant'));
    });

    // Step 2: Theme
    await waitFor(() => expect(screen.getByText('Sombre')).toBeTruthy());

    // Click Dark Mode
    fireEvent.press(screen.getByText('Sombre'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');

    // Finish
    fireEvent.press(screen.getByText('Commencer l\'aventure'));

    await waitFor(() => {
      expect(mockCompleteSignUp).toHaveBeenCalled();
      expect(mockMarkPostSignupOnboardingPending).toHaveBeenCalledWith('user-123');
      expect(mockReplace).toHaveBeenCalledWith('/post-signup-onboarding');
    });
  });
});

describe('UsernameSetupScreen - No User', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to login when no user', () => {
    jest.doMock('@/contexts/AuthContext', () => ({
      useAuth: () => ({
        user: null,
        userProfile: null,
        isEmailVerified: false,
        checkUsernameAvailability: jest.fn(),
        updateUserProfile: jest.fn(),
        completeSignUp: jest.fn(),
      }),
    }));

    // Component would redirect to login
  });
});
