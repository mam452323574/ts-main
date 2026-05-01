import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { FeatureGate } from '@/components/FeatureGate';

// Mock dependencies
jest.mock('lucide-react-native', () => ({
  Lock: 'Lock',
  Crown: 'Crown',
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('FeatureGate', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseAuth.mockClear();
  });

  it('renders children when user is premium', () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'premium' },
    });

    render(
      <FeatureGate featureKey="test" featureName="Test Feature">
        <Text>Premium Content</Text>
      </FeatureGate>
    );
    
    expect(screen.getByText('Premium Content')).toBeTruthy();
  });

  it('renders fallback when provided and user is not premium', () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'free' },
    });

    render(
      <FeatureGate
        featureKey="test"
        featureName="Test Feature"
        fallback={<Text>Fallback Content</Text>}
      >
        <Text>Premium Content</Text>
      </FeatureGate>
    );
    
    expect(screen.getByText('Fallback Content')).toBeTruthy();
    expect(screen.queryByText('Premium Content')).toBeNull();
  });

  it('renders gate UI when user is not premium and no fallback', () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'free' },
    });

    render(
      <FeatureGate featureKey="test" featureName="Test Feature">
        <Text>Premium Content</Text>
      </FeatureGate>
    );
    
    expect(screen.getByText('Fonctionnalité Premium')).toBeTruthy();
    expect(screen.getByText('Test Feature')).toBeTruthy();
    expect(screen.getByText('Passer Premium')).toBeTruthy();
  });

  it('displays feature description when provided', () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'free' },
    });

    render(
      <FeatureGate
        featureKey="test"
        featureName="Test Feature"
        featureDescription="This is a premium feature"
      >
        <Text>Premium Content</Text>
      </FeatureGate>
    );
    
    expect(screen.getByText('This is a premium feature')).toBeTruthy();
  });

  it('navigates to premium upgrade when button is pressed', () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'free' },
    });

    render(
      <FeatureGate featureKey="test" featureName="Test Feature">
        <Text>Premium Content</Text>
      </FeatureGate>
    );
    
    fireEvent.press(screen.getByText('Passer Premium'));
    
    expect(mockPush).toHaveBeenCalledWith('/premium-upgrade');
  });

  it('displays hint text for premium upgrade', () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'free' },
    });

    render(
      <FeatureGate featureKey="test" featureName="Test Feature">
        <Text>Premium Content</Text>
      </FeatureGate>
    );
    
    expect(screen.getByText('Débloquez cette fonctionnalité et bien plus encore')).toBeTruthy();
  });
});
