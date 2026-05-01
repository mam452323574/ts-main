import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { OAuthButton } from '@/components/OAuthButton';

describe('OAuthButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
  });

  it('renders Google button correctly', () => {
    render(<OAuthButton provider="google" onPress={mockOnPress} />);
    
    expect(screen.getByText('Continuer avec Google')).toBeTruthy();
  });

  it('renders Apple button correctly', () => {
    render(<OAuthButton provider="apple" onPress={mockOnPress} />);
    
    expect(screen.getByText('Continuer avec Apple')).toBeTruthy();
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

  it('renders Apple icon (empty for Apple logo)', () => {
    render(<OAuthButton provider="apple" onPress={mockOnPress} />);
    
    // Apple uses an empty string for icon as it would use the Apple logo
    expect(screen.getByText('Continuer avec Apple')).toBeTruthy();
  });
});
