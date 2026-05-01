import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { ProductCard } from '@/components/ProductCard';
import { Product } from '@/types';

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  Bone: 'Bone',
  Brain: 'Brain',
  Heart: 'Heart',
  Sparkles: 'Sparkles',
  ChevronRight: 'ChevronRight',
}));

// Spy on Linking.openURL
const openURLSpy = jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());

describe('ProductCard', () => {
  const mockProduct: Product = {
    id: 1,
    name: 'Omega 3 Premium',
    imageUrl: 'https://example.com/omega3.jpg',
    benefits: ['Santé Cardiovasculaire', 'Santé Cognitive'],
    shopUrl: 'https://play.google.com/store/apps/details?id=com.healthscan.app',
  };

  beforeEach(() => {
    openURLSpy.mockClear();
  });

  afterAll(() => {
    openURLSpy.mockRestore();
  });

  it('displays the product name', () => {
    render(<ProductCard product={mockProduct} />);

    expect(screen.getByText('Omega 3 Premium')).toBeTruthy();
  });

  it('displays all benefits', () => {
    render(<ProductCard product={mockProduct} />);

    expect(screen.getByText('Santé Cardiovasculaire')).toBeTruthy();
    expect(screen.getByText('Santé Cognitive')).toBeTruthy();
  });

  it('opens shop URL when pressed', async () => {
    render(<ProductCard product={mockProduct} />);

    fireEvent.press(screen.getByText('Omega 3 Premium'));

    await waitFor(() => {
      expect(openURLSpy).toHaveBeenCalledWith(
        'https://play.google.com/store/apps/details?id=com.healthscan.app',
      );
    });
  });

  it('does not open unsafe shop URLs', async () => {
    render(
      <ProductCard
        product={{
          ...mockProduct,
          shopUrl: 'javascript:alert(1)',
        }}
      />,
    );

    fireEvent.press(screen.getByText('Omega 3 Premium'));

    await waitFor(() => {
      expect(openURLSpy).not.toHaveBeenCalled();
    });
  });

  it('renders product with single benefit', () => {
    const singleBenefitProduct: Product = {
      ...mockProduct,
      benefits: ['Antioxydant'],
    };

    render(<ProductCard product={singleBenefitProduct} />);

    expect(screen.getByText('Antioxydant')).toBeTruthy();
  });

  it('renders product with no benefits', () => {
    const noBenefitsProduct: Product = {
      ...mockProduct,
      benefits: [],
    };

    const { toJSON } = render(<ProductCard product={noBenefitsProduct} />);
    expect(toJSON()).toBeTruthy();
    expect(screen.getByText('Omega 3 Premium')).toBeTruthy();
  });
});
