import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { Button } from '@/components/Button';

describe('Button', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
  });

  it('renders with the correct title', () => {
    render(<Button title="Test Button" onPress={mockOnPress} />);
    
    expect(screen.getByText('Test Button')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    render(<Button title="Click Me" onPress={mockOnPress} />);
    
    fireEvent.press(screen.getByText('Click Me'));
    
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('shows ActivityIndicator when loading is true', () => {
    const { UNSAFE_getByType } = render(
      <Button title="Loading" onPress={mockOnPress} loading />
    );
    
    // Title should not be visible when loading
    expect(screen.queryByText('Loading')).toBeNull();
    // ActivityIndicator should be visible
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('does not call onPress when disabled', () => {
    render(<Button title="Disabled" onPress={mockOnPress} disabled />);
    
    fireEvent.press(screen.getByText('Disabled'));
    
    expect(mockOnPress).not.toHaveBeenCalled();
  });

  it('does not call onPress when loading', () => {
    const { UNSAFE_getByType } = render(
      <Button title="Loading" onPress={mockOnPress} loading />
    );
    
    // Try to press the ActivityIndicator parent
    const indicator = UNSAFE_getByType(ActivityIndicator);
    fireEvent.press(indicator);
    
    expect(mockOnPress).not.toHaveBeenCalled();
  });

  it('renders with different variants', () => {
    const { rerender } = render(
      <Button title="Primary" onPress={mockOnPress} variant="primary" />
    );
    expect(screen.getByText('Primary')).toBeTruthy();

    rerender(
      <Button title="Secondary" onPress={mockOnPress} variant="secondary" />
    );
    expect(screen.getByText('Secondary')).toBeTruthy();

    rerender(
      <Button title="Outline" onPress={mockOnPress} variant="outline" />
    );
    expect(screen.getByText('Outline')).toBeTruthy();
  });
});
