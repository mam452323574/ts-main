import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FeatureComparisonList } from '@/components/FeatureComparisonList';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Sparkles: 'Sparkles',
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
  {
    id: '3',
    feature_name: 'Recettes personnalisées',
    feature_key: 'custom_recipes',
    feature_description: 'Des recettes adaptées à vos besoins',
    category: 'Recettes',
    free_tier_description: 'Basique',
    premium_tier_description: 'Avancé',
    requires_premium: true,
    enabled: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
];

describe('FeatureComparisonList', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<FeatureComparisonList features={mockFeatures} />);

    expect(toJSON()).toBeTruthy();
  });

  it('displays feature names', () => {
    render(<FeatureComparisonList features={mockFeatures} />);

    expect(screen.getByText('Scan illimité')).toBeTruthy();
    expect(screen.getByText('Historique')).toBeTruthy();
    expect(screen.getByText('Recettes personnalisées')).toBeTruthy();
  });

  it('displays feature descriptions', () => {
    render(<FeatureComparisonList features={mockFeatures} />);

    expect(screen.getByText('Scannez autant de produits que vous voulez')).toBeTruthy();
    expect(screen.getByText('Des recettes adaptées à vos besoins')).toBeTruthy();
  });

  it('displays category titles', () => {
    render(<FeatureComparisonList features={mockFeatures} />);

    expect(screen.getByText('Scans')).toBeTruthy();
    expect(screen.getByText('Recettes')).toBeTruthy();
  });

  it('displays tier labels', () => {
    render(<FeatureComparisonList features={mockFeatures} />);

    expect(screen.getAllByText('Gratuit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Premium').length).toBeGreaterThan(0);
  });

  it('displays tier descriptions', () => {
    render(<FeatureComparisonList features={mockFeatures} />);

    expect(screen.getByText('3 par jour')).toBeTruthy();
    expect(screen.getByText('Illimité')).toBeTruthy();
  });

  it('renders empty list without crashing', () => {
    const { toJSON } = render(<FeatureComparisonList features={[]} />);

    expect(toJSON()).toBeTruthy();
  });

  it('groups features by category', () => {
    render(<FeatureComparisonList features={mockFeatures} />);

    // Two categories: Scans and Recettes
    expect(screen.getByText('Scans')).toBeTruthy();
    expect(screen.getByText('Recettes')).toBeTruthy();
  });
});
