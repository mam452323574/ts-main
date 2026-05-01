import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import FridgeScanResultScreen from '@/screens/FridgeScanResultScreen';
import { resolveChefModeTheme } from '@/components/fridge/ChefResultCard';
import { resolveChefSurfaceColors } from '@/utils/scanFlowVisualTheme';

const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseFridgeScanRecord = jest.fn();
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
const mockDarkThemeColors = {
  background: '#000000',
  cardBackground: '#1C1C1E',
  surfaceMuted: '#2C2C2E',
  surfaceAccent: '#13243A',
  primaryText: '#FFFFFF',
  secondaryText: '#8E8E93',
  textMuted: '#8E8E93',
  accentGreen: '#30D158',
  accent: '#0A84FF',
  lightGray: '#2C2C2E',
  gray: '#8E8E93',
  grayLight: '#1C1C1E',
  grayMedium: '#48484A',
  darkGray: '#D1D1D6',
  borderSubtle: '#48484A',
  borderStrong: '#636366',
  primary: '#0A84FF',
  primaryLight: '#002B5C',
  primaryDark: '#0040DD',
  secondary: '#5E5CE6',
  white: '#FFFFFF',
  error: '#FF453A',
  success: '#30D158',
  successLight: '#053312',
  warning: '#FF9F0A',
  gold: '#FFD60A',
  goldLight: '#4D3F00',
};
let mockTheme = {
  colors: { ...mockDarkThemeColors },
  isDark: true,
};

const translations: Record<string, string> = {
  'fridge_scan_result.title': 'Chef',
  'fridge_scan_result.error_title': 'Result unavailable',
  'fridge_scan_result.error_body':
    'The chef could not suggest a meal right now. Please retake a clearer photo.',
  'fridge_scan_result.queued_title': 'Your chef is preparing an idea',
  'fridge_scan_result.queued_body':
    'Your chef analyzes the visible foods and adapts the suggestion to your selected profile.',
  'fridge_scan_result.ready_badge': 'Chef suggestion',
  'fridge_scan_result.actions.new_scan': 'New photo',
  'fridge_scan_result.actions.home': 'Back home',
  'fridge_scan_result.proposal_status.complete': 'Ready with what you have',
  'fridge_scan_result.sections.why': 'Why this works',
  'fridge_scan_result.sections.ingredients': 'Ingredients',
  'fridge_scan_result.sections.preparation': 'Preparation',
  'fridge_scan_result.sections.nutrition': 'Nutrition cues',
  'fridge_scan_result.sections.advice': 'Chef advice',
  'fridge_scan_result.labels.chef': 'Chef',
  'fridge_scan_result.labels.used': 'Used',
  'fridge_scan_result.labels.detected': 'Detected',
  'fridge_scan_result.labels.calories': 'Energy',
  'fridge_scan_result.labels.protein': 'Protein',
  'fridge_scan_result.labels.caution': 'Keep in mind',
  'fridge_scan_result.labels.non_medical': 'Non-medical',
  'fridge_scan_result.labels.to_cook': 'To cook',
  'fridge_scan_result.goal_badges.diet': 'Balanced',
  'fridge_scan.mode_labels.diet': 'Diet Chef',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => mockTheme,
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

jest.mock('@/hooks/queries', () => ({
  useFridgeScanRecord: (...args: unknown[]) => mockUseFridgeScanRecord(...args),
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => null,
}));

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress }: { title: string; onPress: () => void }) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('lucide-react-native', () => {
  const ReactLocal = require('react');
  const { Text } = require('react-native');
  const makeIcon = (label: string) => (props: any) =>
    ReactLocal.createElement(Text, props, label);

  return {
    AlertCircle: makeIcon('AlertCircle'),
    ArrowLeft: makeIcon('ArrowLeft'),
    ChefHat: makeIcon('ChefHat'),
    CheckCircle2: makeIcon('CheckCircle2'),
    Dumbbell: makeIcon('Dumbbell'),
    Leaf: makeIcon('Leaf'),
    ShieldCheck: makeIcon('ShieldCheck'),
    Utensils: makeIcon('Utensils'),
  };
});

const queuedRecord = {
  status: 'queued',
  selected_mode: 'diet',
  meal_result: null,
  error_code: null,
  error_message: null,
  processed_at: null,
};

