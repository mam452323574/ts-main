import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Platform } from 'react-native';
import HomeScreen from '@/screens/HomeScreen';
import { getGamificationAssetSource } from '@/constants/gamificationAssets';
import { BORDER_RADIUS, mixColors, withAlpha } from '@/constants/theme';

const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockThemeColors = {
  primary: '#007AFF',
  primaryLight: '#EAF3FF',
  primaryDark: '#0056B3',
  secondary: '#5856D6',
  background: '#FFFFFF',
  cardBackground: '#F2F2F7',
  surfaceMuted: '#F7F8FC',
  surfaceAccent: '#EAF3FF',
  primaryText: '#000000',
  secondaryText: '#6E6E73',
  textMuted: '#6E6E73',
  text: '#000000',
  error: '#FF3B30',
  success: '#34C759',
  gray: '#8E8E93',
  lightGray: '#D1D1D6',
  warning: '#FF9500',
  gold: '#FFD700',
  goldLight: '#FFF8E1',
  white: '#FFFFFF',
};

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('lucide-react-native', () => ({
  Sparkles: 'Sparkles',
  Crown: 'Crown',
  ChefHat: 'ChefHat',
  ChevronRight: 'ChevronRight',
  Refrigerator: 'Refrigerator',
  LineChart: 'LineChart',
  TrendingUp: 'TrendingUp',
  Sun: 'Sun',
  Moon: 'Moon',
  Heart: 'Heart',
  Check: 'Check',
  X: 'X',
  AlertCircle: 'AlertCircle',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useFocusEffect: (callback: any) => callback(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/NotificationContext', () => ({
  useNotificationContext: () => ({
    checkForAchievements: jest.fn().mockResolvedValue(undefined),
    scheduleScanReadyNotification: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: mockThemeColors,
    isDark: false,
    toggleTheme: jest.fn(),
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, options: Record<string, string | number> = {}) => {
      switch (key) {
        case 'scan_limit.auth_unready':
          return 'Connecting';
        case 'scan_limit.loading':
          return 'Loading';
        case 'scan_limit.query_error':
          return 'Quota error';
        case 'scan_limit.backend_unavailable':
          return 'Service unavailable';
        case 'scan_limit.missing_payload':
          return 'Data unavailable';
        case 'scan_limit.unavailable':
          return 'Unavailable';
        case 'home.fox_evolution.eyebrow':
          return 'Fox evolution';
        case 'home.fox_evolution.scan_total':
          return `${options.count} scans`;
        case 'home.fox_evolution.stage_label':
          return `Stage ${options.stage}`;
        case 'home.fox_evolution.stage_range':
          return `${options.start} -> ${options.end} scans`;
        case 'home.fox_evolution.stage_range_max':
          return `${options.start}+ scans`;
        case 'home.fox_evolution.stage_progress':
          return `${options.current} / ${options.total}`;
        case 'home.fox_evolution.scans_remaining':
          return `${options.count} scans before the next evolution`;
        case 'home.fox_evolution.max_stage':
          return 'Final evolution reached';
        case 'home.analytics_card_eyebrow':
          return 'Analytics';
        case 'home.analytics_card_title':
          return 'My analytics';
        case 'home.analytics_card_subtitle':
          return 'Review your latest results and progress.';
        case 'home.analytics_card_cta':
          return 'View my analytics';
        case 'home.analytics_card_empty':
          return 'Do your first scan to see your analytics.';
        case 'home.analytics_card_scan_label':
          return 'scans analyzed';
        case 'home.analytics_card_scan_count':
          return `${options.count} scans analyzed`;
        case 'home.fridge_scan.eyebrow':
          return 'Premium';
        case 'home.fridge_scan.title':
          return 'Chef';
        case 'home.fridge_scan.body':
          return 'Our chefs prepare the meal you want.';
        case 'home.fridge_scan.limit_primary':
          return '5 Chef requests';
        case 'home.fridge_scan.limit_secondary':
          return 'per day';
        case 'home.fridge_scan.cta':
          return 'Open Chef';
        case 'coach.personas.gentle_supportive.title':
          return 'Gentle Supportive';
        case 'coach.personas.strict_tough.title':
          return 'Strict Tough';
        case 'coach.personas.motivational_energetic.title':
          return 'Motivational Energetic';
        case 'coach.personas.patient_calm.title':
          return 'Patient Calm';
        case 'coach.personas.analytical_precise.title':
          return 'Analytical Precise';
        case 'coach.personas.playful_light.title':
          return 'Playful Light';
        default:
          return key;
      }
    },
  }),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', textDirection: 'ltr' }],
  locale: 'en-US',
}));

