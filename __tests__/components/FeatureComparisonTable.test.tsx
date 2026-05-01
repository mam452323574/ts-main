import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FeatureComparisonTable } from '@/components/FeatureComparisonTable';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Check: 'Check',
  X: 'X',
}));

const mockFeatures = [
  {
    id: '1',
    feature_name: 'Scan illimité',
    feature_key: 'unlimited_scan',
    feature_description: 'Scannez autant de produits que vous voulez',
    category: 'Scans',
    free_tier_description: '3 par jour',
    premium_tier_description: 'Illimité',
    requires_premium: true,
    enabled: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    id: '2',
    feature_name: 'Historique',
    feature_key: 'history',
    feature_description: 'Accédez à votre historique complet',
    category: 'Scans',
    free_tier_description: null,
    premium_tier_description: null,
    requires_premium: false,
    enabled: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
];

describe('FeatureComparisonTable', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<FeatureComparisonTable features={mockFeatures} />);

    expect(toJSON()).toBeTruthy();
  });

  it('displays table headers', () => {
    render(<FeatureComparisonTable features={mockFeatures} />);

    expect(screen.getByText('Fonctionnalité')).toBeTruthy();
    expect(screen.getByText('Gratuit')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
  });

  it('displays feature names', () => {
    render(<FeatureComparisonTable features={mockFeatures} />);

    expect(screen.getByText('Scan illimité')).toBeTruthy();
    expect(screen.getByText('Historique')).toBeTruthy();
  });

  it('displays feature descriptions', () => {
    render(<FeatureComparisonTable features={mockFeatures} />);

    expect(screen.getByText('Scannez autant de produits que vous voulez')).toBeTruthy();
    expect(screen.getByText('Accédez à votre historique complet')).toBeTruthy();
  });

  it('displays tier descriptions when available', () => {
    render(<FeatureComparisonTable features={mockFeatures} />);

    expect(screen.getByText('3 par jour')).toBeTruthy();
    expect(screen.getByText('Illimité')).toBeTruthy();
  });

  it('renders empty table without crashing', () => {
    const { toJSON } = render(<FeatureComparisonTable features={[]} />);

    expect(toJSON()).toBeTruthy();
  });
});
