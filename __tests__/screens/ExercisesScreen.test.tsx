import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ExercisesScreen from '@/screens/ExercisesScreen';

// Mock dependencies
jest.mock('lucide-react-native', () => ({
  Search: 'Search',
}));

jest.mock('@/components/LoadingSpinner', () => ({
  LoadingSpinner: () => 'LoadingSpinner',
}));

jest.mock('@/components/ErrorMessage', () => ({
  ErrorMessage: ({ message }: { message: string }) => `ErrorMessage: ${message}`,
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => 'ModalHandle',
}));

const mockUseExercises = jest.fn();
jest.mock('@/hooks/queries', () => ({
  useExercises: () => mockUseExercises(),
}));

describe('ExercisesScreen', () => {
  beforeEach(() => {
    mockUseExercises.mockClear();
  });

  it('renders loading state', () => {
    mockUseExercises.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    });

    render(<ExercisesScreen />);
    // Loading spinner should be shown
  });

  it('renders error state', () => {
    mockUseExercises.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('Failed to load exercises'),
    });

    render(<ExercisesScreen />);
    // Error message should be displayed
  });

  it('renders empty state when no exercises', () => {
    mockUseExercises.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(<ExercisesScreen />);
    
    expect(screen.getByText('Aucun exercice trouvé')).toBeTruthy();
  });

  it('renders exercises list', () => {
    const mockExercises = [
      { id: '1', name: 'Push-ups', duration: 15, difficulty: 'easy', image_url: 'http://example.com/1.jpg' },
      { id: '2', name: 'Squats', duration: 20, difficulty: 'medium', image_url: 'http://example.com/2.jpg' },
    ];

    mockUseExercises.mockReturnValue({
      data: mockExercises,
      isLoading: false,
      error: null,
    });

    render(<ExercisesScreen />);
    
    expect(screen.getByText('Nos Exercices')).toBeTruthy();
    expect(screen.getByText('Push-ups')).toBeTruthy();
    expect(screen.getByText('Squats')).toBeTruthy();
  });

  it('filters exercises by search query', () => {
    const mockExercises = [
      { id: '1', name: 'Push-ups', duration: 15, difficulty: 'easy', image_url: 'http://example.com/1.jpg' },
      { id: '2', name: 'Squats', duration: 20, difficulty: 'medium', image_url: 'http://example.com/2.jpg' },
    ];

    mockUseExercises.mockReturnValue({
      data: mockExercises,
      isLoading: false,
      error: null,
    });

    render(<ExercisesScreen />);
    
    const searchInput = screen.getByPlaceholderText('Rechercher un exercice...');
    fireEvent.changeText(searchInput, 'Push');
    
    expect(screen.getByText('Push-ups')).toBeTruthy();
    expect(screen.queryByText('Squats')).toBeNull();
  });

  it('displays difficulty badges', () => {
    const mockExercises = [
      { id: '1', name: 'Easy Exercise', duration: 10, difficulty: 'easy', image_url: 'http://example.com/1.jpg' },
      { id: '2', name: 'Medium Exercise', duration: 15, difficulty: 'medium', image_url: 'http://example.com/2.jpg' },
      { id: '3', name: 'Hard Exercise', duration: 20, difficulty: 'hard', image_url: 'http://example.com/3.jpg' },
    ];

    mockUseExercises.mockReturnValue({
      data: mockExercises,
      isLoading: false,
      error: null,
    });

    render(<ExercisesScreen />);
    
    expect(screen.getByText('Facile')).toBeTruthy();
    expect(screen.getByText('Moyen')).toBeTruthy();
    expect(screen.getByText('Difficile')).toBeTruthy();
  });
});
