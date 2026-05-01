import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Home } from 'lucide-react-native';
import { ActionCard } from '@/components/ActionCard';

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  Home: 'Home',
  UtensilsCrossed: 'UtensilsCrossed',
  Dumbbell: 'Dumbbell',
}));

describe('ActionCard', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
  });

  it('displays the title', () => {
    render(<ActionCard title="nos recettes" icon={Home} onPress={mockOnPress} />);
    
    expect(screen.getByText('nos recettes')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    render(<ActionCard title="nos exercices" icon={Home} onPress={mockOnPress} />);
    
    fireEvent.press(screen.getByText('nos exercices'));
    
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('renders with different titles', () => {
    const { rerender } = render(
      <ActionCard title="Recettes" icon={Home} onPress={mockOnPress} />
    );
    expect(screen.getByText('Recettes')).toBeTruthy();

    rerender(<ActionCard title="Exercices" icon={Home} onPress={mockOnPress} />);
    expect(screen.getByText('Exercices')).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(
      <ActionCard title="Test" icon={Home} onPress={mockOnPress} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
