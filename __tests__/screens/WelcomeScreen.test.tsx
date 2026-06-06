import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import WelcomeScreen from '@/screens/WelcomeScreen';

jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, testID }: any) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} testID={testID}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('WelcomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers two distinct, equal-weight choices', () => {
    render(<WelcomeScreen />);

    expect(screen.getByTestId('welcome-create-account')).toBeTruthy();
    expect(screen.getByTestId('welcome-login')).toBeTruthy();
  });

  it('routes new users to the signup wizard', () => {
    render(<WelcomeScreen />);

    fireEvent.press(screen.getByTestId('welcome-create-account'));
    expect(mockPush).toHaveBeenCalledWith('/signup');
  });

  it('routes returning users to login', () => {
    render(<WelcomeScreen />);

    fireEvent.press(screen.getByTestId('welcome-login'));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
