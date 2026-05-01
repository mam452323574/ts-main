import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AccountBadge } from '@/components/AccountBadge';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Crown: 'Crown',
}));

describe('AccountBadge', () => {
  it('renders free tier badge correctly', () => {
    render(<AccountBadge tier="free" />);
    
    expect(screen.getByText('Compte Gratuit')).toBeTruthy();
  });

  it('renders premium tier badge correctly', () => {
    render(<AccountBadge tier="premium" />);
    
    expect(screen.getByText('Compte Premium')).toBeTruthy();
  });

  it('renders with small size', () => {
    const { toJSON } = render(<AccountBadge tier="free" size="small" />);
    
    expect(toJSON()).toBeTruthy();
    expect(screen.getByText('Compte Gratuit')).toBeTruthy();
  });

  it('renders with medium size (default)', () => {
    const { toJSON } = render(<AccountBadge tier="premium" />);
    
    expect(toJSON()).toBeTruthy();
    expect(screen.getByText('Compte Premium')).toBeTruthy();
  });

  it('renders with large size', () => {
    const { toJSON } = render(<AccountBadge tier="premium" size="large" />);
    
    expect(toJSON()).toBeTruthy();
    expect(screen.getByText('Compte Premium')).toBeTruthy();
  });

  it('renders without crashing for all tier and size combinations', () => {
    const tiers = ['free', 'premium'] as const;
    const sizes = ['small', 'medium', 'large'] as const;

    tiers.forEach(tier => {
      sizes.forEach(size => {
        const { toJSON } = render(<AccountBadge tier={tier} size={size} />);
        expect(toJSON()).toBeTruthy();
      });
    });
  });
});
