import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { InteractionManager, StyleSheet } from 'react-native';
import AnalyticsScreen from '@/screens/AnalyticsScreen';
import { paywallSession } from '@/utils/paywallSession';

const mockLineChartProps: any[] = [];
const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockUseAnalytics = jest.fn();
const mockUseWindowDimensions = jest.fn();

const defaultDimensions = {
  width: 390,
  height: 844,
  scale: 3,
  fontScale: 1,
};

const compactDimensions = {
  width: 320,
  height: 568,
  scale: 2,
  fontScale: 1,
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockUseWindowDimensions(),
}));

jest.mock('react-native-chart-kit', () => {
  const ReactLocal = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    LineChart: (props: any) => {
      mockLineChartProps.push(props);
      return ReactLocal.createElement(View, { testID: 'mock-line-chart' });
    },
  };
});

jest.mock('lucide-react-native', () => ({
  AlertCircle: 'AlertCircle',
  Crown: 'Crown',
  CheckCircle2: 'CheckCircle2',
  Check: 'Check',
  ChevronLeft: 'ChevronLeft',
  X: 'X',
  Info: 'Info',
  Activity: 'Activity',
  RefreshCw: 'RefreshCw',
  Smile: 'Smile',
  Utensils: 'Utensils',
  Sparkles: 'Sparkles',
  Heart: 'Heart',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/LoadingSpinner', () => ({
  LoadingSpinner: () => 'LoadingSpinner',
}));

jest.mock('@/components/ErrorMessage', () => ({
  ErrorMessage: ({ message }: { message: string }) => {
    const ReactLocal = jest.requireActual('react');
    const { Text } = jest.requireActual('react-native');
    return ReactLocal.createElement(Text, null, `ErrorMessage: ${message}`);
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'fr-FR', textDirection: 'ltr' }],
  locale: 'fr-FR',
}));

jest.mock('@/hooks/queries', () => ({
  useAnalytics: (period: string) => mockUseAnalytics(period),
}));
jest.mock('@/hooks/queries/useAnalytics', () => ({
  useAnalytics: (period: string) => mockUseAnalytics(period),
}));

const EMPTY_STATE_TEXT = 'Commencez à scanner pour voir vos progrès ici !';
const PERIOD_LABELS = {
  days7: '7j',
  days30: '30j',
  months3: '3 Mois',
  year1: '1 An',
} as const;

const periodToDays: Record<string, number> = {
  '7days': 7,
  '30days': 30,
  '3months': 90,
  '1year': 365,
};

const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const makeDateRange = (startDate: string, days: number): string[] => {
  const [year, month, day] = startDate.split('-').map(Number);
  const baseDate = new Date(year, month - 1, day);

  return Array.from({ length: days }, (_, index) => {
    const nextDate = new Date(baseDate);
    nextDate.setDate(baseDate.getDate() + index);
    return formatDateString(nextDate);
  });
};

const makeAnalyticsData = (days: number) => {
  const dates = makeDateRange('2024-01-01', days);

  return {
    healthScoreHistory: dates.map((date, index) => ({
      date,
      value: 60 + (index % 30),
    })),
    calorieHistory: [],
    bodyCompositionHistory: [],
    bodyScoreHistory: dates.map((date, index) => ({
      date,
      bodyScore: 58 + (index % 28),
      bodyFatPercentage: 20,
      strengthIndex: 61 + (index % 16),
      postureScore: 6 + (index % 4),
      bodySymmetry: 70 + (index % 12),
      metabolicAge: 29 + (index % 5),
    })),
    faceScoreHistory: dates.map((date, index) => ({
      date,
      faceScore: 60 + (index % 24),
      skinQualityScore: 62 + (index % 20),
      symmetryPercentage: 74 + (index % 10),
      energyScore: 5 + (index % 4),
      hydrationLevel: 68 + (index % 12),
      collagenLevel: 63 + (index % 11),
    })),
    nutritionHistory: dates.map((date, index) => ({
      date,
      caloriesEstimate: 500 + index,
      proteinGrams: 20,
      carbsGrams: 35 + (index % 9),
      fatGrams: 14 + (index % 6),
      satietyIndex: 6 + (index % 3),
      nutritionScore: 62 + (index % 25),
    })),
    superScanHistory: dates.map((date, index) => ({
      date,
      globalRiskScore: 15 + (index % 20),
    })),
  };
};