const mealResult = {
  schema_version: 1,
  mode_selected: 'diet',
  proposal_status: 'complete',
  recipe_title: 'Crunch bowl',
  short_summary: 'A quick bowl from visible ingredients.',
  ingredients_detected: ['tomato', 'rice'],
  ingredients_used: ['tomato'],
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

function readDisplayedProgress() {
  const children = screen.getByTestId('fridge-scan-result-progress-value').props
    .children;
  const progressText = Array.isArray(children)
    ? children.join('')
    : String(children);

  return Number.parseInt(progressText, 10);
}

describe('FridgeScanResultScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = {
      colors: { ...mockDarkThemeColors },
      isDark: true,
    };
    mockUseLocalSearchParams.mockReturnValue({
      fridgeScanId: 'fridge-scan-1',
      selectedMode: 'diet',
    });
    mockUseFridgeScanRecord.mockReturnValue({
      data: {
        status: 'failed',
        selected_mode: 'diet',
        meal_result: null,
        error_code: 'fridge_scan_analysis_failed',
        error_message: 'Provider raw failure should stay hidden',
        processed_at: '2026-04-12T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a localized failure body instead of the raw provider error', () => {
    render(<FridgeScanResultScreen />);

    expect(screen.getByText('Result unavailable')).toBeTruthy();
    expect(
      screen.getByText(
        'The chef could not suggest a meal right now. Please retake a clearer photo.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText('Provider raw failure should stay hidden'),
    ).toBeNull();
  });

  it('routes failure actions through stable app destinations', () => {
    render(<FridgeScanResultScreen />);

    fireEvent.press(screen.getByText('New photo'));
    expect(mockReplace).toHaveBeenCalledWith('/scan-frigo');

    fireEvent.press(screen.getByText('Back home'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('smoothly advances pending progress and caps it before the meal is ready', () => {
    jest.useFakeTimers();
    mockUseLocalSearchParams.mockReturnValue({
      fridgeScanId: 'fridge-scan-1',
      selectedMode: 'diet',
      imageUri: 'file:///fridge.jpg',
    });
    mockUseFridgeScanRecord.mockReturnValue({
      data: queuedRecord,
      isLoading: false,
      isError: false,
    });

    render(<FridgeScanResultScreen />);

    expect(screen.getByText('Your chef is preparing an idea')).toBeTruthy();
    expect(screen.getByText('Diet Chef')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByTestId('fridge-scan-result-progress')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(450);
    });

    act(() => {
      jest.advanceTimersByTime(160);
    });

    const midAnimationProgress = readDisplayedProgress();
    expect(midAnimationProgress).toBeGreaterThan(0);
    expect(midAnimationProgress).toBeLessThan(7);

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(readDisplayedProgress()).toBe(7);

    act(() => {
      jest.advanceTimersByTime(30000);
    });

    expect(readDisplayedProgress()).toBeLessThanOrEqual(96);
  });

  it('renders queued results with the light chef palette in light mode', () => {
    mockTheme = {
      colors: { ...mockLightThemeColors },
      isDark: false,
    };
    mockUseLocalSearchParams.mockReturnValue({
      fridgeScanId: 'fridge-scan-1',
      selectedMode: 'diet',
      imageUri: 'file:///fridge.jpg',
    });
    mockUseFridgeScanRecord.mockReturnValue({
      data: queuedRecord,
      isLoading: false,
      isError: false,
    });

    const resolvedColors = resolveChefSurfaceColors(mockTheme.colors, false);
    const modeTheme = resolveChefModeTheme('diet', resolvedColors, false);

    render(<FridgeScanResultScreen />);

    const pendingCard = screen.getByTestId('fridge-scan-result-pending-card');
    const titleStyle = StyleSheet.flatten(
      screen.getByText('Your chef is preparing an idea').props.style,
    );
    const modePillTextStyle = StyleSheet.flatten(
      screen.getByText('Diet Chef').props.style,
    );

    expect(pendingCard.props.colors).toEqual(modeTheme.gradient);
    expect(titleStyle.color).toBe(resolvedColors.primaryText);
    expect(modePillTextStyle.color).toBe(resolvedColors.primaryText);
  });

  it('finishes the progress animation before revealing the processed meal result', () => {
    jest.useFakeTimers();
    mockUseLocalSearchParams.mockReturnValue({
      fridgeScanId: 'fridge-scan-1',
      selectedMode: 'diet',
      imageUri: 'file:///fridge.jpg',
    });

    let queryState: any = {
      data: queuedRecord,
      isLoading: false,
      isError: false,
    };
    mockUseFridgeScanRecord.mockImplementation(() => queryState);

    const { rerender } = render(<FridgeScanResultScreen />);

    act(() => {
      jest.advanceTimersByTime(450);
    });

    queryState = {
      data: {
        ...queuedRecord,
        status: 'processed',
        meal_result: mealResult,
        processed_at: '2026-04-12T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    };
    rerender(<FridgeScanResultScreen />);

    expect(screen.queryByText('Crunch bowl')).toBeNull();
    expect(screen.getByTestId('fridge-scan-result-progress')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(720);
    });

    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.queryByText('Crunch bowl')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(180);
    });

    expect(screen.getByText('Crunch bowl')).toBeTruthy();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('leaves the loading state immediately when a queued scan fails', () => {
    jest.useFakeTimers();
    mockUseLocalSearchParams.mockReturnValue({
      fridgeScanId: 'fridge-scan-1',
      selectedMode: 'diet',
      imageUri: 'file:///fridge.jpg',
    });

    let queryState: any = {
      data: queuedRecord,
      isLoading: false,
      isError: false,
    };
    mockUseFridgeScanRecord.mockImplementation(() => queryState);

    const { rerender } = render(<FridgeScanResultScreen />);

    expect(screen.getByTestId('fridge-scan-result-progress')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(450);
    });

    queryState = {
      data: {
        ...queuedRecord,
        status: 'failed',
        error_code: 'fridge_scan_analysis_failed',
        error_message: 'Provider raw failure should stay hidden',
      },
      isLoading: false,
      isError: false,
    };
    rerender(<FridgeScanResultScreen />);

    expect(screen.getByText('Result unavailable')).toBeTruthy();
    expect(screen.queryByTestId('fridge-scan-result-progress')).toBeNull();
  });
});
