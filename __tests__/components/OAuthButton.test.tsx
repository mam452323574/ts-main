import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { OAuthButton } from '@/components/OAuthButton';

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: ({ onPress, testID, ...props }: any) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} testID={testID}>
        <Text>Native Apple Button</Text>
        <Text testID="oauth-apple-native-props">{JSON.stringify(props)}</Text>
      </TouchableOpacity>
    );
  },
  AppleAuthenticationButtonStyle: {
    WHITE: 0,
    WHITE_OUTLINE: 1,
    BLACK: 2,
  },
  AppleAuthenticationButtonType: {
    SIGN_IN: 0,
    CONTINUE: 1,
    SIGN_UP: 2,
  },
}));

describe('OAuthButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
  });

  it('renders Google button correctly', () => {
    render(<OAuthButton provider="google" onPress={mockOnPress} />);
    
    expect(screen.getByText('Continuer avec Google')).toBeTruthy();
    expect(screen.getByTestId('oauth-google-button').props.accessibilityRole).toBe(
      'button',
    );
  });

  it('renders Apple with the native Apple authentication button', () => {
    render(
      <OAuthButton
        provider="apple"
        appleButtonType="signIn"
        onPress={mockOnPress}
      />,
    );

    const button = screen.getByTestId('oauth-apple-button');
    expect(button).toBeTruthy();
    expect(screen.getByText('Native Apple Button')).toBeTruthy();
    expect(screen.getByTestId('oauth-apple-native-props').props.children).toContain(
      '"buttonType":0',
    );
    expect(screen.getByTestId('oauth-apple-native-props').props.children).toContain(
      '"buttonStyle":2',
    );
  });

  it('calls onPress when pressed', () => {
    render(<OAuthButton provider="google" onPress={mockOnPress} />);
    
    fireEvent.press(screen.getByText('Continuer avec Google'));
    
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator when loading is true', () => {
    const { UNSAFE_getByType } = render(
      <OAuthButton provider="google" onPress={mockOnPress} loading />
    );
    
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByText('Continuer avec Google')).toBeNull();
  });

  it('does not call onPress when disabled', () => {
    render(<OAuthButton provider="google" onPress={mockOnPress} disabled />);
    
    fireEvent.press(screen.getByText('Continuer avec Google'));
    
    expect(mockOnPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('oauth-google-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('does not call onPress when loading', () => {
    const { UNSAFE_getByType } = render(
      <OAuthButton provider="google" onPress={mockOnPress} loading />
    );
    
    const indicator = UNSAFE_getByType(ActivityIndicator);
    fireEvent.press(indicator);
    
    expect(mockOnPress).not.toHaveBeenCalled();
  });

  it('renders Google icon', () => {
    render(<OAuthButton provider="google" onPress={mockOnPress} />);
    
    expect(screen.getByText('G')).toBeTruthy();
  });

  it('uses the native Apple sign-up type when requested', () => {
    render(
      <OAuthButton
        provider="apple"
        appleButtonType="signUp"
        onPress={mockOnPress}
      />,
    );

    expect(
      screen.getByTestId('oauth-apple-native-props').props.children,
    ).toContain('"buttonType":2');
  });

  it('blocks Apple onPress when disabled', () => {
    render(<OAuthButton provider="apple" onPress={mockOnPress} disabled />);

    fireEvent.press(screen.getByTestId('oauth-apple-button'));

    expect(mockOnPress).not.toHaveBeenCalled();
  });
});