const makeQueryState = (period: string, overrides: Partial<any> = {}) => ({
  data: makeAnalyticsData(periodToDays[period] || 7),
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  isRefetching: false,
  ...overrides,
});

const getLatestLineCharts = () => mockLineChartProps.slice(-3);

describe('AnalyticsScreen', () => {
  beforeEach(() => {
    mockUseAnalytics.mockClear();
    mockUseAuth.mockClear();
    mockPush.mockClear();
    mockLineChartProps.length = 0;
    mockUseWindowDimensions.mockReturnValue(defaultDimensions);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((task?: any) => {
      if (typeof task === 'function') {
        task();
      } else {
        task?.gen?.();
      }

      return {
        then: jest.fn(),
        done: jest.fn(),
        cancel: jest.fn(),
      };
    }) as any);
    paywallSession.reset();

    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'free' },
    });
  });

  it('renders loading state', () => {
    mockUseAnalytics.mockReturnValue(
      makeQueryState('7days', {
        data: null,
        isLoading: true,
        error: null,
      })
    );

    render(<AnalyticsScreen />);

    expect(mockUseAnalytics).toHaveBeenCalledWith('7days');
  });

  it('renders error state', () => {
    mockUseAnalytics.mockReturnValue(
      makeQueryState('7days', {
        data: null,
        isLoading: false,
        error: new Error('Failed to load analytics'),
      })
    );

    render(<AnalyticsScreen />);

    expect(screen.getByText('ErrorMessage: Failed to load analytics')).toBeTruthy();
    expect(screen.getAllByText(EMPTY_STATE_TEXT)).toHaveLength(3);
  });

  it('renders empty state when no data', () => {
    mockUseAnalytics.mockReturnValue(
      makeQueryState('7days', {
        data: {
          healthScoreHistory: [],
          calorieHistory: [],
          bodyCompositionHistory: [],
          bodyScoreHistory: [],
          faceScoreHistory: [],
          nutritionHistory: [],
          superScanHistory: [],
        },
      })
    );

    render(<AnalyticsScreen />);

    expect(screen.getAllByText(EMPTY_STATE_TEXT)).toHaveLength(4);
  });

  it('renders period selector buttons', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    expect(screen.getByText(PERIOD_LABELS.days7)).toBeTruthy();
    expect(screen.getByText(PERIOD_LABELS.days30)).toBeTruthy();
    expect(screen.getByText(PERIOD_LABELS.months3)).toBeTruthy();
    expect(screen.getByText(PERIOD_LABELS.year1)).toBeTruthy();
  });

  it('renders locked premium period crowns with matching gold stroke and fill', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    for (const period of ['3months', '1year']) {
      const crown = screen.getByTestId(`analytics-period-crown-${period}`);

      expect(crown.props.size).toBe(12);
      expect(crown.props.color).toBeTruthy();
      expect(crown.props.color).toBe(crown.props.fill);
    }
  });

  it('does not render premium period crowns for a premium account', () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'premium' },
    });
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    expect(screen.queryByTestId('analytics-period-crown-3months')).toBeNull();
    expect(screen.queryByTestId('analytics-period-crown-1year')).toBeNull();
  });

  it('renders charts when data is available', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    expect(screen.getByText('Score Santé')).toBeTruthy();
    expect(screen.getByText('Évolution Physique')).toBeTruthy();
    expect(screen.getByText('Score Nutrition')).toBeTruthy();
    expect(screen.getByTestId('analytics-health-metric-score')).toBeTruthy();
    expect(screen.getByTestId('analytics-body-metric-score')).toBeTruthy();
    expect(screen.getByTestId('analytics-nutrition-metric-score')).toBeTruthy();
    expect(screen.queryByTestId('analytics-summary-rail')).toBeNull();
    expect(screen.queryByText('Super Scan')).toBeNull();
    expect(screen.getAllByTestId('mock-line-chart')).toHaveLength(3);
  });

  it('uses distinct metric accent colors for default charts', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    const latestCharts = getLatestLineCharts();
    const lineColors = latestCharts.map((chartProps) =>
      chartProps.data.datasets[0].color(1),
    );
    const configColors = latestCharts.map((chartProps) =>
      chartProps.chartConfig.color(1),
    );

    expect(new Set(lineColors).size).toBe(3);
    expect(configColors).toEqual(lineColors);
    lineColors.forEach((lineColor) => {
      expect(lineColor).toMatch(/^rgba\(/);
    });
  });

  it('changes the rendered chart color when a free metric tab is selected', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    // 'calories' est gratuit et a un accent différent de 'score' (la métrique
    // par défaut) — ce qui permet de vérifier que la sélection change bien le
    // rendu. (Côté health, les 3 métriques gratuites partagent l'accent 'blue',
    // d'où le passage par nutrition.) Les onglets premium déclencheraient le
    // paywall (cf. tests de gating ci-dessous).
    const initialNutritionColor = getLatestLineCharts()[2].data.datasets[0].color(1);

    fireEvent.press(screen.getByTestId('analytics-nutrition-metric-calories'));

    const updatedNutritionColor = getLatestLineCharts()[2].data.datasets[0].color(1);

    expect(updatedNutritionColor).not.toBe(initialNutritionColor);
    expect(updatedNutritionColor).toBe(getLatestLineCharts()[2].chartConfig.color(1));
  });

  describe('premium metric gating', () => {
    it('does not switch metric when a free user taps a locked health metric (collagen)', () => {
      mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

      render(<AnalyticsScreen />);

      const initialHealthColor = getLatestLineCharts()[0].data.datasets[0].color(1);

      fireEvent.press(screen.getByTestId('analytics-health-metric-collagen'));

      // La métrique sélectionnée ne doit pas changer (toujours 'score' par défaut).
      const updatedHealthColor = getLatestLineCharts()[0].data.datasets[0].color(1);
      expect(updatedHealthColor).toBe(initialHealthColor);
    });

    it('does not switch metric when a free user taps a locked body metric (body_fat)', () => {
      mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

      render(<AnalyticsScreen />);

      const initialBodyColor = getLatestLineCharts()[1].data.datasets[0].color(1);

      fireEvent.press(screen.getByTestId('analytics-body-metric-body_fat'));

      const updatedBodyColor = getLatestLineCharts()[1].data.datasets[0].color(1);
      expect(updatedBodyColor).toBe(initialBodyColor);
    });

    it('does not switch metric when a free user taps a locked nutrition metric (satiety)', () => {
      mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

      render(<AnalyticsScreen />);

      const initialNutritionColor = getLatestLineCharts()[2].data.datasets[0].color(1);

      fireEvent.press(screen.getByTestId('analytics-nutrition-metric-satiety'));

      const updatedNutritionColor = getLatestLineCharts()[2].data.datasets[0].color(1);
      expect(updatedNutritionColor).toBe(initialNutritionColor);
    });

    it('shows the premium paywall when a free user taps a locked metric', () => {
      mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

      render(<AnalyticsScreen />);

      fireEvent.press(screen.getByTestId('analytics-health-metric-collagen'));

      expect(screen.getByText('Suivez votre progression santé')).toBeTruthy();
      expect(
        screen.getByText(
          'Débloquez les graphiques 3 mois et 1 an pour suivre votre évolution complète.',
        ),
      ).toBeTruthy();
    });

    it('lets a premium user switch to a locked health metric (collagen)', () => {
      mockUseAuth.mockReturnValue({
        userProfile: { account_tier: 'premium' },
      });
      mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

      render(<AnalyticsScreen />);

      const initialHealthColor = getLatestLineCharts()[0].data.datasets[0].color(1);

      fireEvent.press(screen.getByTestId('analytics-health-metric-collagen'));

      const updatedHealthColor = getLatestLineCharts()[0].data.datasets[0].color(1);
      expect(updatedHealthColor).not.toBe(initialHealthColor);
    });

    it('lets a premium user switch to a locked body metric (body_fat)', () => {
      mockUseAuth.mockReturnValue({
        userProfile: { account_tier: 'premium' },
      });
      mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

      render(<AnalyticsScreen />);

      const initialBodyColor = getLatestLineCharts()[1].data.datasets[0].color(1);

      fireEvent.press(screen.getByTestId('analytics-body-metric-body_fat'));

      const updatedBodyColor = getLatestLineCharts()[1].data.datasets[0].color(1);
      expect(updatedBodyColor).not.toBe(initialBodyColor);
    });

    it('lets a premium user switch to a locked nutrition metric (satiety)', () => {
      mockUseAuth.mockReturnValue({
        userProfile: { account_tier: 'premium' },
      });
      mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

      render(<AnalyticsScreen />);

      const initialNutritionColor = getLatestLineCharts()[2].data.datasets[0].color(1);

      fireEvent.press(screen.getByTestId('analytics-nutrition-metric-satiety'));

      const updatedNutritionColor = getLatestLineCharts()[2].data.datasets[0].color(1);
      expect(updatedNutritionColor).not.toBe(initialNutritionColor);
    });
  });

  it('changes period when free period button is pressed', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    fireEvent.press(screen.getByText(PERIOD_LABELS.days30));

    expect(mockUseAnalytics).toHaveBeenCalledWith('30days');
  });

  it('aggregates 30days into roughly one point every two days', async () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    fireEvent.press(screen.getByText(PERIOD_LABELS.days30));

    await waitFor(() => {
      expect(mockUseAnalytics).toHaveBeenLastCalledWith('30days');
    });

    const latestCharts = getLatestLineCharts();
    expect(latestCharts).toHaveLength(3);

    latestCharts.forEach((chartProps) => {
      expect(chartProps.data.datasets[0].data).toHaveLength(15);
      expect(chartProps.data.labels).toHaveLength(15);
    });
  });

  it('shows the premium analytics paywall through i18n keys for locked long periods', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    fireEvent.press(screen.getByText(PERIOD_LABELS.months3));

    expect(screen.getByText('Suivez votre progression santé')).toBeTruthy();
    expect(
      screen.getByText(
        'Débloquez les graphiques 3 mois et 1 an pour suivre votre évolution complète.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Voir les offres')).toBeTruthy();
  });

  it('uses non-dense X label layout on 7days', () => {
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));

    render(<AnalyticsScreen />);

    const latestCharts = getLatestLineCharts();
    expect(latestCharts).toHaveLength(3);

    latestCharts.forEach((chartProps) => {
      expect(chartProps.verticalLabelRotation).toBe(0);
      expect(chartProps.xLabelsOffset).toBe(0);
      const flattenedStyle = StyleSheet.flatten(chartProps.style);
      expect(flattenedStyle.paddingBottom).toBeUndefined();
    });
  });

  it('renders full French month labels on 3months and keeps gaps between month changes', async () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'premium' },
    });
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));
    mockUseWindowDimensions.mockReturnValue(defaultDimensions);

    render(<AnalyticsScreen />);

    fireEvent.press(screen.getByText(PERIOD_LABELS.months3));

    await waitFor(() => {
      expect(mockUseAnalytics).toHaveBeenLastCalledWith('3months');
    });

    const latestCharts = getLatestLineCharts();
    expect(latestCharts).toHaveLength(3);

    latestCharts.forEach((chartProps) => {
      const labels = chartProps.data.labels;
      const visibleLabels = labels.filter(Boolean);
      const flattenedStyle = StyleSheet.flatten(chartProps.style);

      expect(chartProps.data.datasets[0].data).toHaveLength(13);
      expect(labels).toHaveLength(13);
      expect(visibleLabels).toEqual(['Janvier', 'Février', 'Mars']);
      expect(labels.indexOf('Février') - labels.indexOf('Janvier')).toBeGreaterThan(1);
      expect(chartProps.verticalLabelRotation).toBe(45);
      expect(chartProps.xLabelsOffset).toBe(-6);
      expect(flattenedStyle.paddingBottom).toBeGreaterThan(34);
      expect(flattenedStyle.paddingBottom).not.toBe(30);
    });
  });

  it('uses a compact dense layout on 1year and hides every other month on small screens', async () => {
    mockUseAuth.mockReturnValue({
      userProfile: { account_tier: 'premium' },
    });
    mockUseAnalytics.mockImplementation((period: string) => makeQueryState(period));
    mockUseWindowDimensions.mockReturnValue(compactDimensions);

    render(<AnalyticsScreen />);

    fireEvent.press(screen.getByText(PERIOD_LABELS.year1));

    await waitFor(() => {
      expect(mockUseAnalytics).toHaveBeenLastCalledWith('1year');
    });

    const latestCharts = getLatestLineCharts();
    expect(latestCharts).toHaveLength(3);

    latestCharts.forEach((chartProps) => {
      const visibleLabels = chartProps.data.labels.filter(Boolean);
      const flattenedStyle = StyleSheet.flatten(chartProps.style);

      expect(visibleLabels).toEqual([
        'Janvier',
        'Mars',
        'Mai',
        'Juillet',
        'Septembre',
        'Novembre',
      ]);
      expect(chartProps.verticalLabelRotation).toBe(60);
      expect(chartProps.xLabelsOffset).toBe(-10);
      expect(flattenedStyle.paddingBottom).toBeGreaterThan(40);
      expect(flattenedStyle.paddingBottom).not.toBe(34);
    });
  });
});
