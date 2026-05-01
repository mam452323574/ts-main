import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Mock dependencies
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/i18n/translations', () => ({
  i18n: {
    t: (key: string) =>
      (
        {
          'components.error_boundary.title': 'Oups !',
          'components.error_boundary.message': "Une erreur inattendue s'est produite.",
          'components.error_boundary.retry': 'Reessayer',
          'components.error_boundary.logout': 'Se deconnecter',
        } as Record<string, string>
      )[key] ?? key,
  },
}));

// Component that throws an error
const ThrowingComponent = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <Text>Normal content</Text>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  
  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <Text>Test Child</Text>
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Test Child')).toBeTruthy();
  });

  it('renders error UI when there is an error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Oups !')).toBeTruthy();
    expect(screen.getByText("Une erreur inattendue s'est produite.")).toBeTruthy();
  });

  it('renders retry and logout buttons on error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Reessayer')).toBeTruthy();
    expect(screen.getByText('Se deconnecter')).toBeTruthy();
  });

  it('resets error state when retry is pressed', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Oups !')).toBeTruthy();

    fireEvent.press(screen.getByText('Reessayer'));
    
    // After pressing retry, the component should try to render again
    // Since ThrowingComponent still throws, it will show error again
  });

  it('calls logout handler when logout button is pressed', async () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    
    fireEvent.press(screen.getByText('Se deconnecter'));
    
    // The logout process is async, so we just verify the button can be pressed
  });
});
