import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ChefResultCard } from '@/components/fridge/ChefResultCard';
import { withAlpha } from '@/constants/theme';
import type { FridgeMealMode, FridgeMealResult } from '@/types/fridgeScan';
import { resolveChefSurfaceColors } from '@/utils/scanFlowVisualTheme';

const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

const translations: Record<string, string> = {
  'fridge_scan.mode_labels.diet': 'Diet Chef',
  'fridge_scan.mode_labels.muscle_gain': 'Sport Chef',
  'fridge_scan.mode_labels.gourmand': 'Gourmet Chef',
  'fridge_scan_result.goal_badges.diet': 'Balanced',
  'fridge_scan_result.goal_badges.muscle_gain': 'Performance',
  'fridge_scan_result.goal_badges.gourmand': 'Pleasure',
  'fridge_scan_result.labels.chef': 'Chef',
  'fridge_scan_result.labels.non_medical': 'Non-medical',
  'fridge_scan_result.labels.to_cook': 'To cook',
  'fridge_scan_result.labels.used': 'Used',
  'fridge_scan_result.labels.detected': 'Detected',
  'fridge_scan_result.labels.calories': 'Energy',
  'fridge_scan_result.labels.protein': 'Protein',
  'fridge_scan_result.labels.caution': 'Keep in mind',
  'fridge_scan_result.sections.why': 'Why this works',
  'fridge_scan_result.sections.ingredients': 'Ingredients',
  'fridge_scan_result.sections.nutrition': 'Nutrition cues',
  'fridge_scan_result.sections.preparation': 'Preparation',
  'fridge_scan_result.sections.advice': 'Chef advice',
  'fridge_scan_result.sections.additions': 'Add if you have',
  'fridge_scan_result.sections.substitutions': 'Substitutions',
  'fridge_scan_result.proposal_status.complete': 'Ready with what you have',
  'fridge_scan_result.proposal_status.needs_additions':
    'Better with 1 or 2 extras',
  'fridge_scan_result.proposal_status.limited': 'Simple version',
  'fridge_scan_result.calories_band.light': 'Light',
  'fridge_scan_result.calories_band.moderate': 'Moderate',
  'fridge_scan_result.calories_band.hearty': 'Hearty',
  'fridge_scan_result.protein_band.low': 'Low',
  'fridge_scan_result.protein_band.medium': 'Medium',
  'fridge_scan_result.protein_band.high': 'High',
  'metric_card.premium_label': 'PREMIUM',
  'metric_card.loading_label': 'LOADING',
};

const t = (key: string) => translations[key] ?? key;
const mockLightThemeColors = {
  background: '#F5F6FA',
  cardBackground: '#FFFFFF',
  surfaceMuted: '#F7F8FC',
  surfaceAccent: '#EAF3FF',
  primaryText: '#1C1C1E',
  secondaryText: '#6E6E73',
  textMuted: '#6E6E73',
  accentGreen: '#34C759',
  accent: '#007AFF',
  lightGray: '#E3E7EF',
  gray: '#6E6E73',
  grayLight: '#F7F8FC',
  grayMedium: '#D5DBE7',
  darkGray: '#3B3F4A',
  borderSubtle: '#E3E7EF',
  borderStrong: '#D5DBE7',
  primary: '#007AFF',
  primaryLight: '#EAF3FF',
  primaryDark: '#0056B3',
  secondary: '#5856D6',
  white: '#FFFFFF',
  error: '#FF3B30',
  success: '#34C759',
  successLight: '#E8F9ED',
  warning: '#FF9500',
  gold: '#FFD700',
  goldLight: '#FFF8E1',
};

const baseMealResult: FridgeMealResult = {
  schema_version: 1,
  mode_selected: 'diet',
  proposal_status: 'complete',
  recipe_title: 'Crunch bowl',
  short_summary: 'A quick bowl from visible ingredients.',
  ingredients_detected: ['tomato', 'rice'],
  ingredients_used: ['tomato', 'rice'],
  optional_additions: [],
  preparation_steps: ['Slice tomato', 'Mix with rice'],
  why_this_fits_the_goal: ['Simple and light'],
  nutrition_estimate: {
    calories_band: null,
    protein_band: null,
    note: null,
  },
  substitutions: [],
  tips: [],
  caution_note: null,
};

function renderCard(
  mode: FridgeMealMode,
  overrides: Partial<FridgeMealResult> = {},
  premiumRenderState: 'loading' | 'locked' | 'unlocked' = 'unlocked',
) {
  const mealResult: FridgeMealResult = {
    ...baseMealResult,
    ...overrides,
    mode_selected: mode,
  };

  return render(
    <ChefResultCard
      imageUri="file:///meal.jpg"
      mealResult={mealResult}
      premiumRenderState={premiumRenderState}
      selectedMode={mode}
      t={t}
    />,
  );
}