const mockUseDashboard = jest.fn();
const mockUseAllScanEligibility = jest.fn();
const mockUseFeatureFlags = jest.fn();
const mockUseGrowthExperience = jest.fn();
const mockUseGamification = jest.fn();
const mockRefetchAll = jest.fn();
const mockRefetchScanType = jest.fn();
const mockScanLimitIndicatorProps: any[] = [];
const getStyles = (style: any) => (Array.isArray(style) ? style : [style]);
const originalPlatform = Platform.OS;
const reactNativeModule =
  jest.requireActual<typeof import('react-native')>('react-native');
const useWindowDimensionsSpy = jest.spyOn(
  reactNativeModule,
  'useWindowDimensions',
);
const mockGamification = {
  scanCount: 12,
  mascotStage: 4,
  mascotFilename: 'stade_4.png',
  mascotImageUrl: 'https://example.com/gamification/stade_4.png',
};
const buildDashboardData = (gamification = mockGamification) => ({
  healthScore: 75,
  calories: { current: 1500, goal: 2000 },
  bodyfat: 20,
  gamification,
});
const buildEligibilityHookResult = (
  overrides: Partial<Record<string, any>> = {},
) => ({
  data: {},
  errors: {},
  loadingByScanType: {
    body: false,
    health: false,
    nutrition: false,
    super: false,
  },
  isLoading: false,
  isAuthReady: true,
  canQuery: true,
  refetchAll: mockRefetchAll,
  refetchScanType: mockRefetchScanType,
  ...overrides,
});

jest.mock('@/hooks/queries', () => ({
  useDashboard: () => mockUseDashboard(),
  useAllScanEligibility: () => mockUseAllScanEligibility(),
  useFeatureFlags: () => mockUseFeatureFlags(),
  useGrowthExperience: () => mockUseGrowthExperience(),
}));

jest.mock('@/contexts/GamificationContext', () => ({
  useGamification: () => mockUseGamification(),
}));

jest.mock('@/components/LoadingSpinner', () => ({
  LoadingSpinner: () => 'LoadingSpinner',
}));

jest.mock('@/components/ErrorMessage', () => ({
  ErrorMessage: ({ message }: { message: string }) =>
    `ErrorMessage: ${message}`,
}));

jest.mock('@/components/DailyStat', () => ({
  DailyStat: () => 'DailyStat',
}));

jest.mock('@/components/SuperScanIndicator', () => ({
  SuperScanIndicator: ({ isPremium, eligibility }: any) => {
    const React = require('react');
    const { Text } = require('react-native');

    if (!isPremium) {
      return <Text>super:locked</Text>;
    }

    const limit = eligibility?.limit ?? 1;
    const remaining =
      eligibility?.remaining ??
      Math.max(0, limit - (eligibility?.current_count ?? 0));

    return <Text>{`super:${remaining}/${limit}`}</Text>;
  },
}));

jest.mock('@/components/ProductCard', () => ({
  ProductCard: () => 'ProductCard',
}));

jest.mock('@/components/ScanLimitIndicator', () => ({
  ScanLimitIndicator: (props: any) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    const { eligibility } = props;
    mockScanLimitIndicatorProps.push(props);
    const limit = eligibility?.limit ?? 0;
    const remaining =
      eligibility?.remaining ??
      eligibility?.available ??
      Math.max(0, limit - (eligibility?.current_count ?? 0));
    const nextRechargeAt =
      eligibility?.next_recharge_at ??
      eligibility?.next_available_date ??
      (eligibility?.nextRechargeAt
        ? Date.parse(eligibility.nextRechargeAt)
        : undefined);
    const showTimer = limit > 0 && remaining < limit && !!nextRechargeAt;
    const timerLabel = limit > 1 ? '+1 dans 05h 42m' : 'Recharge 21h 14m';

    return (
      <View>
        <Text>{`quota:${remaining}/${limit}`}</Text>
        {showTimer ? (
          <Text testID="home-quota-timer">{timerLabel}</Text>
        ) : (
          <Text>{eligibility?.allowed === false ? 'Limite atteinte' : 'disponible'}</Text>
        )}
      </View>
    );
  },
}));

