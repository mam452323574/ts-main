import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ErrorMessage } from '@/components/ErrorMessage';

describe('ErrorMessage', () => {
  it('displays the error message', () => {
    render(<ErrorMessage message="Une erreur est survenue" />);
    
    expect(screen.getByText('Une erreur est survenue')).toBeTruthy();
  });

  it('displays different error messages', () => {
    const { rerender } = render(<ErrorMessage message="Erreur réseau" />);
    expect(screen.getByText('Erreur réseau')).toBeTruthy();

    rerender(<ErrorMessage message="Données invalides" />);
    expect(screen.getByText('Données invalides')).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<ErrorMessage message="Test" />);
    expect(toJSON()).toBeTruthy();
  });
});
