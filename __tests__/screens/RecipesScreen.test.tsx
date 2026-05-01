import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import RecipesScreen from '@/screens/RecipesScreen';

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

const mockUseRecipes = jest.fn();
jest.mock('@/hooks/queries', () => ({
  useRecipes: () => mockUseRecipes(),
}));

describe('RecipesScreen', () => {
  beforeEach(() => {
    mockUseRecipes.mockClear();
  });

  it('renders loading state', () => {
    mockUseRecipes.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    });

    render(<RecipesScreen />);
    // Loading spinner should be shown
  });

  it('renders error state', () => {
    mockUseRecipes.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('Failed to load recipes'),
    });

    render(<RecipesScreen />);
    // Error message should be displayed
  });

  it('renders empty state when no recipes', () => {
    mockUseRecipes.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(<RecipesScreen />);
    
    expect(screen.getByText('Aucune recette trouvée')).toBeTruthy();
  });

  it('renders recipes list', () => {
    const mockRecipes = [
      { id: '1', name: 'Salade César', preparation_time: 15, difficulty: 'easy', image_url: 'http://example.com/1.jpg' },
      { id: '2', name: 'Poulet Grillé', preparation_time: 30, difficulty: 'medium', image_url: 'http://example.com/2.jpg' },
    ];

    mockUseRecipes.mockReturnValue({
      data: mockRecipes,
      isLoading: false,
      error: null,
    });

    render(<RecipesScreen />);
    
    expect(screen.getByText('Nos Recettes')).toBeTruthy();
    expect(screen.getByText('Salade César')).toBeTruthy();
    expect(screen.getByText('Poulet Grillé')).toBeTruthy();
  });

  it('filters recipes by search query', () => {
    const mockRecipes = [
      { id: '1', name: 'Salade César', preparation_time: 15, difficulty: 'easy', image_url: 'http://example.com/1.jpg' },
      { id: '2', name: 'Poulet Grillé', preparation_time: 30, difficulty: 'medium', image_url: 'http://example.com/2.jpg' },
    ];

    mockUseRecipes.mockReturnValue({
      data: mockRecipes,
      isLoading: false,
      error: null,
    });

    render(<RecipesScreen />);
    
    const searchInput = screen.getByPlaceholderText('Rechercher une recette...');
    fireEvent.changeText(searchInput, 'Salade');
    
    expect(screen.getByText('Salade César')).toBeTruthy();
    expect(screen.queryByText('Poulet Grillé')).toBeNull();
  });

  it('displays preparation time', () => {
    const mockRecipes = [
      { id: '1', name: 'Quick Recipe', preparation_time: 10, difficulty: 'easy', image_url: 'http://example.com/1.jpg' },
    ];

    mockUseRecipes.mockReturnValue({
      data: mockRecipes,
      isLoading: false,
      error: null,
    });

    render(<RecipesScreen />);
    
    expect(screen.getByText('10 min')).toBeTruthy();
  });

  it('displays difficulty badges', () => {
    const mockRecipes = [
      { id: '1', name: 'Easy Recipe', preparation_time: 10, difficulty: 'easy', image_url: 'http://example.com/1.jpg' },
      { id: '2', name: 'Medium Recipe', preparation_time: 20, difficulty: 'medium', image_url: 'http://example.com/2.jpg' },
      { id: '3', name: 'Hard Recipe', preparation_time: 30, difficulty: 'hard', image_url: 'http://example.com/3.jpg' },
    ];

    mockUseRecipes.mockReturnValue({
      data: mockRecipes,
      isLoading: false,
      error: null,
    });

    render(<RecipesScreen />);
    
    expect(screen.getByText('Facile')).toBeTruthy();
    expect(screen.getByText('Moyen')).toBeTruthy();
    expect(screen.getByText('Difficile')).toBeTruthy();
  });
});