jest.mock('@/components/FadeInView', () => ({
  FadeInView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/SettingsCog', () => ({
  SettingsCog: () => 'SettingsCog',
}));

jest.mock('@/components/NotificationBell', () => ({
  NotificationBell: () => 'NotificationBell',
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockReset();
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    mockUseGamification.mockReturnValue({
      scanCount: 0,
      setScanCount: jest.fn(),
      incrementScanCount: jest.fn(),
      resetInMemoryStateOnUserChange: jest.fn(),
      isHydrated: true,
    });
    mockScanLimitIndicatorProps.length = 0;
    mockUseAuth.mockReturnValue({
      userProfile: {
        id: 'user-1',
        username: 'TestUser',
        account_tier: 'free',
        has_seen_tutorial: false,
      },
    });
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: false,
        social_comments_enabled: false,
        entry_offer_offering_id: 'entry-offer',
        rollout_percentage: 100,
      },
    });
    mockUseGrowthExperience.mockReturnValue({
      data: {
        user_id: 'user-1',
        growth_state: 'entry_offer_ready',
        entry_offer_eligible: true,
        entry_offer_shown_at: null,
        entry_offer_dismissed_at: null,
        entry_offer_claimed_at: null,
        entry_offer_offering_id: 'entry-offer',
        coach_seen_at: null,
        coach_cooldown_until: null,
        growth_state_updated_at: '2026-04-06T08:00:00.000Z',
        updated_at: '2026-04-06T08:00:00.000Z',
      },
    });
  });

  it('renders loading state', () => {
    mockUseDashboard.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: true,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);
    // Loading spinner should be shown
  });

  it('renders error state', () => {
    mockUseDashboard.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to load dashboard'),
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);
    // Error message should be displayed
  });

  it('renders dashboard when data is available', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          health: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          nutrition: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          super: {
            allowed: false,
            remaining: 0,
            limit: 0,
            current_count: 0,
            message: 'locked',
          },
        },
      }),
    );

    render(<HomeScreen />);

    expect(screen.getByText('home.items_available')).toBeTruthy();
    expect(screen.getByText('TestUser')).toBeTruthy();
    expect(screen.getByTestId('fox-evolution-hero')).toBeTruthy();
    expect(screen.getByTestId('home-fridge-scan-card')).toBeTruthy();
    expect(screen.getByTestId('home-chef-group')).toBeTruthy();
    expect(screen.getByTestId('home-chef-group-image')).toBeTruthy();
    expect(screen.queryByTestId('home-chef-row')).toBeNull();
    expect(screen.queryByTestId('home-chef-gourmand-image')).toBeNull();
    expect(screen.queryByTestId('home-chef-dietetique-image')).toBeNull();
    expect(screen.queryByTestId('home-chef-sportif-image')).toBeNull();
    expect(screen.getByText('Chef')).toBeTruthy();
    expect(
      screen.getByText('Our chefs prepare the meal you want.'),
    ).toBeTruthy();
    expect(screen.getByText('5 Chef requests')).toBeTruthy();
    expect(screen.getByText('per day')).toBeTruthy();
    expect(screen.queryByText('5 Chef requests / day')).toBeNull();
    expect(screen.getByTestId('home-fridge-scan-cta')).toBeTruthy();
    expect(screen.getAllByText('quota:3/3')).toHaveLength(3);
    expect(screen.getByText('super:locked')).toBeTruthy();
    expect(screen.queryByText('...')).toBeNull();
    expect(screen.queryByText('home.hero_title')).toBeNull();
    expect(screen.queryByText('CircularProgress')).toBeNull();
  });

  it('shows quota and direct recharge timers in scan cards without tapping', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          health: {
            success: true,
            allowed: false,
            scanType: 'health',
            remaining: 0,
            available: 0,
            used: 1,
            current_count: 1,
            limit: 1,
            message: 'Limite atteinte',
            next_recharge_at: Date.now() + 21 * 60 * 60 * 1000,
          },
          body: {
            success: true,
            allowed: true,
            scanType: 'body',
            remaining: 2,
            available: 2,
            used: 1,
            current_count: 1,
            limit: 3,
            message: 'OK',
            nextRechargeAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          },
          nutrition: {
            success: true,
            allowed: true,
            scanType: 'nutrition',
            remaining: 3,
            available: 3,
            used: 0,
            current_count: 0,
            limit: 3,
            message: 'OK',
          },
          super: {
            success: true,
            allowed: false,
            remaining: 0,
            limit: 0,
            current_count: 0,
            message: 'locked',
          },
        },
      }),
    );

    render(<HomeScreen />);

    expect(screen.getByText('quota:0/1')).toBeTruthy();
    expect(screen.getByText('Recharge 21h 14m')).toBeTruthy();
    expect(screen.getByText('quota:2/3')).toBeTruthy();
    expect(screen.getByText('+1 dans 05h 42m')).toBeTruthy();
    expect(screen.getByText('quota:3/3')).toBeTruthy();
    expect(screen.queryByText('...')).toBeNull();
  });

  it('refetches only the completed scan quota when a card timer ends', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    const nextRechargeAt = Date.now() + 1000;
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          health: {
            success: true,
            allowed: false,
            scanType: 'health',
            remaining: 0,
            available: 0,
            used: 1,
            current_count: 1,
            limit: 1,
            message: 'Limite atteinte',
            next_recharge_at: nextRechargeAt,
          },
          body: {
            success: true,
            allowed: true,
            scanType: 'body',
            remaining: 3,
            available: 3,
            used: 0,
            current_count: 0,
            limit: 3,
            message: 'OK',
          },
          nutrition: {
            success: true,
            allowed: true,
            scanType: 'nutrition',
            remaining: 3,
            available: 3,
            used: 0,
            current_count: 0,
            limit: 3,
            message: 'OK',
          },
          super: {
            success: true,
            allowed: false,
            remaining: 0,
            limit: 0,
            current_count: 0,
            message: 'locked',
          },
        },
      }),
    );

    render(<HomeScreen />);
    mockRefetchAll.mockClear();
    mockRefetchScanType.mockClear();

    const healthIndicatorProps = mockScanLimitIndicatorProps.find(
      (props) => props.eligibility?.scanType === 'health',
    );
    expect(healthIndicatorProps?.onTimerComplete).toEqual(expect.any(Function));

    act(() => {
      healthIndicatorProps.onTimerComplete();
      healthIndicatorProps.onTimerComplete();
    });

    expect(mockRefetchScanType).toHaveBeenCalledTimes(1);
    expect(mockRefetchScanType).toHaveBeenCalledWith('health');
    expect(mockRefetchAll).not.toHaveBeenCalled();
  });

  it('renders explicit loading text instead of dots while a scan quota is resolving', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          nutrition: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          super: {
            allowed: false,
            remaining: 0,
            limit: 0,
            current_count: 0,
            message: 'locked',
          },
        },
        loadingByScanType: {
          body: false,
          health: true,
          nutrition: false,
          super: false,
        },
      }),
    );

    render(<HomeScreen />);

    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.queryByText('...')).toBeNull();
  });

  it('renders explicit unavailable text instead of dots when a scan quota fails', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          health: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          super: {
            allowed: false,
            remaining: 0,
            limit: 0,
            current_count: 0,
            message: 'locked',
          },
        },
        errors: {
          nutrition: new Error('failed'),
        },
      }),
    );

    render(<HomeScreen />);

    expect(screen.getByText('Quota error')).toBeTruthy();
    expect(screen.queryByText('...')).toBeNull();
  });

  it('renders admin quotas numerically on the home screen', () => {
    mockUseAuth.mockReturnValue({
      userProfile: {
        id: 'user-1',
        username: 'AdminUser',
        account_tier: 'admin',
        has_seen_tutorial: false,
      },
    });
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: {
            allowed: true,
            remaining: 20,
            limit: 20,
            current_count: 0,
            message: 'OK',
          },
          health: {
            allowed: true,
            remaining: 20,
            limit: 20,
            current_count: 0,
            message: 'OK',
          },
          nutrition: {
            allowed: true,
            remaining: 20,
            limit: 20,
            current_count: 0,
            message: 'OK',
          },
          super: {
            allowed: true,
            remaining: 20,
            limit: 20,
            current_count: 0,
            message: 'OK',
          },
        },
      }),
    );

    render(<HomeScreen />);

    expect(screen.getByText('AdminUser')).toBeTruthy();
    expect(screen.getAllByText('quota:20/20')).toHaveLength(3);
    expect(screen.getByText('super:20/20')).toBeTruthy();
    expect(screen.queryByText('...')).toBeNull();
  });

  it('displays username from profile', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByText('TestUser')).toBeTruthy();
  });

  it('uses responsive Android light card shells on narrow layouts', () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    useWindowDimensionsSpy.mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 1,
    });

    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: {
        body: { allowed: true, remaining: 3, limit: 3, current_count: 0 },
        health: { allowed: true, remaining: 3, limit: 3, current_count: 0 },
        nutrition: { allowed: true, remaining: 3, limit: 3, current_count: 0 },
        super: { allowed: false, remaining: 0, message: 'locked' },
      },
      isLoading: false,
      refetchAll: jest.fn(),
    });

    const { getAllByTestId, getByTestId } = render(<HomeScreen />);

    const cardShellStyles = getStyles(
      getAllByTestId('scan-limit-card-shell')[0].props.style,
    );
    expect(cardShellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 140,
          elevation: 2,
        }),
      ]),
    );

    const bannerShellStyles = getStyles(
      getByTestId('home-premium-banner-shell').props.style,
    );
    const bannerSurfaceStyles = getStyles(
      getByTestId('home-premium-banner-surface').props.style,
    );

    expect(bannerShellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elevation: 4,
        }),
      ]),
    );
    expect(bannerSurfaceStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          overflow: 'hidden',
          borderWidth: 1,
        }),
      ]),
    );
  });

  it('renders the stage 0 fox evolution hero with empty stage progress', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData({
        scanCount: 0,
        mascotStage: 0,
        mascotFilename: 'image_vide.png',
        mascotImageUrl: 'https://example.com/gamification/image_vide.png',
      }),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByTestId('fox-evolution-hero')).toBeTruthy();
    expect(screen.getByText('Stage 0')).toBeTruthy();
    expect(screen.queryByTestId('fox-evolution-supporting-text')).toBeNull();
    expect(screen.queryByText('1 scans before the next evolution')).toBeNull();
    expect(screen.getByText('0 -> 1 scans')).toBeTruthy();
    expect(screen.getByText('0 / 1')).toBeTruthy();
    expect(
      screen.getByTestId('fox-evolution-progress-fill').props.style,
    ).toEqual(expect.arrayContaining([{ width: '0%' }]));
    expect(screen.getByTestId('fox-evolution-mascot-image').props.source).toBe(
      getGamificationAssetSource('stade_0.png'),
    );
  });

  it('uses the higher local scan count when backend gamification lags behind', () => {
    mockUseGamification.mockReturnValue({
      scanCount: 30,
      setScanCount: jest.fn(),
      incrementScanCount: jest.fn(),
      resetInMemoryStateOnUserChange: jest.fn(),
      isHydrated: true,
    });
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData({
        scanCount: 0,
        mascotStage: 0,
        mascotFilename: 'image_vide.png',
        mascotImageUrl: 'https://example.com/gamification/image_vide.png',
      }),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByTestId('fox-evolution-hero')).toBeTruthy();
    expect(screen.getByText('Stage 6')).toBeTruthy();
    expect(screen.getByTestId('fox-evolution-mascot-image').props.source).toBe(
      getGamificationAssetSource('stade_6.png'),
    );
  });

  it('uses scan count as the hero source of truth when backend mascot metadata drifts', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData({
        scanCount: 103,
        mascotStage: 4,
        mascotFilename: 'stade_4.png',
        mascotImageUrl: 'https://example.com/gamification/stade_4.png',
      }),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByText('Stage 8')).toBeTruthy();
    expect(screen.queryByTestId('fox-evolution-supporting-text')).toBeNull();
    expect(screen.queryByText('47 scans before the next evolution')).toBeNull();
    expect(screen.getByText('100 -> 150 scans')).toBeTruthy();
    expect(screen.getByText('3 / 50')).toBeTruthy();
    expect(
      screen.getByTestId('fox-evolution-progress-fill').props.style,
    ).toEqual(expect.arrayContaining([{ width: '6%' }]));
    expect(screen.getByTestId('fox-evolution-mascot-image').props.source).toBe(
      getGamificationAssetSource('stade_8.png'),
    );
  });

  it('renders a full bar and final message at the last stage', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData({
        scanCount: 240,
        mascotStage: 10,
        mascotFilename: 'stade_10.png',
        mascotImageUrl: 'https://example.com/gamification/stade_10.png',
      }),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByText('Stage 10')).toBeTruthy();
    expect(screen.getByText('Final evolution reached')).toBeTruthy();
    expect(screen.getByTestId('fox-evolution-supporting-text')).toBeTruthy();
    expect(screen.getByText('200+ scans')).toBeTruthy();
    expect(screen.queryByTestId('fox-evolution-stage-progress')).toBeNull();
    expect(
      screen.getByTestId('fox-evolution-progress-fill').props.style,
    ).toEqual(expect.arrayContaining([{ width: '100%' }]));
    expect(screen.getByTestId('fox-evolution-mascot-image').props.source).toBe(
      getGamificationAssetSource('stade_10.png'),
    );
  });

  it('uses the updated compact hero mascot sizes on narrow mobile widths', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 360,
      height: 780,
      scale: 3,
      fontScale: 1,
    });
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData({
        scanCount: 30,
        mascotStage: 6,
        mascotFilename: 'stade_6.png',
        mascotImageUrl: 'https://example.com/gamification/stade_6.png',
      }),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    const mascotShellStyles = getStyles(
      screen.getByTestId('fox-evolution-mascot-shell').props.style,
    );
    const mascotImageStyles = getStyles(
      screen.getByTestId('fox-evolution-mascot-image').props.style,
    );

    expect(mascotShellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 232,
          height: 232,
        }),
      ]),
    );
    expect(mascotImageStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 210,
          height: 210,
        }),
      ]),
    );
  });

  it('uses the updated hero mascot sizes on standard phone widths and preserves contain fitting', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData({
        scanCount: 30,
        mascotStage: 6,
        mascotFilename: 'stade_6.png',
        mascotImageUrl: 'https://example.com/gamification/stade_6.png',
      }),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    const mascotShellStyles = getStyles(
      screen.getByTestId('fox-evolution-mascot-shell').props.style,
    );
    const mascotImage = screen.getByTestId('fox-evolution-mascot-image');
    const mascotImageStyles = getStyles(mascotImage.props.style);

    expect(mascotShellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 264,
          height: 264,
        }),
      ]),
    );
    expect(mascotImageStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 240,
          height: 240,
        }),
      ]),
    );
    expect(mascotImage.props.contentFit).toBe('contain');
  });

  it('uses the updated hero mascot sizes on tablet widths', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 768,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData({
        scanCount: 30,
        mascotStage: 6,
        mascotFilename: 'stade_6.png',
        mascotImageUrl: 'https://example.com/gamification/stade_6.png',
      }),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    const mascotShellStyles = getStyles(
      screen.getByTestId('fox-evolution-mascot-shell').props.style,
    );
    const mascotImageStyles = getStyles(
      screen.getByTestId('fox-evolution-mascot-image').props.style,
    );

    expect(mascotShellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 304,
          height: 304,
        }),
      ]),
    );
    expect(mascotImageStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 280,
          height: 280,
        }),
      ]),
    );
  });

  it('shows and opens the analytics card from home', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    const analyticsCard = screen.getByTestId('home-analytics-card');
    const analyticsCardSurfaceStyles = getStyles(
      screen.getByTestId('home-analytics-card-surface').props.style,
    );
    const analyticsCtaStyles = getStyles(
      screen.getByTestId('home-analytics-cta').props.style,
    );
    const analyticsTitle = screen.getByText('My analytics');

    expect(analyticsCard).toBeTruthy();
    expect(analyticsCardSurfaceStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minHeight: 462,
          borderRadius: BORDER_RADIUS.hero,
          backgroundColor: mixColors(
            mockThemeColors.cardBackground,
            mockThemeColors.primary,
            0.05,
          ),
          borderColor: withAlpha(
            mixColors(
              mockThemeColors.primaryDark,
              mockThemeColors.white,
              0.2,
            ),
            0.18,
          ),
        }),
      ]),
    );
    expect(analyticsTitle).toBeTruthy();
    expect(analyticsTitle).toHaveStyle({
      color: mixColors(
        mockThemeColors.primaryText,
        mockThemeColors.primaryDark,
        0.12,
      ),
    });
    expect(screen.getByText('Review your latest results and progress.')).toBeTruthy();
    expect(screen.getByText('View my analytics')).toBeTruthy();
    expect(screen.getByTestId('home-analytics-scan-count').props.children).toBe(12);
    expect(screen.getByTestId('home-analytics-scan-label').props.children).toBe(
      'scans analyzed',
    );
    expect(screen.getByTestId('home-analytics-coach-image').props.resizeMode).toBe(
      'contain',
    );
    expect(screen.getByTestId('home-analytics-curve')).toBeTruthy();
    const arrowHead = screen.getByTestId('home-analytics-arrow-head');
    expect(arrowHead).toBeTruthy();
    expect(arrowHead.props.d).toContain('L 200 12.5');
    expect(arrowHead.props.stroke).toBe('url(#analyticsCurveStroke)');
    expect(arrowHead.props.fill).toBe('none');
    expect(screen.queryByTestId('home-analytics-dashboard-preview')).toBeNull();
    expect(screen.queryByTestId('home-analytics-progress-rail')).toBeNull();
    expect(screen.queryByTestId('home-analytics-empty')).toBeNull();
    expect(screen.getByTestId('home-analytics-cta')).toBeTruthy();
    expect(analyticsCtaStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: mixColors(
            mockThemeColors.white,
            mockThemeColors.primary,
            0.22,
          ),
          borderColor: withAlpha(
            mixColors(
              mockThemeColors.primaryDark,
              mockThemeColors.white,
              0.2,
            ),
            0.18,
          ),
        }),
      ]),
    );
    expect(screen.queryByTestId('home-coach-card')).toBeNull();
    expect(screen.queryByText('AI')).toBeNull();

    fireEvent.press(analyticsCard);

    expect(mockPush).toHaveBeenCalledWith('/analytics');
  });

  it('opens the dedicated fridge scan route from the home CTA', () => {
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue(
      buildEligibilityHookResult({
        data: {
          body: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          health: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          nutrition: {
            allowed: true,
            remaining: 3,
            limit: 3,
            current_count: 0,
            message: 'OK',
          },
          super: {
            allowed: false,
            remaining: 0,
            limit: 0,
            current_count: 0,
            message: 'locked',
          },
        },
      }),
    );

    render(<HomeScreen />);

    const chefSurfaceStyles = getStyles(
      screen.getByTestId('home-fridge-scan-surface').props.style,
    );
    const chefCtaStyles = getStyles(
      screen.getByTestId('home-fridge-scan-cta').props.style,
    );
    const chefTitle = screen.getByText('Chef');

    expect(chefSurfaceStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minHeight: 462,
          backgroundColor: mixColors(
            mockThemeColors.cardBackground,
            mockThemeColors.gold,
            0.08,
          ),
          borderColor: withAlpha(
            mixColors(
              mockThemeColors.gold,
              mockThemeColors.white,
              0.58,
            ),
            0.22,
          ),
        }),
      ]),
    );
    expect(chefTitle).toHaveStyle({
      color: mixColors(
        mockThemeColors.primaryText,
        mockThemeColors.warning,
        0.12,
      ),
    });
    expect(chefCtaStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: mixColors(
            mockThemeColors.warning,
            mockThemeColors.white,
            0.78,
          ),
          borderColor: withAlpha(
            mixColors(
              mockThemeColors.gold,
              mockThemeColors.white,
              0.58,
            ),
            0.26,
          ),
        }),
      ]),
    );

    fireEvent.press(screen.getByTestId('home-fridge-scan-card'));

    expect(mockPush).toHaveBeenCalledWith('/scan-frigo');
  });

  it('shows the analytics card for authenticated premium users even when core flags are false', () => {
    mockUseAuth.mockReturnValue({
      userProfile: {
        id: 'user-1',
        username: 'TestUser',
        account_tier: 'premium',
        coach_persona_key: 'analytical_precise',
        has_seen_tutorial: false,
      },
    });
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByTestId('home-analytics-card')).toBeTruthy();
    expect(screen.getByTestId('home-analytics-cta')).toBeTruthy();
    expect(screen.queryByTestId('home-coach-card')).toBeNull();
  });

  it('auto-opens the entry offer once for eligible onboarded users', async () => {
    mockUseAuth.mockReturnValue({
      userProfile: {
        id: 'user-1',
        username: 'TestUser',
        account_tier: 'free',
        has_seen_tutorial: true,
      },
    });
    mockUseFeatureFlags.mockReturnValue({
      data: {
        social_enabled: false,
        coach_enabled: false,
        entry_offer_enabled: true,
        social_comments_enabled: false,
        entry_offer_offering_id: 'entry-offer',
        rollout_percentage: 100,
      },
    });
    mockUseDashboard.mockReturnValue({
      data: buildDashboardData(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseAllScanEligibility.mockReturnValue({
      data: null,
      isLoading: false,
      refetchAll: jest.fn(),
    });

    render(<HomeScreen />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/entry-offer');
    });
  });
});
