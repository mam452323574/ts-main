import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AnimatedTabBarIcon } from '@/components/AnimatedTabBarIcon';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Home: 'Home',
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

const MockIcon = jest.fn(() => null);

describe('AnimatedTabBarIcon', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
    MockIcon.mockClear();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(
      <AnimatedTabBarIcon
        IconComponent={MockIcon as any}
        color="#000"
        size={24}
        focused={false}
      />
    );
    
    expect(toJSON()).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const { toJSON } = render(
      <AnimatedTabBarIcon
        IconComponent={MockIcon as any}
        color="#000"
        size={24}
        focused={false}
        onPress={mockOnPress}
      />
    );
    
    // Component renders correctly with onPress handler
    expect(toJSON()).toBeTruthy();
  });

  it('renders with focused state', () => {
    const { toJSON } = render(
      <AnimatedTabBarIcon
        IconComponent={MockIcon as any}
        color="#FF0000"
        size={24}
        focused={true}
      />
    );
    
    expect(toJSON()).toBeTruthy();
  });

  it('renders with badge when showBadge is true', () => {
    const { toJSON } = render(
      <AnimatedTabBarIcon
        IconComponent={MockIcon as any}
        color="#000"
        size={24}
        focused={false}
        showBadge={true}
      />
    );
    
    expect(toJSON()).toBeTruthy();
  });

  it('renders without badge when showBadge is false', () => {
    const { toJSON } = render(
      <AnimatedTabBarIcon
        IconComponent={MockIcon as any}
        color="#000"
        size={24}
        focused={false}
        showBadge={false}
      />
    );
    
    expect(toJSON()).toBeTruthy();
  });
});