describe('ChefResultCard', () => {
  beforeEach(() => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['diet', 'Diet Chef', 'Balanced'],
    ['muscle_gain', 'Sport Chef', 'Performance'],
    ['gourmand', 'Gourmet Chef', 'Pleasure'],
  ] as const)('renders the %s mode header and badges', (mode, label, goal) => {
    renderCard(mode);

    expect(screen.getByTestId(`chef-result-mode-${mode}`)).toBeTruthy();
    expect(screen.getByText('Chef')).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(goal)).toBeTruthy();
    expect(screen.getByText('Non-medical')).toBeTruthy();
    expect(screen.getByText('To cook')).toBeTruthy();
  });

  it('uses the light chef palette for premium cards in light mode', () => {
    const lightChefColors = resolveChefSurfaceColors(mockLightThemeColors, false);

    renderCard('diet');

    const mealImageStyle = StyleSheet.flatten(
      screen.getByTestId('chef-result-image').props.style,
    );
    const recipeTitleStyle = StyleSheet.flatten(
      screen.getByTestId('chef-result-recipe-title').props.style,
    );
    const summaryStyle = StyleSheet.flatten(
      screen.getByTestId('chef-result-summary').props.style,
    );

    expect(mealImageStyle.backgroundColor).toBe(lightChefColors.surfaceMuted);
    expect(recipeTitleStyle.color).toBe(lightChefColors.primaryText);
    expect(summaryStyle.color).toBe(withAlpha(lightChefColors.primaryText, 0.78));
    expect(recipeTitleStyle.color).not.toBe('#FFFFFF');
  });

  it('renders a compact result when optional workflow fields are empty', () => {
    renderCard('diet', {
      nutrition_estimate: {
        calories_band: null,
        protein_band: null,
        note: null,
      },
      optional_additions: [],
      substitutions: [],
      tips: [],
      caution_note: null,
    });

    expect(screen.getByText('Crunch bowl')).toBeTruthy();
    expect(screen.getByTestId('chef-result-section-why')).toBeTruthy();
    expect(screen.getByTestId('chef-result-section-ingredients')).toBeTruthy();
    expect(screen.getByTestId('chef-result-section-preparation')).toBeTruthy();
    expect(screen.queryByTestId('chef-result-section-advice')).toBeNull();
    expect(screen.queryByTestId('chef-result-section-nutrition')).toBeNull();
  });

  it('renders long results with additions, substitutions, advice, and caution', () => {
    const longTitle =
      'Warm performance plate with eggs, rice, tomatoes, and a very long finishing name';
    const longSummary =
      'A detailed suggestion that remains readable on narrow screens because the primary copy is allowed to wrap instead of being forced into a single line.';

    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 720,
      scale: 3,
      fontScale: 1,
    });

    renderCard('muscle_gain', {
      proposal_status: 'needs_additions',
      recipe_title: longTitle,
      short_summary: longSummary,
      ingredients_detected: ['eggs', 'rice', 'tomatoes', 'spinach'],
      ingredients_used: ['eggs', 'rice', 'tomatoes'],
      optional_additions: ['Greek yogurt'],
      preparation_steps: [
        'Warm the rice.',
        'Cook the eggs softly.',
        'Finish with tomatoes.',
      ],
      why_this_fits_the_goal: [
        'Protein-forward base.',
        'Carbs support the training window.',
      ],
      nutrition_estimate: {
        calories_band: 'moderate',
        protein_band: 'high',
        note: 'Estimated only from visible foods.',
      },
      substitutions: ['Swap rice for potatoes.'],
      tips: ['Add salt after cooking to keep the eggs tender.'],
      caution_note: 'The photo is partial, so keep portions flexible.',
    });

    expect(screen.getByTestId('chef-result-recipe-title').props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('chef-result-summary').props.numberOfLines).toBeUndefined();
    expect(screen.getByText(longTitle)).toBeTruthy();
    expect(screen.getByText(longSummary)).toBeTruthy();
    expect(screen.getByTestId('chef-result-section-nutrition')).toBeTruthy();
    expect(screen.getByTestId('chef-result-section-advice')).toBeTruthy();
    expect(screen.getByTestId('chef-result-section-additions')).toBeTruthy();
    expect(screen.getByTestId('chef-result-section-substitutions')).toBeTruthy();
    expect(screen.getByTestId('chef-result-caution')).toBeTruthy();
    expect(screen.getByText('Energy')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('keeps the free recipe preview visible while locking rich chef sections', () => {
    renderCard(
      'diet',
      {
        nutrition_estimate: {
          calories_band: 'moderate',
          protein_band: 'high',
          note: 'Estimated only from visible foods.',
        },
        tips: ['Add lemon at the end.'],
        caution_note: 'The photo is partial.',
      },
      'locked',
    );

    expect(screen.getByText('Crunch bowl')).toBeTruthy();
    expect(screen.getByText('A quick bowl from visible ingredients.')).toBeTruthy();
    expect(screen.queryByText('Simple and light')).toBeNull();
    expect(screen.queryByText('Energy')).toBeNull();
    expect(screen.queryByText('Estimated only from visible foods.')).toBeNull();
    expect(screen.queryByText('Slice tomato')).toBeNull();
    expect(screen.getAllByText('PREMIUM').length).toBeGreaterThan(0);
    expect(screen.getByTestId('chef-result-section-nutrition')).toBeTruthy();
  });
});
