import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import CoachScreen from '@/screens/CoachScreen';
import { SPACING } from '@/constants/theme';
import { CoachServiceError } from '@/services/coach';
import { resolveCoachQuestionText } from '@/shared/coachQuestions';
import { encodeScanCoachIntentParam } from '@/shared/scanCoachIntent';

const mockMutateAsync = jest.fn();
const mockResetCoachGeneration = jest.fn();
const mockUseCoachEntries = jest.fn();
const mockUseCoachGeneration = jest.fn();
const mockUseCoachHistorySummary = jest.fn();
const mockUseCoachQuota = jest.fn();
const mockUseCoachScreenSnapshot = jest.fn();
const mockUseLatestReadyCoachEntry = jest.fn();
const mockUseCoachScans = jest.fn();
const mockUseQuery = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();
const mockSetQueriesData = jest.fn();
const mockTrackEvent = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterDismiss = jest.fn();
const mockRouterCanDismiss = jest.fn();
const mockLocalSearchParams = jest.fn();
const mockUpdateCoachPersona = jest.fn();
const mockShowAlert = jest.fn();
const mockRefetchCoachQuota = jest.fn();
const mockLocaleState = { locale: 'fr' };
const mockRecentCoachScans = [
  {
    id: 'scan-1',
    captured_at: '2026-04-06T10:05:00.000Z',
  },
];
const DEFAULT_FREE_COACH_QUESTION =
  'Sur quoi je dois me concentrer avant ma seance ce soir ?';
const mockedLanguageContext = jest.requireMock('@/contexts/LanguageContext') as {
  useLanguage: () => {
    t: (key: string, params?: Record<string, unknown>) => string;
    language: string;
    locale: string;
    changeLanguage: jest.Mock;
  };
};
const baseUseLanguage = mockedLanguageContext.useLanguage;
jest.spyOn(mockedLanguageContext, 'useLanguage').mockImplementation(() => ({
  ...baseUseLanguage(),
  language: mockLocaleState.locale,
  locale: mockLocaleState.locale,
}));

function collectTestIds(node: any, acc: string[] = []): string[] {
  if (!node) {
    return acc;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, acc));
    return acc;
  }

  if (node.props?.testID) {
    acc.push(node.props.testID);
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => collectTestIds(child, acc));
  }

  return acc;
}

function createCoachEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    title: 'Saved coach guidance',
    body: 'Keep your hydration steady and sleep on time.',
    disclaimer:
      'Wellness guidance only. This is not a diagnosis or medical advice.',
    persona_key: 'gentle_supportive',
    cta_label: null,
    cta_route: null,
    created_at: '2026-04-06T08:00:00.000Z',
    generated_at: '2026-04-06T08:00:00.000Z',
    source: 'n8n',
    status: 'ready',
    ...overrides,
  };
}

function enterCoachQuestion(
  rendered: ReturnType<typeof render>,
  question = DEFAULT_FREE_COACH_QUESTION,
) {
  fireEvent.changeText(
    rendered.getByTestId('coach-settings-inline-question-input'),
    question,
  );
}

function expectActionComposerSummary(
  rendered: ReturnType<typeof render>,
  personaTitle = 'Noah',
) {
  expect(
    rendered.getByTestId('coach-action-composer-prompt-title').props.children,
  ).toBe('Question au coach');
  expect(
    rendered.getByTestId('coach-action-composer-persona-title').props.children,
  ).toBe(personaTitle);
}

function getScopedConsoleCalls(
  consoleSpy: jest.SpyInstance,
  scope: string,
) {
  return consoleSpy.mock.calls.filter((call) => call[0] === scope);
}

let mockCoachEntriesState: {
  data: Record<string, unknown>[] | undefined;
  error: Error | null;
  isLoading?: boolean;
  isFetching: boolean;
  refetch: jest.Mock;
};

let mockCoachGenerationState: {
  data: Record<string, unknown> | null;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
};

let mockCoachQuotaState: {
  data: Record<string, unknown> | null;
  error: Error | null;
  isLoading?: boolean;
  isFetching: boolean;
  refetch: jest.Mock;
};

let mockAuthState = {
  user: { id: 'user-1' },
  userProfile: {
    id: 'user-1',
    account_tier: 'free',
    coach_persona_key: 'gentle_supportive',
  },
  updateCoachPersona: (...args: unknown[]) => mockUpdateCoachPersona(...args),
};

function isRenderableReadyEntry(
  entry: Record<string, unknown>,
  personaKey?: unknown,
) {
  return (
    (personaKey == null || entry.persona_key === personaKey) &&
    (entry.status ?? 'ready') === 'ready' &&
    typeof entry.title === 'string' &&
    entry.title.trim().length > 0 &&
    typeof entry.body === 'string' &&
    entry.body.trim().length > 0
  );
}

function buildLatestReadyEntry(options?: { personaKey?: unknown }) {
  return (
    (mockCoachEntriesState.data ?? []).find((entry) =>
      isRenderableReadyEntry(entry, options?.personaKey),
    ) ?? null
  );
}

function buildHistorySummary(excludeEntryId?: string | null) {
  const historyEntries = (mockCoachEntriesState.data ?? []).filter((entry) => {
    const isReadyRenderable =
      (entry.status ?? 'ready') === 'ready' &&
      typeof entry.title === 'string' &&
      entry.title.trim().length > 0 &&
      typeof entry.body === 'string' &&
      entry.body.trim().length > 0;

    return isReadyRenderable && entry.id !== (excludeEntryId ?? null);
  }, 20_000);

  return {
    total_count: historyEntries.length,
    latest_entry_at:
      (historyEntries[0]?.generated_at as string | undefined) ??
      (historyEntries[0]?.created_at as string | undefined) ??
      null,
  };
}

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
    setQueryData: (...args: unknown[]) => mockSetQueryData(...args),
    setQueriesData: (...args: unknown[]) => mockSetQueriesData(...args),
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: (...args: unknown[]) => mockLocalSearchParams(...args),
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    back: (...args: unknown[]) => mockRouterBack(...args),
    dismiss: (...args: unknown[]) => mockRouterDismiss(...args),
    canDismiss: (...args: unknown[]) => mockRouterCanDismiss(...args),
  }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(callback, [callback]);
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/hooks/queries', () => ({
  useCoachEntries: (...args: unknown[]) => mockUseCoachEntries(...args),
  useCoachGeneration: (...args: unknown[]) => mockUseCoachGeneration(...args),
  useCoachHistorySummary: (...args: unknown[]) =>
    mockUseCoachHistorySummary(...args),
  useCoachQuota: (...args: unknown[]) => mockUseCoachQuota(...args),
  getCoachQuotaQueryKey: (userId?: string | null) => [
    'coachQuota',
    userId ?? 'anonymous',
  ],
  useLatestReadyCoachEntry: (...args: unknown[]) =>
    mockUseLatestReadyCoachEntry(...args),
  useCoachScans: (...args: unknown[]) => mockUseCoachScans(...args),
}));
jest.mock('@/hooks/queries/useCoachGeneration', () => ({
  useCoachGeneration: (...args: unknown[]) => mockUseCoachGeneration(...args),
}));
jest.mock('@/hooks/queries/useCoachScreenSnapshot', () => ({
  COACH_SCREEN_SNAPSHOT_QUERY_KEY: ['coachScreenSnapshot'],
  useCoachScreenSnapshot: (...args: unknown[]) => mockUseCoachScreenSnapshot(...args),
}));
jest.mock('@/hooks/queries/useCoachConversationQuota', () => ({
  useCoachConversationQuota: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    error: null,
  }),
}));

jest.mock('@/services/growthExperience', () => ({
  markCoachSeen: jest.fn(),
}));

jest.mock('@/services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    alertElement: null,
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
  }),
}));

// Stub React Native's Animated APIs to avoid the
// "Unable to locate attached view in the native tree" error triggered when
// TouchableOpacity tries to animate disabled state changes during async tests.
const animatedStub = () =>
  ({
    start: (cb?: (result: { finished: boolean }) => void) => {
      if (cb) {
        cb({ finished: true });
      }
    },
    stop: () => undefined,
    reset: () => undefined,
  }) as never;

// PerfectTimingGame chains animate() recursively from the finished callback;
// combined with the synchronous animatedStub above this blows the call stack.
// Stub it out — the test only cares that *some* loading mini-game renders.
jest.mock('@/components/loading/miniGames/PerfectTimingGame', () => ({
  PerfectTimingGame: () => null,
}));
jest.spyOn(require('react-native').Animated, 'timing').mockImplementation(animatedStub);
jest.spyOn(require('react-native').Animated, 'spring').mockImplementation(animatedStub);
jest
  .spyOn(require('react-native').Animated, 'parallel')
  .mockImplementation(animatedStub);
jest
  .spyOn(require('react-native').Animated, 'sequence')
  .mockImplementation(animatedStub);
jest.spyOn(require('react-native').Animated, 'loop').mockImplementation(animatedStub);

describe('CoachScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResetCoachGeneration.mockImplementation(() => {
      mockCoachGenerationState = {
        data: null,
        isPending: false,
        isError: false,
        error: null,
      };
    });
    mockLocaleState.locale = 'fr';
    mockRouterCanDismiss.mockReturnValue(false);
    mockLocalSearchParams.mockReturnValue({});
    mockAuthState = {
      user: { id: 'user-1' },
      userProfile: {
        id: 'user-1',
        account_tier: 'free',
        coach_persona_key: 'gentle_supportive',
      },
      updateCoachPersona: (...args: unknown[]) =>
        mockUpdateCoachPersona(...args),
    };
    mockCoachEntriesState = {
      data: [createCoachEntry()],
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockCoachGenerationState = {
      data: null,
      isPending: false,
      isError: false,
      error: null,
    };
    mockCoachQuotaState = {
      data: {
        account_tier: 'free',
        limit: 1,
        used_count: 0,
        available: 1,
        next_recharge_at: null,
        unlimited: false,
        window_seconds: 86400,
        as_of: '2026-04-06T08:00:00.000Z',
      },
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: mockRefetchCoachQuota,
    };
    mockUseQuery.mockReturnValue({
      data: mockRecentCoachScans,
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    mockUseCoachScans.mockReturnValue({
      data: mockRecentCoachScans,
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    mockUseCoachEntries.mockImplementation(() => mockCoachEntriesState);
    mockUseCoachQuota.mockImplementation(() => mockCoachQuotaState);
    mockUseCoachHistorySummary.mockImplementation(
      ({ excludeEntryId }: { excludeEntryId?: string | null }) => ({
        data: buildHistorySummary(excludeEntryId),
        error: null,
        isLoading: false,
        isFetching: false,
        refetch: jest.fn(),
      }),
    );
    mockUseCoachScreenSnapshot.mockImplementation(
      (options?: { excludeEntryId?: string | null }) => {
        const scansQuery = mockUseCoachScans();
        const latestReadyQuery = mockUseLatestReadyCoachEntry({
          personaKey: mockAuthState.userProfile.coach_persona_key,
        });
        const historySummaryQuery = mockUseCoachHistorySummary({
          excludeEntryId: options?.excludeEntryId,
        });
        const snapshotError =
          mockCoachEntriesState.error ??
          mockCoachQuotaState.error ??
          scansQuery?.error ??
          latestReadyQuery?.error ??
          historySummaryQuery?.error ??
          null;
        const isLoading =
          Boolean(mockCoachEntriesState.isLoading) ||
          Boolean(mockCoachQuotaState.isLoading) ||
          Boolean(scansQuery?.isLoading) ||
          Boolean(latestReadyQuery?.isLoading) ||
          Boolean(historySummaryQuery?.isLoading);
        const isFetching =
          Boolean(mockCoachEntriesState.isFetching) ||
          Boolean(mockCoachQuotaState.isFetching) ||
          Boolean(scansQuery?.isFetching) ||
          Boolean(latestReadyQuery?.isFetching) ||
          Boolean(historySummaryQuery?.isFetching);

        return {
          data: {
            entries: mockCoachEntriesState.data,
            quota: mockCoachQuotaState.data,
            recentScans:
              scansQuery && 'data' in scansQuery ? scansQuery.data : [],
            latestReadyEntry:
              latestReadyQuery && 'data' in latestReadyQuery
                ? latestReadyQuery.data
                : null,
            historySummary:
              historySummaryQuery && 'data' in historySummaryQuery
                ? historySummaryQuery.data
                : buildHistorySummary(options?.excludeEntryId),
          },
          error: snapshotError,
          isLoading,
          isFetching,
          isFetched: !isLoading,
          isStale: false,
          refetch: mockRefetchCoachQuota,
        };
      },
    );
    mockUseLatestReadyCoachEntry.mockImplementation(
      (options?: { personaKey?: unknown }) => ({
        data: buildLatestReadyEntry(options),
        error: null,
        isLoading: false,
        isFetching: false,
        refetch: jest.fn(),
      }),
    );
    mockUseCoachGeneration.mockImplementation(() => ({
      ...mockCoachGenerationState,
      mutateAsync: (...args: unknown[]) => mockMutateAsync(...args),
      reset: (...args: unknown[]) => mockResetCoachGeneration(...args),
    }));
    mockMutateAsync.mockResolvedValue({
      success: true,
      entry_id: 'entry-new',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'ready',
      title: 'Fresh guidance',
      body: 'Keep showing up this week.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    });
    mockUpdateCoachPersona.mockResolvedValue(undefined);
  });

  it('renders inline coach settings with the full persona rail at cold start', () => {
    render(<CoachScreen />);
    const personaRail = screen.getByTestId('coach-settings-inline-persona-rail');
    const personaRailViewportStyle = StyleSheet.flatten(personaRail.props.style);
    const personaRailContentStyle = StyleSheet.flatten(
      personaRail.props.contentContainerStyle,
    );

    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-card')).toBeNull();
    expect(screen.getByTestId('coach-back-button')).toBeTruthy();
    expect(screen.queryByTestId('coach-hero')).toBeNull();
    expect(personaRailViewportStyle.marginLeft).toBe(-SPACING.page);
    expect(personaRailViewportStyle.marginRight).toBe(-SPACING.page);
    expect(personaRailContentStyle.gap).toBe(SPACING.sm);
    expect(personaRailContentStyle.paddingLeft).toBe(SPACING.page);
    expect(personaRailContentStyle.paddingRight).toBe(SPACING.page);

    expect(
      screen.getByTestId('coach-settings-inline-persona-gentle_supportive'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-strict_tough'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('coach-settings-inline-persona-gentle_supportive-lock-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId('coach-settings-inline-persona-strict_tough-lock-badge'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-strict_tough-lock-icon'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-strict_tough-portrait-image'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-motivational_energetic'),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        'coach-settings-inline-persona-motivational_energetic-portrait-image',
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-patient_calm'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-patient_calm-portrait-image'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-analytical_precise'),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        'coach-settings-inline-persona-analytical_precise-portrait-image',
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-playful_light'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-playful_light-portrait-image'),
    ).toBeTruthy();
  });

  it('keeps free_question hidden from presets and submits typed free text', async () => {
    const screen = render(<CoachScreen />);

    expect(
      screen.queryByTestId('coach-settings-inline-mode-picker-card-free_question'),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        'coach-settings-inline-mode-picker-suggestions-free_question',
      ),
    ).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    enterCoachQuestion(screen);
    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          questionKey: null,
          questionText: DEFAULT_FREE_COACH_QUESTION,
        }),
      );
    });
  });

  it('shows a clear alert when asking without any selected question', () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(
      'Fais une sélection',
      'Choisis une question ou écris ta demande avant de demander un conseil.',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.any(String),
        }),
      ]),
      expect.anything(),
      expect.objectContaining({ emoji: null }),
    );
  });

  it('shows a clear alert when the selected free question is empty', () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(screen.getByTestId('coach-settings-inline-question-input-card'));
    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(
      'Écris ta demande',
      'Ajoute une question avant de demander un conseil.',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.any(String),
        }),
      ]),
      expect.anything(),
      expect.objectContaining({ emoji: null }),
    );
  });

  it('keeps the latest guidance ahead of history, personas, and prompts', () => {
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        createCoachEntry({
          id: 'entry-current',
          title: 'Current guidance',
          body: 'Stay steady this week.',
          created_at: '2026-04-08T10:00:00.000Z',
          generated_at: '2026-04-08T10:00:00.000Z',
        }),
        createCoachEntry({
          id: 'entry-history',
          title: 'Older guidance',
          body: 'Keep the plan simple.',
          created_at: '2026-04-04T08:00:00.000Z',
          generated_at: '2026-04-04T08:00:00.000Z',
        }),
      ],
    };

    render(<CoachScreen />);
    const testIds = collectTestIds(screen.toJSON());

    expect(screen.getByTestId('coach-latest-guidance-section')).toBeTruthy();
    expect(screen.getByTestId('coach-history-icon-button')).toBeTruthy();
    expect(screen.getByTestId('coach-action-bar')).toBeTruthy();
    expect(testIds.indexOf('coach-latest-guidance-section')).toBeLessThan(
      testIds.indexOf('coach-action-bar'),
    );
    expect(testIds.indexOf('coach-settings-inline')).toBeLessThan(
      testIds.indexOf('coach-action-primary'),
    );
  });

  it('uses the shared keyboard shell and disables native scroll keyboard inset drift', () => {
    render(<CoachScreen />);

    const keyboardShell = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(keyboardShell.props.behavior).toBe(
      Platform.OS === 'ios' ? 'padding' : 'height',
    );

    const scrollView = screen
      .UNSAFE_getAllByType(ScrollView)
      .find(
        (node) =>
          node.props.contentInsetAdjustmentBehavior === 'never' &&
          node.props.keyboardShouldPersistTaps === 'handled',
      );

    expect(scrollView).toBeTruthy();
    expect(scrollView?.props.automaticallyAdjustContentInsets).toBe(false);
    expect(scrollView?.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(scrollView?.props.keyboardDismissMode).toBe(
      Platform.OS === 'ios' ? 'interactive' : undefined,
    );
    expect(scrollView?.props.scrollIndicatorInsets).toEqual(
      expect.objectContaining({
        bottom: expect.any(Number),
      }),
    );
  });

  it('keeps the screen header inside the scroll content in stack variant and floats the action bar overlay', () => {
    render(<CoachScreen />);

    const scrollView = screen
      .UNSAFE_getAllByType(ScrollView)
      .find(
        (node) =>
          node.props.contentInsetAdjustmentBehavior === 'never' &&
          node.props.keyboardShouldPersistTaps === 'handled',
      );

    expect(scrollView).toBeTruthy();

    expect(screen.getByTestId('coach-screen-header')).toBeTruthy();
    expect(() => scrollView?.findByProps({ testID: 'coach-screen-header' })).not.toThrow();
    expect(() => scrollView?.findByProps({ testID: 'coach-scroll-body' })).not.toThrow();

    const contentContainerStyle = StyleSheet.flatten(scrollView?.props.contentContainerStyle);
    expect(contentContainerStyle?.paddingBottom).toBeGreaterThan(SPACING.xl);

    const actionBarOverlayStyle = StyleSheet.flatten(
      screen.getByTestId('coach-action-bar-overlay').props.style,
    );
    expect(actionBarOverlayStyle).toEqual(
      expect.objectContaining({
        position: 'absolute',
        left: 0,
        right: 0,
      }),
    );
    const actionBarOverlayChildren = React.Children.toArray(
      screen.getByTestId('coach-action-bar-overlay').props.children,
    );
    expect(
      actionBarOverlayChildren.some((child: any) => child?.type === 'LinearGradient'),
    ).toBe(false);

    const actionBarStyle = StyleSheet.flatten(
      screen.getByTestId('coach-action-bar').props.style,
    );
    expect(actionBarStyle).toEqual(
      expect.objectContaining({
        backgroundColor: 'transparent',
      }),
    );
  });

  it('keeps the screen header inside the scroll content in tab variant', () => {
    render(<CoachScreen variant="tab" />);

    const scrollView = screen
      .UNSAFE_getAllByType(ScrollView)
      .find(
        (node) =>
          node.props.contentInsetAdjustmentBehavior === 'never' &&
          node.props.keyboardShouldPersistTaps === 'handled',
      );

    expect(scrollView).toBeTruthy();
    expect(() => scrollView?.findByProps({ testID: 'coach-screen-header' })).not.toThrow();
  });

  it('scrolls the free question field into view on focus and keeps the primary action mounted', async () => {
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    const scrollToSpy = jest
      .spyOn(ScrollView.prototype as any, 'scrollTo')
      .mockImplementation(() => {});

    global.requestAnimationFrame = ((callback: (time: number) => void) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = jest.fn() as unknown as typeof cancelAnimationFrame;

    try {
      const rendered = render(<CoachScreen />);

      fireEvent(rendered.getByTestId('coach-settings-inline-question-input-card'), 'layout', {
        nativeEvent: {
          layout: {
            height: 160,
            width: 320,
            x: 0,
            y: 96,
          },
        },
      });

      await act(async () => {
        fireEvent(rendered.getByTestId('coach-settings-inline-question-input'), 'focus');
        await Promise.resolve();
      });

      expect(scrollToSpy).toHaveBeenCalledWith({
        y: 96 - SPACING.md,
        animated: true,
      });
      expect(rendered.getByTestId('coach-action-primary')).toBeTruthy();
    } finally {
      global.requestAnimationFrame = originalRequestAnimationFrame;
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      scrollToSpy.mockRestore();
    }
  });

  it('keeps the inline persona rail aligned with the resolved active persona', () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'analytical_precise',
      },
    };
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        createCoachEntry({
          persona_key: 'analytical_precise',
          title: 'Analytical guidance',
          body: 'Break the week into two measurable priorities.',
        }),
      ],
    };

    const screen = render(<CoachScreen />);
    const testIds = collectTestIds(screen.toJSON());

    const activeCard = screen.getByTestId(
      'coach-settings-inline-persona-analytical_precise',
    );
    expect(activeCard).toBeTruthy();
    expect(activeCard.props.accessibilityState?.selected).toBe(true);
    expect(
      testIds.indexOf('coach-settings-inline-persona-analytical_precise'),
    ).toBeLessThan(
      testIds.indexOf('coach-settings-inline-persona-gentle_supportive'),
    );
    expect(
      testIds.indexOf('coach-settings-inline-persona-analytical_precise'),
    ).toBeLessThan(
      testIds.indexOf('coach-settings-inline-persona-strict_tough'),
    );
  });

  it('reopens the selected coach details and lets the user keep the current coach without mutating it', async () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-persona-gentle_supportive'),
    );

    expect(screen.getByTestId('coach-persona-details-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-persona-details-primary-cta'));

    await waitFor(() => {
      expect(screen.queryByTestId('coach-persona-details-modal')).toBeNull();
    });
    expect(mockUpdateCoachPersona).not.toHaveBeenCalled();
  });

  it('exposes both the active and other personas in the inline rail regardless of saved guidance persona', () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'playful_light',
      },
    };
    const strictEntry = createCoachEntry({
      id: 'entry-strict',
      persona_key: 'strict_tough',
      title: 'Strict guidance',
      body: 'No excuses this week.',
    });
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [strictEntry],
    };
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: strictEntry,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.queryByText('Strict guidance')).toBeNull();
    expect(
      screen.getByTestId('coach-settings-inline-persona-strict_tough'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-playful_light'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-settings-inline-persona-playful_light').props
        .accessibilityState?.selected,
    ).toBe(true);
  });

  it('does not render legacy latest-ready guidance at cold start', () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'playful_light',
      },
    };
    const legacyEntry = createCoachEntry({
      id: 'entry-legacy',
      has_valid_persona: false,
      title: 'Legacy guidance',
      body: 'Stored before persona persistence.',
    });
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [legacyEntry],
    };
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: legacyEntry,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.queryByText('Legacy guidance')).toBeNull();
    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
  });

  it('does not render guidance CTAs at cold start before generation', () => {
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        createCoachEntry({
          cta_label: 'Open my plan',
          cta_route: '/weekly-plan',
        }),
      ],
    };

    const screen = render(<CoachScreen />);

    expect(screen.queryByText('Open my plan')).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('navigates to coach history from the header history icon', () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(screen.getByTestId('coach-history-icon-button'));

    expect(mockRouterPush).toHaveBeenCalledWith('/coach-history');
  });

  it('keeps the header history icon available with no saved history', () => {
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [],
    };

    const screen = render(<CoachScreen />);

    fireEvent.press(screen.getByTestId('coach-history-icon-button'));

    expect(mockRouterPush).toHaveBeenCalledWith('/coach-history');
  });

  it('does not render a secondary "past advice" button in the action bar', () => {
    const screen = render(<CoachScreen />);

    expect(screen.queryByTestId('coach-action-secondary')).toBeNull();
  });

  it('shows the free Coach quota when a request is available', () => {
    const screen = render(<CoachScreen />);
    const defaultQuestion = screen.getByTestId(
      'coach-settings-inline-question-input',
    ).props.value;

    expect(screen.queryByTestId('coach-quota-box')).toBeNull();
    expect(screen.queryByTestId('coach-quota-pill')).toBeNull();
    expect(screen.getByTestId('coach-action-composer')).toBeTruthy();
    expect(defaultQuestion).toBe('');
    expect(screen.getByText('Demander')).toBeTruthy();
    expectActionComposerSummary(screen);
    expect(screen.queryByText('Noah · Question requise')).toBeNull();
    expect(
      screen.getByTestId('coach-settings-inline-question-input-card').props
        .accessibilityState?.selected,
    ).toBe(false);
    expect(
      screen.queryByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
      ?.disabled,
    ).toBe(false);
  });

  it('keeps cached Coach settings visible during a silent focus refetch', () => {
    const latestReadyEntry = createCoachEntry({
      id: 'entry-latest-refetch',
      title: 'Cached guidance during refetch',
      body: 'This should not replace the settings view.',
    });

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [latestReadyEntry],
      isLoading: false,
      isFetching: true,
    };
    mockCoachQuotaState = {
      ...mockCoachQuotaState,
      isLoading: false,
      isFetching: true,
    };
    mockUseCoachScans.mockReturnValue({
      data: mockRecentCoachScans,
      error: null,
      isLoading: false,
      isFetching: true,
      refetch: jest.fn(),
    });
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: latestReadyEntry,
      error: null,
      isLoading: false,
      isFetching: true,
      refetch: jest.fn(),
    });
    mockUseCoachHistorySummary.mockReturnValue({
      data: {
        total_count: 1,
        latest_entry_at: '2026-04-06T08:00:00.000Z',
      },
      error: null,
      isLoading: false,
      isFetching: true,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    expect(screen.queryByTestId('coach-loading-state')).toBeNull();
    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
    expect(screen.queryByTestId('coach-query-error-state')).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);
    expect(
      screen.getByTestId('coach-settings-inline-mode-picker-card-latest_scan')
        .props.accessibilityState?.disabled,
    ).toBe(false);
  });

  it('keeps the first-scan state visible while known-empty scans refetch', () => {
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [],
      isLoading: false,
      isFetching: true,
    };
    mockUseCoachScans.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      isFetching: true,
      refetch: jest.fn(),
    });
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      isFetching: true,
      refetch: jest.fn(),
    });
    mockUseCoachHistorySummary.mockReturnValue({
      data: {
        total_count: 0,
        latest_entry_at: null,
      },
      error: null,
      isLoading: false,
      isFetching: true,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('coach-loading-state')).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/scanner');
  });

  it('unlocks Coach when a freshly primed scan appears while scans refetch', async () => {
    let scansQuery = {
      data: [] as Record<string, unknown>[],
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    };

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [],
      isLoading: false,
      isFetching: false,
    };
    mockUseCoachScans.mockImplementation(() => scansQuery);
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    mockUseCoachHistorySummary.mockReturnValue({
      data: {
        total_count: 0,
        latest_entry_at: null,
      },
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-empty-state')).toBeTruthy();

    scansQuery = {
      data: mockRecentCoachScans,
      error: null,
      isLoading: false,
      isFetching: true,
      refetch: jest.fn(),
    };

    screen.rerender(<CoachScreen />);
    enterCoachQuestion(screen);

    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
    expect(screen.queryByTestId('coach-loading-state')).toBeNull();
    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId('coach-action-primary'));
      await Promise.resolve();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptType: 'free_question',
        personaKey: 'gentle_supportive',
      }),
    );
  });

  it('keeps cached Coach UI stable when a background refetch reports errors', () => {
    const cachedEntry = createCoachEntry({
      id: 'entry-cached-error-refetch',
      title: 'Cached guidance survives errors',
      body: 'The refetch error should stay silent because data is present.',
    });

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [cachedEntry],
      error: new Error('entries refetch failed'),
      isLoading: false,
      isFetching: false,
    };
    mockUseCoachScans.mockReturnValue({
      data: mockRecentCoachScans,
      error: new Error('scans refetch failed'),
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: cachedEntry,
      error: new Error('latest ready refetch failed'),
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    expect(screen.queryByTestId('coach-query-error-state')).toBeNull();
    expect(screen.queryByTestId('coach-loading-state')).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);
  });

  it('shows premium partial quota with the next individual recharge', () => {
    const nextRechargeAt = new Date(
      Date.now() + (18 * 60 + 12) * 60_000,
    ).toISOString();
    mockCoachQuotaState = {
      data: {
        account_tier: 'premium',
        limit: 8,
        used_count: 2,
        available: 6,
        next_recharge_at: nextRechargeAt,
        unlimited: false,
        window_seconds: 86400,
        as_of: new Date().toISOString(),
      },
      error: null,
      isFetching: false,
      refetch: mockRefetchCoachQuota,
    };

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    expect(screen.queryByTestId('coach-quota-box')).toBeNull();
    expect(screen.queryByTestId('coach-quota-pill')).toBeNull();
    expect(screen.getByText('Demander')).toBeTruthy();
    expectActionComposerSummary(screen);
    expect(screen.queryByText('Noah · 6/8 disponible')).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);
  });

  it('keeps settings browsable and shows cooldown only when requesting with exhausted Coach quota', () => {
    mockCoachQuotaState = {
      data: {
        account_tier: 'free',
        limit: 1,
        used_count: 1,
        available: 0,
        next_recharge_at: new Date(Date.now() + 23 * 60 * 60_000).toISOString(),
        unlimited: false,
        window_seconds: 86400,
        as_of: new Date().toISOString(),
      },
      error: null,
      isFetching: false,
      refetch: mockRefetchCoachQuota,
    };

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    expect(screen.queryByTestId('coach-quota-box')).toBeNull();
    expect(screen.queryByTestId('coach-quota-pill')).toBeNull();
    expect(screen.queryByText(/0\/1 · Recharge/)).toBeNull();
    expectActionComposerSummary(screen);
    expect(screen.queryByText(/^Noah · 0\/1 · Prochaine demande dans /)).toBeNull();
    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(
      'Quota Coach atteint',
      expect.stringMatching(/^Prochaine demande dans /),
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.any(String),
        }),
      ]),
      expect.anything(),
      expect.objectContaining({ emoji: null }),
    );
  });

  it('blocks generation when Coach quota cannot be verified', () => {
    mockCoachQuotaState = {
      data: null,
      error: new Error('network unavailable'),
      isFetching: false,
      refetch: mockRefetchCoachQuota,
    };

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    expect(screen.queryByTestId('coach-quota-box')).toBeNull();
    expect(screen.queryByTestId('coach-quota-pill')).toBeNull();
    expectActionComposerSummary(screen);
    expect(screen.queryByText('Noah · Quota indisponible')).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(true);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('refetches quota when the next recharge time has elapsed', async () => {
    mockCoachQuotaState = {
      data: {
        account_tier: 'free',
        limit: 1,
        used_count: 1,
        available: 0,
        next_recharge_at: new Date(Date.now() - 1000).toISOString(),
        unlimited: false,
        window_seconds: 86400,
        as_of: new Date().toISOString(),
      },
      error: null,
      isFetching: false,
      refetch: mockRefetchCoachQuota,
    };

    render(<CoachScreen />);

    await waitFor(() => {
      expect(mockRefetchCoachQuota).toHaveBeenCalled();
    });
  });

  it('routes free users to the premium upgrade screen when tapping a locked mode', () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        ...mockAuthState.userProfile,
        account_tier: 'free',
      },
    };

    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-weekly_plan'),
    );

    expect(mockRouterPush).toHaveBeenCalledWith('/premium-upgrade');
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('selects a guidance type without generating until the main CTA is pressed', async () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        ...mockAuthState.userProfile,
        account_tier: 'premium',
      },
    };

    const screen = render(<CoachScreen />);
    const selectedWeeklyQuestion = resolveCoachQuestionText(
      'weekly_plan__realistic_week',
      'fr',
    );

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-weekly_plan'),
    );
    const defaultWeeklyQuestion = screen.getByTestId(
      'coach-settings-inline-question-input',
    ).props.value;

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(defaultWeeklyQuestion).toBe('');
    expect(
      screen.getByTestId('coach-settings-inline-mode-picker-card-weekly_plan')
        .props.accessibilityState?.selected,
    ).toBe(false);
    expect(
      screen.getByTestId('coach-settings-inline-mode-picker-card-weekly_plan')
        .props.accessibilityState?.expanded,
    ).toBe(true);
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    fireEvent.press(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-weekly_plan__realistic_week',
      ),
    );
    expect(
      screen.getByTestId('coach-settings-inline-question-input').props.value,
    ).toBe('');

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'weekly_plan',
          personaKey: 'gentle_supportive',
          questionKey: 'weekly_plan__realistic_week',
          questionText: selectedWeeklyQuestion,
        }),
      );
    });
  });

  it('lets free users generate guidance with the included coach persona when one old scan exists', async () => {
    mockUseCoachScans.mockReturnValue({
      data: [
        {
          id: 'scan-old',
          captured_at: '2025-01-01T10:00:00.000Z',
        },
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          personaKey: 'gentle_supportive',
        }),
      );
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith('/premium-upgrade');
  });

  it('does not show the first-scan CTA when a usable first scan exists', async () => {
    mockUseCoachScans.mockReturnValue({
      data: [
        {
          id: 'scan-first',
          scan_type: 'health',
          captured_at: '2026-04-29T10:00:00.000Z',
        },
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
    expect(
      screen.queryByText('Fais un scan pour débloquer le coach'),
    ).toBeNull();
    expectActionComposerSummary(screen);
    expect(screen.queryByText('Noah · 1/1 disponible')).toBeNull();

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          personaKey: 'gentle_supportive',
        }),
      );
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith('/scanner');
  });

  it('refreshes the Coach snapshot when stale data gains focus', async () => {
    const refetchSnapshot = jest.fn();

    mockUseCoachScreenSnapshot.mockReturnValue({
      data: {
        entries: mockCoachEntriesState.data,
        quota: mockCoachQuotaState.data,
        recentScans: [],
        latestReadyEntry: null,
        historySummary: { total_count: 0, latest_entry_at: null },
      },
      error: null,
      isLoading: false,
      isFetching: false,
      isFetched: true,
      isStale: true,
      refetch: refetchSnapshot,
    });

    render(<CoachScreen />);

    await waitFor(() => {
      expect(refetchSnapshot).toHaveBeenCalled();
    });
    expect(mockRefetchCoachQuota).not.toHaveBeenCalled();
  });

  it('prioritizes fresh mutation guidance over the previously cached guidance', async () => {
    const freshResponse = {
      success: true,
      entry_id: 'entry-new',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'ready',
      title: 'Fresh guidance',
      body: 'Keep showing up this week.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };

    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: freshResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return freshResponse;
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(screen.getByText('Fresh guidance')).toBeTruthy();
    });
    expect(
      screen.getByTestId('coach-guidance-card-variant-fresh'),
    ).toBeTruthy();
    expect(screen.getByTestId('coach-history-icon-button')).toBeTruthy();
  });

  it('routes to the dedicated history screen with the active entry id', () => {
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        createCoachEntry({
          id: 'entry-new',
          title: 'Fresh guidance',
          body: 'Keep showing up this week.',
          created_at: '2026-04-08T10:00:00.000Z',
          generated_at: '2026-04-08T10:00:00.000Z',
        }),
        createCoachEntry({
          id: 'entry-older',
          title: 'Older guidance',
          body: 'Keep the plan simple.',
          created_at: '2026-04-04T08:00:00.000Z',
          generated_at: '2026-04-04T08:00:00.000Z',
        }),
      ],
    };
    mockCoachGenerationState = {
      data: {
        success: true,
        entry_id: 'entry-new',
        persona_key: 'gentle_supportive',
        cached: false,
        fallback: false,
        status: 'ready',
        title: 'Fresh guidance',
        body: 'Keep showing up this week.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        expires_at: null,
        response_payload_json: {},
        payload: {},
      },
      isPending: false,
      isError: false,
      error: null,
    };

    const screen = render(<CoachScreen />);

    expect(screen.getByText('Fresh guidance')).toBeTruthy();
    expect(screen.getByTestId('coach-history-icon-button')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-history-icon-button'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/coach-history',
      params: {
        excludeEntryId: 'entry-new',
      },
    });
  });

  it('uses the header back action to leave the screen', () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(screen.getByTestId('coach-back-button'));

    expect(mockRouterCanDismiss).toHaveBeenCalled();
    expect(mockRouterBack).toHaveBeenCalled();
    expect(mockRouterDismiss).not.toHaveBeenCalled();
  });

  it('hides the back button in tab mode while keeping history access', () => {
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        createCoachEntry({ id: 'entry-new' }),
        createCoachEntry({
          id: 'entry-old',
          created_at: '2026-04-05T08:00:00.000Z',
          generated_at: '2026-04-05T08:00:00.000Z',
        }),
      ],
    };

    const screen = render(<CoachScreen variant="tab" />);

    expect(screen.queryByTestId('coach-back-button')).toBeNull();
    expect(screen.getByTestId('coach-history-icon-button')).toBeTruthy();
  });

  it('dismisses the screen when the router supports dismissing', () => {
    mockRouterCanDismiss.mockReturnValue(true);

    const screen = render(<CoachScreen />);

    fireEvent.press(screen.getByTestId('coach-back-button'));

    expect(mockRouterDismiss).toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('opens a locked persona preview before routing free users to the premium upgrade', async () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-persona-strict_tough'),
    );

    expect(screen.getByTestId('coach-persona-details-modal')).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockUpdateCoachPersona).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('coach-persona-details-primary-cta'));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/premium-upgrade');
    });
    expect(mockUpdateCoachPersona).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('uses the default free persona when a free profile has a locked persona stored', async () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'free',
        coach_persona_key: 'strict_tough',
      },
    };

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          personaKey: 'gentle_supportive',
        }),
      );
    });
  });

  it('opens a persona preview first, then lets premium users confirm and generate guidance with it', async () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'gentle_supportive',
      },
    };

    const screen = render(<CoachScreen />);

    expect(
      screen.queryByTestId(
        'coach-settings-inline-persona-analytical_precise-lock-badge',
      ),
    ).toBeNull();
    fireEvent.press(
      screen.getByTestId('coach-settings-inline-persona-analytical_precise'),
    );

    expect(screen.getByTestId('coach-persona-details-modal')).toBeTruthy();
    expect(mockUpdateCoachPersona).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('coach-persona-details-primary-cta'));

    await waitFor(() => {
      expect(mockUpdateCoachPersona).toHaveBeenCalledWith('analytical_precise');
    });

    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'analytical_precise',
      },
    };

    screen.rerender(<CoachScreen />);
    enterCoachQuestion(screen);
    const testIds = collectTestIds(screen.toJSON());
    expect(
      testIds.indexOf('coach-settings-inline-persona-analytical_precise'),
    ).toBeLessThan(
      testIds.indexOf('coach-settings-inline-persona-gentle_supportive'),
    );
    expect(
      screen.getByTestId('coach-settings-inline-persona-analytical_precise')
        .props.accessibilityState?.selected,
    ).toBe(true);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          personaKey: 'analytical_precise',
        }),
      );
    });
  });

  it('shows the refresh error title only when the ui state resolves to query_error', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    (process.env as Record<string, string | undefined>).NODE_ENV =
      'development';
    mockCoachEntriesState = {
      data: undefined,
      error: new Error(
        'Coach data table "coach_entries" is unavailable on Supabase project "test".',
      ),
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    };

    try {
      const screen = render(<CoachScreen />);

      expect(screen.getByTestId('coach-query-error-state')).toBeTruthy();
      expect(
        screen.getByText('Impossible de rafraîchir Coach maintenant'),
      ).toBeTruthy();
      expect(screen.queryByTestId('coach-settings-inline')).toBeNull();
      expect(
        screen.getByText(
          "Votre dernier conseil sauvegardé reste disponible quand c'est possible. Réessayez dans un instant.",
        ),
      ).toBeTruthy();
      expect(screen.queryByText(/coach_entries/i)).toBeNull();

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[CoachScreen] ui state',
          expect.objectContaining({
            ui_state: 'query_error',
            display_mode: 'settings',
            result_display_enabled: false,
            load_error_source: 'entries',
            has_entries_error: true,
            has_entries_data: false,
            has_recent_scans_error: true,
            has_recent_scans_data: true,
            has_latest_ready_error: true,
            has_latest_ready_entry_data: true,
            tracked_guidance_available: false,
            mutation_guidance_available: false,
          }),
        );
      });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
      consoleLogSpy.mockRestore();
    }
  });

  it('transitions from cold-start loading to query_error when latest ready bootstrap loading fails', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    let latestReadyQuery = {
      data: undefined as Record<string, unknown> | null | undefined,
      error: null as Error | null,
      isLoading: true,
      isFetching: true,
      refetch: jest.fn(),
    };

    (process.env as Record<string, string | undefined>).NODE_ENV =
      'development';
    mockCoachEntriesState = {
      data: [],
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockUseLatestReadyCoachEntry.mockImplementation(() => latestReadyQuery);

    try {
      const screen = render(<CoachScreen />);

      expect(screen.getByTestId('coach-loading-state')).toBeTruthy();
      expect(screen.queryByTestId('coach-query-error-state')).toBeNull();

      latestReadyQuery = {
        data: undefined,
        error: new Error('Latest ready coach guidance is unavailable'),
        isLoading: false,
        isFetching: false,
        refetch: jest.fn(),
      };

      screen.rerender(<CoachScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('coach-query-error-state')).toBeTruthy();
      });

      expect(screen.queryByTestId('coach-loading-state')).toBeNull();
      expect(
        screen.getByText('Impossible de rafraîchir Coach maintenant'),
      ).toBeTruthy();
      expect(screen.queryByTestId('coach-settings-inline')).toBeNull();

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[CoachScreen] ui state',
          expect.objectContaining({
            ui_state: 'query_error',
            display_mode: 'settings',
            result_display_enabled: false,
            load_error_source: 'latest_ready',
            has_entries_error: true,
            has_entries_data: true,
            has_recent_scans_error: true,
            has_recent_scans_data: true,
            has_latest_ready_error: true,
            has_latest_ready_entry_data: false,
            tracked_guidance_available: false,
            mutation_guidance_available: false,
          }),
        );
      });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
      consoleLogSpy.mockRestore();
    }
  });

  it('shows a dedicated unavailable state for the provider-not-configured generation error', () => {
    mockCoachEntriesState = {
      data: [],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockUseCoachGeneration.mockReturnValue({
      data: null,
      isPending: false,
      isError: true,
      error: new CoachServiceError(
        'Coach generation provider is not configured',
        {
          code: 'coach_webhook_not_configured',
          status: 503,
        },
      ),
      mutateAsync: (...args: unknown[]) => mockMutateAsync(...args),
    });

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-unavailable-state')).toBeTruthy();
    expect(screen.queryByTestId('coach-error-state')).toBeNull();
    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
  });

  it('keeps prompts disabled when the newest coach entry shows provider unavailable', () => {
    mockCoachEntriesState = {
      data: [
        {
          id: 'entry-provider-error',
          title: 'Unavailable',
          body: 'Provider missing.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T08:00:00.000Z',
          source: 'n8n',
          status: 'error',
          error_code: 'coach_webhook_not_configured',
        },
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-unavailable-state')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows only the dedicated generation loading state while coach guidance is still pending', () => {
    mockCoachGenerationState = {
      data: {
        success: true,
        entry_id: 'entry-stale-mutation',
        persona_key: 'gentle_supportive',
        cached: false,
        fallback: false,
        status: 'ready',
        title: 'Stale mutation guidance',
        body: 'This older mutation result must not be visible.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        expires_at: null,
        response_payload_json: {},
        payload: {},
      },
      isPending: true,
      isError: false,
      error: null,
    };

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
    expect(screen.getByText('Conseil en préparation')).toBeTruthy();
    expect(
      screen.getByText("Le Coach s'appuie sur vos derniers scans."),
    ).toBeTruthy();
    expect(
      screen.getByTestId('coach-generation-loading-percentage'),
    ).toHaveTextContent('0%');
    expect(screen.getByTestId('coach-loading-mini-game')).toBeTruthy();
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-card')).toBeNull();
    expect(screen.queryByText('Saved coach guidance')).toBeNull();
    expect(screen.queryByText('Stale mutation guidance')).toBeNull();
    expect(screen.queryByTestId('coach-error-state')).toBeNull();
    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
    expect(screen.queryByTestId('coach-unavailable-state')).toBeNull();
  });

  it('keeps the loading panel for the quick finish and hides the mini-game once guidance is ready', () => {
    jest.useFakeTimers();
    let rendered: ReturnType<typeof render> | null = null;

    try {
      mockCoachGenerationState = {
        data: null,
        isPending: true,
        isError: false,
        error: null,
      };

      rendered = render(<CoachScreen />);

      expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
      expect(screen.getByTestId('coach-loading-mini-game')).toBeTruthy();

      mockCoachGenerationState = {
        data: {
          success: true,
          entry_id: 'entry-fast-ready',
          persona_key: 'gentle_supportive',
          cached: false,
          fallback: false,
          status: 'ready',
          title: 'Fast ready guidance',
          body: 'The coach finished quickly.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          cta_label: null,
          cta_route: null,
          source: 'n8n',
          expires_at: null,
          response_payload_json: {},
          payload: {},
        },
        isPending: false,
        isError: false,
        error: null,
      };

      rendered.rerender(<CoachScreen />);

      expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
      expect(screen.queryByTestId('coach-loading-mini-game')).toBeNull();
      expect(screen.queryByTestId('coach-ready-state')).toBeNull();

      act(() => {
        jest.advanceTimersByTime(450);
      });

      expect(screen.queryByTestId('coach-generation-loading-state')).toBeNull();
      expect(screen.getByTestId('coach-ready-state')).toBeTruthy();
      expect(screen.getByText('Fast ready guidance')).toBeTruthy();
      expect(screen.getByText('The coach finished quickly.')).toBeTruthy();
    } finally {
      rendered?.unmount();
      jest.useRealTimers();
    }
  });

  it('holds a slow generation near 97 percent without revealing older guidance', () => {
    jest.useFakeTimers();
    let rendered: ReturnType<typeof render> | null = null;

    try {
      mockCoachGenerationState = {
        data: null,
        isPending: true,
        isError: false,
        error: null,
      };

      rendered = render(<CoachScreen />);

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(
        screen.getByTestId('coach-generation-loading-percentage'),
      ).toHaveTextContent('97%');
      expect(screen.getByTestId('coach-loading-mini-game')).toBeTruthy();
      expect(screen.queryByTestId('coach-ready-state')).toBeNull();
      expect(screen.queryByText('Saved coach guidance')).toBeNull();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(
        screen.getByTestId('coach-generation-loading-percentage'),
      ).toHaveTextContent('97%');
      expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    } finally {
      rendered?.unmount();
      jest.useRealTimers();
    }
  });

  it('hides the history button while a new generation is pending even if older ready entries exist', () => {
    mockCoachEntriesState = {
      data: [
        createCoachEntry({
          id: 'entry-current',
          title: 'Current guidance',
          body: 'Stay steady this week.',
          created_at: '2026-04-06T09:30:00.000Z',
          generated_at: '2026-04-06T09:30:00.000Z',
        }),
        createCoachEntry({
          id: 'entry-history',
          title: 'Earlier guidance',
          body: 'Keep meals regular.',
          persona_key: 'analytical_precise',
          created_at: '2026-04-04T09:30:00.000Z',
          generated_at: '2026-04-04T09:30:00.000Z',
        }),
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockCoachGenerationState = {
      data: null,
      isPending: true,
      isError: false,
      error: null,
    };

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-card')).toBeNull();
    expect(screen.queryByText('Current guidance')).toBeNull();
    expect(screen.queryByText('Stay steady this week.')).toBeNull();
    expect(screen.queryByTestId('coach-history-icon-button')).toBeNull();
  });

  it('keeps loading active after a pending response until the tracked coach entry becomes ready', async () => {
    const olderReadyEntry = createCoachEntry({
      id: 'entry-older-ready',
      title: 'Older ready guidance',
      body: 'This saved advice should stay hidden while the new one loads.',
      created_at: '2026-04-04T09:30:00.000Z',
      generated_at: '2026-04-04T09:30:00.000Z',
    });
    mockCoachEntriesState = {
      data: [olderReadyEntry],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const pendingResponse = {
      success: true,
      entry_id: 'entry-pending',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'pending',
      title: null,
      body: null,
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };

    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: pendingResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return pendingResponse;
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          personaKey: 'gentle_supportive',
        }),
      );
    });

    await waitFor(() => {
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: 'entry-pending',
        }),
      );
    });

    expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-card')).toBeNull();
    expect(screen.queryByText('Older ready guidance')).toBeNull();
    expect(
      screen.queryByText(
        'This saved advice should stay hidden while the new one loads.',
      ),
    ).toBeNull();
    expect(screen.queryByTestId('coach-error-state')).toBeNull();

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        {
          id: 'entry-pending',
          title: 'Ready coach guidance',
          body: 'Stay steady and keep the routine simple this week.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:30:00.000Z',
          source: 'n8n',
          status: 'ready',
        },
        olderReadyEntry,
      ],
    };

    screen.rerender(<CoachScreen />);

    await waitFor(
      () => {
        expect(screen.queryByTestId('coach-generation-loading-state')).toBeNull();
      },
      { timeout: 3000 },
    );
    expect(screen.getByText('Ready coach guidance')).toBeTruthy();
    expect(
      screen.getByTestId('coach-guidance-card-variant-fresh'),
    ).toBeTruthy();
    expect(
      screen.getByText('Stay steady and keep the routine simple this week.'),
    ).toBeTruthy();
  }, 15_000);

  it('shows a generation error when the tracked pending entry becomes stale', async () => {
    const defaultSnapshotImplementation =
      mockUseCoachScreenSnapshot.getMockImplementation();
    const stalePendingEntry = createCoachEntry({
      id: 'entry-stale-pending',
      title: null,
      body: null,
      created_at: '2026-04-06T09:30:00.000Z',
      status: 'pending',
    });
    const olderReadyEntry = createCoachEntry({
      id: 'entry-ready-behind-stale',
      title: 'Previous advice behind stale pending',
      body: 'This saved advice should stay hidden while the stale request errors.',
      created_at: '2026-04-04T09:30:00.000Z',
      generated_at: '2026-04-04T09:30:00.000Z',
    });
    mockCoachEntriesState = {
      data: [stalePendingEntry, olderReadyEntry],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockUseCoachScreenSnapshot.mockImplementation((options?: { trackedEntryId?: string | null }) => ({
      ...(defaultSnapshotImplementation?.(options) ?? {}),
      isTrackedEntryStale: options?.trackedEntryId === 'entry-stale-pending',
    }));

    const screen = render(<CoachScreen />);

    await waitFor(() => {
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: 'entry-stale-pending',
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('coach-error-state')).toBeTruthy();
    });

    expect(screen.queryByTestId('coach-generation-loading-state')).toBeNull();
    expect(screen.queryByText('Previous advice behind stale pending')).toBeNull();
    expect(
      screen.getByText(
        "Le service Coach n'a pas pu répondre pour le moment. Réessayez dans un instant.",
      ),
    ).toBeTruthy();
  });

  it('does not show an error during a normal pending wait and only surfaces one after the tracked entry fails', async () => {
    const olderReadyEntry = createCoachEntry({
      id: 'entry-ready-before-error',
      title: 'Previous advice before error',
      body: 'This should not look like the result of the failed request.',
      created_at: '2026-04-04T09:30:00.000Z',
      generated_at: '2026-04-04T09:30:00.000Z',
    });
    mockCoachEntriesState = {
      data: [olderReadyEntry],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const pendingResponse = {
      success: true,
      entry_id: 'entry-pending',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'pending',
      title: null,
      body: null,
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };

    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: pendingResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return pendingResponse;
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
    });
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-card')).toBeNull();
    expect(screen.queryByText('Previous advice before error')).toBeNull();
    expect(screen.queryByTestId('coach-error-state')).toBeNull();

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        {
          id: 'entry-pending',
          title: null,
          body: null,
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:30:00.000Z',
          source: 'n8n',
          status: 'error',
          error_code: 'coach_webhook_failed',
          response_payload_json: {
            request_id: 'req-coach-failed',
            webhook_status: 503,
            provider: 'n8n',
            source: 'coach_generation',
          },
        },
        olderReadyEntry,
      ],
    };

    screen.rerender(<CoachScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('coach-error-state')).toBeTruthy();
    });
    expect(screen.queryByTestId('coach-generation-loading-state')).toBeNull();
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByText('Previous advice before error')).toBeNull();
    expect(
      screen.getByText(
        "Le service Coach n'a pas pu répondre pour le moment. Réessayez dans un instant.",
      ),
    ).toBeTruthy();
  });

  it('maps an invalid tracked provider payload to a friendly error body even when n8n answered 500', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    mockCoachEntriesState = {
      data: [],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const pendingResponse = {
      success: true,
      entry_id: 'entry-invalid',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'pending',
      title: null,
      body: null,
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };

    (process.env as Record<string, string | undefined>).NODE_ENV =
      'development';
    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: pendingResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return pendingResponse;
    });

    try {
      const screen = render(<CoachScreen />);
      enterCoachQuestion(screen);

      fireEvent.press(screen.getByTestId('coach-action-primary'));

      await waitFor(() => {
        expect(
          screen.getByTestId('coach-generation-loading-state'),
        ).toBeTruthy();
      });

      mockCoachEntriesState = {
        ...mockCoachEntriesState,
        data: [
          {
            id: 'entry-invalid',
            title: null,
            body: null,
            disclaimer:
              'Wellness guidance only. This is not a diagnosis or medical advice.',
            persona_key: 'gentle_supportive',
            cta_label: null,
            cta_route: null,
            created_at: '2026-04-06T09:30:00.000Z',
            source: 'n8n',
            status: 'error',
            error_code: 'invalid_coach_response',
            response_payload_json: {
              request_id: 'req-invalid',
              webhook_status: 500,
              provider: 'n8n',
              source: 'coach_generation',
              provider_failure_kind: 'json_parse_failed',
              provider_failure_stage: 'n8n_chain_llm',
            },
          },
        ],
      };

      screen.rerender(<CoachScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('coach-error-state')).toBeTruthy();
      });

      expect(
        screen.getByText(
          'Petit hoquet technique côté Coach. Réessaye dans un instant.',
        ),
      ).toBeTruthy();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[CoachScreen] ui state',
        expect.objectContaining({
          ui_state: 'generation_error',
          tracked_entry_id: 'entry-invalid',
          tracked_error_code: 'invalid_coach_response',
          generation_error_kind: 'invalid_provider_response',
          generation_error: expect.objectContaining({
            code: 'invalid_coach_response',
            status: 500,
            requestId: 'req-invalid',
            functionName: 'coach-generate-response',
            providerFailureKind: 'json_parse_failed',
            providerFailureStage: 'n8n_chain_llm',
          }),
        }),
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
      consoleLogSpy.mockRestore();
    }
  });

  it('keeps loading active when the mutation settles without renderable content and follows the returned entry id', async () => {
    mockCoachEntriesState = {
      data: [],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const nonRenderableResponse = {
      success: true,
      entry_id: 'entry-non-renderable',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'ready',
      title: null,
      body: null,
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };

    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: nonRenderableResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return nonRenderableResponse;
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: 'entry-non-renderable',
        }),
      );
    });

    expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
    expect(screen.queryByTestId('coach-empty-state')).toBeNull();

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        {
          id: 'entry-non-renderable',
          title: 'Recovered coach guidance',
          body: 'The tracked entry eventually became ready.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:35:00.000Z',
          source: 'n8n',
          status: 'ready',
        },
      ],
    };

    screen.rerender(<CoachScreen />);

    await waitFor(
      () => {
        expect(screen.queryByTestId('coach-generation-loading-state')).toBeNull();
      },
      { timeout: 3000 },
    );
    expect(screen.getByText('Recovered coach guidance')).toBeTruthy();
  });

  it('clears stale tracked and mutation debug state after leaving a tracked ready result', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    mockCoachEntriesState = {
      data: [],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const nonRenderableResponse = {
      success: true,
      entry_id: 'entry-tracked-ready',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'ready',
      title: null,
      body: null,
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };

    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: nonRenderableResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return nonRenderableResponse;
    });

    (process.env as Record<string, string | undefined>).NODE_ENV =
      'development';

    try {
      const screen = render(<CoachScreen />);
      enterCoachQuestion(screen);

      fireEvent.press(screen.getByTestId('coach-action-primary'));

      await waitFor(() => {
        expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
          expect.objectContaining({
            trackedEntryId: 'entry-tracked-ready',
          }),
        );
      });
      expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();

      mockCoachEntriesState = {
        ...mockCoachEntriesState,
        data: [
          {
            id: 'entry-tracked-ready',
            title: 'Tracked ready guidance',
            body: 'The pending tracked entry eventually became ready.',
            disclaimer:
              'Wellness guidance only. This is not a diagnosis or medical advice.',
            persona_key: 'gentle_supportive',
            cta_label: null,
            cta_route: null,
            created_at: '2026-04-06T09:35:00.000Z',
            source: 'n8n',
            status: 'ready',
          },
        ],
      };

      screen.rerender(<CoachScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('coach-ready-state')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('coach-action-primary'));

      await waitFor(() => {
        expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
      });
      expect(screen.queryByTestId('coach-ready-state')).toBeNull();
      expect(mockResetCoachGeneration).toHaveBeenCalledTimes(1);
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: null,
        }),
      );
      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[CoachScreen] ui state',
          expect.objectContaining({
            display_mode: 'settings',
            result_display_enabled: false,
            displayed_guidance_source: null,
            tracked_entry_id: null,
            tracked_guidance_available: false,
            last_mutation_status: null,
            mutation_guidance_available: false,
          }),
        );
      });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
      consoleLogSpy.mockRestore();
    }
  });

  it('resumes the latest pending entry for the active persona instead of showing the empty state', async () => {
    mockCoachEntriesState = {
      data: [
        {
          id: 'entry-resume',
          title: null,
          body: null,
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:40:00.000Z',
          source: 'n8n',
          status: 'pending',
        },
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const screen = render(<CoachScreen />);

    await waitFor(() => {
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: 'entry-resume',
        }),
      );
    });

    expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
  });

  it('shows loading for an active pending entry instead of falling back to an older ready entry', async () => {
    mockCoachEntriesState = {
      data: [
        {
          id: 'entry-active-pending',
          title: null,
          body: null,
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:45:00.000Z',
          source: 'n8n',
          status: 'pending',
        },
        createCoachEntry({
          id: 'entry-ready-while-pending',
          title: 'Ready advice behind pending',
          body: 'This older advice should only be reachable from history.',
          created_at: '2026-04-04T09:30:00.000Z',
          generated_at: '2026-04-04T09:30:00.000Z',
        }),
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    const screen = render(<CoachScreen />);

    await waitFor(() => {
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: 'entry-active-pending',
        }),
      );
    });

    expect(screen.getByTestId('coach-generation-loading-state')).toBeTruthy();
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByTestId('coach-guidance-card')).toBeNull();
    expect(screen.queryByText('Ready advice behind pending')).toBeNull();
    expect(
      screen.queryByText(
        'This older advice should only be reachable from history.',
      ),
    ).toBeNull();
    expect(screen.queryByTestId('coach-history-icon-button')).toBeNull();
  });

  it('logs ui state only once across fetch rerenders until the tracked state changes', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const pendingEntry = createCoachEntry({
      id: 'entry-log-pending',
      title: null,
      body: null,
      generated_at: null,
      created_at: '2026-04-06T09:45:00.000Z',
      status: 'pending',
    });
    const olderReadyEntry = createCoachEntry({
      id: 'entry-log-ready-behind',
      title: 'Older ready guidance',
      body: 'This guidance should stay hidden while the pending one loads.',
      created_at: '2026-04-04T09:30:00.000Z',
      generated_at: '2026-04-04T09:30:00.000Z',
    });

    (process.env as Record<string, string | undefined>).NODE_ENV =
      'development';
    mockCoachEntriesState = {
      data: [pendingEntry, olderReadyEntry],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    try {
      const rendered = render(<CoachScreen />);

      await waitFor(() => {
        expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
          expect.objectContaining({
            trackedEntryId: 'entry-log-pending',
          }),
        );
      });
      await waitFor(() => {
        expect(
          rendered.getByTestId('coach-generation-loading-state'),
        ).toBeTruthy();
      });
      await waitFor(() => {
        expect(getScopedConsoleCalls(consoleLogSpy, '[CoachScreen] ui state')).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([
              '[CoachScreen] ui state',
              expect.objectContaining({
                tracked_entry_id: 'entry-log-pending',
                tracked_status: 'pending',
                ui_state: 'generation_loading',
              }),
            ]),
          ]),
        );
      });

      consoleLogSpy.mockClear();

      mockCoachEntriesState = {
        ...mockCoachEntriesState,
        isFetching: true,
      };
      await act(async () => {
        rendered.rerender(<CoachScreen />);
      });

      mockCoachEntriesState = {
        ...mockCoachEntriesState,
        isFetching: false,
      };
      await act(async () => {
        rendered.rerender(<CoachScreen />);
      });

      expect(getScopedConsoleCalls(consoleLogSpy, '[CoachScreen] ui state')).toHaveLength(0);

      mockCoachEntriesState = {
        ...mockCoachEntriesState,
        data: [
          createCoachEntry({
            id: 'entry-log-pending',
            title: 'Ready coach guidance',
            body: 'Stay steady and keep the routine simple this week.',
            created_at: '2026-04-06T09:45:00.000Z',
            generated_at: '2026-04-06T09:47:00.000Z',
            status: 'ready',
          }),
          olderReadyEntry,
        ],
      };
      await act(async () => {
        rendered.rerender(<CoachScreen />);
      });

      await waitFor(
        () => {
          expect(
            rendered.queryByTestId('coach-generation-loading-state'),
          ).toBeNull();
        },
        { timeout: 3000 },
      );
      expect(rendered.getByText('Ready coach guidance')).toBeTruthy();
      await waitFor(() => {
        expect(getScopedConsoleCalls(consoleLogSpy, '[CoachScreen] ui state')).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([
              '[CoachScreen] ui state',
              expect.objectContaining({
                tracked_entry_id: 'entry-log-pending',
                tracked_status: 'ready',
                ui_state: 'guidance',
                displayed_guidance_source: 'tracked',
              }),
            ]),
          ]),
        );
      });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
      consoleLogSpy.mockRestore();
    }
  });

  it('refreshes a stale focused snapshot only once across fetch rerenders', async () => {
    const focusRefetch = jest.fn();
    const snapshotState = {
      isFetched: true,
      isFetching: false,
      isStale: true,
    };

    mockUseCoachScreenSnapshot.mockImplementation(
      (options?: { excludeEntryId?: string | null }) => {
        const scansQuery = mockUseCoachScans();
        const latestReadyQuery = mockUseLatestReadyCoachEntry({
          personaKey: mockAuthState.userProfile.coach_persona_key,
        });
        const historySummaryQuery = mockUseCoachHistorySummary({
          excludeEntryId: options?.excludeEntryId,
        });

        return {
          data: {
            entries: mockCoachEntriesState.data,
            quota: mockCoachQuotaState.data,
            recentScans:
              scansQuery && 'data' in scansQuery ? scansQuery.data : [],
            latestReadyEntry:
              latestReadyQuery && 'data' in latestReadyQuery
                ? latestReadyQuery.data
                : null,
            historySummary:
              historySummaryQuery && 'data' in historySummaryQuery
                ? historySummaryQuery.data
                : buildHistorySummary(options?.excludeEntryId),
          },
          error: null,
          isLoading: false,
          isFetching: snapshotState.isFetching,
          isFetched: snapshotState.isFetched,
          isStale: snapshotState.isStale,
          isTrackedEntryStale: false,
          refetch: focusRefetch,
        };
      },
    );

    const rendered = render(<CoachScreen />);

    await waitFor(() => {
      expect(focusRefetch).toHaveBeenCalledTimes(1);
    });

    snapshotState.isFetching = true;
    await act(async () => {
      rendered.rerender(<CoachScreen />);
    });

    expect(focusRefetch).toHaveBeenCalledTimes(1);

    snapshotState.isFetching = false;
    await act(async () => {
      rendered.rerender(<CoachScreen />);
    });

    expect(focusRefetch).toHaveBeenCalledTimes(1);
  });

  it('does not refetch again after a focused tracked entry settles ready', async () => {
    const focusRefetch = jest.fn();
    const snapshotState = {
      isFetched: true,
      isFetching: false,
      isStale: true,
    };

    mockCoachEntriesState = {
      data: [
        {
          id: 'entry-focus-tracked',
          title: null,
          body: null,
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          persona_key: 'gentle_supportive',
          cta_label: null,
          cta_route: null,
          created_at: '2026-04-06T09:50:00.000Z',
          source: 'n8n',
          status: 'pending',
        },
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    mockUseCoachScreenSnapshot.mockImplementation(
      (options?: { excludeEntryId?: string | null }) => {
        const scansQuery = mockUseCoachScans();
        const latestReadyQuery = mockUseLatestReadyCoachEntry({
          personaKey: mockAuthState.userProfile.coach_persona_key,
        });
        const historySummaryQuery = mockUseCoachHistorySummary({
          excludeEntryId: options?.excludeEntryId,
        });

        return {
          data: {
            entries: mockCoachEntriesState.data,
            quota: mockCoachQuotaState.data,
            recentScans:
              scansQuery && 'data' in scansQuery ? scansQuery.data : [],
            latestReadyEntry:
              latestReadyQuery && 'data' in latestReadyQuery
                ? latestReadyQuery.data
                : null,
            historySummary:
              historySummaryQuery && 'data' in historySummaryQuery
                ? historySummaryQuery.data
                : buildHistorySummary(options?.excludeEntryId),
          },
          error: null,
          isLoading: false,
          isFetching: snapshotState.isFetching,
          isFetched: snapshotState.isFetched,
          isStale: snapshotState.isStale,
          isTrackedEntryStale: false,
          refetch: focusRefetch,
        };
      },
    );

    const rendered = render(<CoachScreen />);

    await waitFor(() => {
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: 'entry-focus-tracked',
        }),
      );
    });

    await waitFor(() => {
      expect(focusRefetch).toHaveBeenCalledTimes(1);
    });

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [
        createCoachEntry({
          id: 'entry-focus-tracked',
          title: 'Focused tracked guidance',
          body: 'This tracked guidance should not trigger another focus refresh.',
          created_at: '2026-04-06T10:00:00.000Z',
          generated_at: '2026-04-06T10:00:00.000Z',
        }),
      ],
    };

    snapshotState.isFetching = true;
    await act(async () => {
      rendered.rerender(<CoachScreen />);
    });

    expect(focusRefetch).toHaveBeenCalledTimes(1);

    snapshotState.isFetching = false;
    await act(async () => {
      rendered.rerender(<CoachScreen />);
    });

    expect(focusRefetch).toHaveBeenCalledTimes(1);
  });

  it('does not render archived guidance from another persona at cold start', () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'analytical_precise',
      },
    };
    const archivedEntry = createCoachEntry({
      id: 'entry-other-persona',
      persona_key: 'gentle_supportive',
      title: 'Gentle archived guidance',
      body: 'Keep it simple and repeatable.',
    });
    mockCoachEntriesState = {
      data: [archivedEntry],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: archivedEntry,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    expect(screen.queryByText('Gentle archived guidance')).toBeNull();
    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
  });

  it('loads latest-ready guidance and history summary through the screen snapshot at cold start', () => {
    const latestReadyEntry = createCoachEntry({
      id: 'entry-latest',
      title: 'Newest dedicated guidance',
      body: 'This advice comes from the dedicated latest-ready query.',
      created_at: '2026-04-09T09:30:00.000Z',
      generated_at: '2026-04-09T09:30:00.000Z',
    });

    mockCoachEntriesState = {
      data: [
        createCoachEntry({
          id: 'entry-older',
          title: 'Older guidance',
          body: 'This older advice should stay in history only.',
          created_at: '2026-04-04T09:30:00.000Z',
          generated_at: '2026-04-04T09:30:00.000Z',
        }),
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: latestReadyEntry,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });
    mockUseCoachHistorySummary.mockImplementation(
      ({ excludeEntryId }: { excludeEntryId?: string | null }) => ({
        data: {
          total_count: 23,
          latest_entry_at: '2026-04-04T09:30:00.000Z',
        },
        error: null,
        isFetching: false,
        refetch: jest.fn(),
        excludeEntryId,
      }),
    );

    const screen = render(<CoachScreen />);

    expect(screen.queryByText('Newest dedicated guidance')).toBeNull();
    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    expect(screen.getByTestId('coach-history-icon-button')).toBeTruthy();
    expect(mockUseCoachScreenSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'fr' }),
    );
    expect(mockUseCoachScreenSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ entriesLimit: 10 }),
    );
  });

  it('does not surface a query error when only history summary loading fails at cold start', () => {
    const latestReadyEntry = createCoachEntry({
      id: 'entry-latest',
      title: 'Newest dedicated guidance',
      body: 'This advice comes from the dedicated latest-ready query.',
    });

    mockCoachEntriesState = {
      data: [
        createCoachEntry({
          id: 'entry-older',
          title: 'Older guidance',
          body: 'This older advice should stay available locally.',
          persona_key: 'analytical_precise',
        }),
      ],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: latestReadyEntry,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });
    mockUseCoachHistorySummary.mockReturnValue({
      data: undefined,
      error: new Error('Coach history summary unavailable'),
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    expect(screen.queryByTestId('coach-query-error-state')).toBeNull();
    expect(screen.queryByTestId('coach-history-cta')).toBeNull();
  });

  it('hides the empty state when an archived entry exists even if history summary loading fails', () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'analytical_precise',
      },
    };
    const archivedEntry = createCoachEntry({
      id: 'entry-other-persona',
      persona_key: 'gentle_supportive',
      title: 'Gentle archived guidance',
      body: 'Keep it simple and repeatable.',
    });
    mockCoachEntriesState = {
      data: [archivedEntry],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockUseLatestReadyCoachEntry.mockReturnValue({
      data: archivedEntry,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });
    mockUseCoachHistorySummary.mockReturnValue({
      data: undefined,
      error: new Error('Coach history summary unavailable'),
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.queryByTestId('coach-query-error-state')).toBeNull();
    expect(screen.queryByTestId('coach-empty-state')).toBeNull();
    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
  });

  it('logs detailed mutation failure metadata when generation rejects before entry_id', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const mutationError = new CoachServiceError(
      'Coach route "coach-generate-response" failed (503).',
      {
        code: 'coach_webhook_failed',
        status: 503,
        requestId: 'req-coach-503',
        functionName: 'coach-generate-response',
        details: {
          provider_status: 503,
          step: 'webhook',
        },
      },
    );

    (process.env as Record<string, string | undefined>).NODE_ENV =
      'development';
    mockCoachEntriesState = {
      data: [],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };

    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: null,
        isPending: true,
        isError: false,
        error: null,
      };
      await Promise.resolve();
      mockCoachGenerationState = {
        data: null,
        isPending: false,
        isError: true,
        error: mutationError,
      };
      throw mutationError;
    });

    try {
      const screen = render(<CoachScreen />);
      enterCoachQuestion(screen);

      fireEvent.press(screen.getByTestId('coach-action-primary'));

      await waitFor(() => {
        expect(
          screen.getByTestId('coach-generation-loading-state'),
        ).toBeTruthy();
      });

      await waitFor(() => {
        expect(screen.getByTestId('coach-error-state')).toBeTruthy();
      });

      expect(
        screen.getByText(
          "Le service Coach n'a pas pu répondre pour le moment. Réessayez dans un instant.",
        ),
      ).toBeTruthy();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[CoachScreen] generation request failed',
        expect.objectContaining({
          prompt_type: 'free_question',
          visible_prompt_type: 'latest_scan',
          persona_key: 'gentle_supportive',
          locale: 'fr',
          message: 'Coach route "coach-generate-response" failed (503).',
          code: 'coach_webhook_failed',
          status: 503,
          requestId: 'req-coach-503',
          functionName: 'coach-generate-response',
          details: {
            provider_status: 503,
            step: 'webhook',
          },
        }),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[CoachScreen] ui state',
        expect.objectContaining({
          ui_state: 'generation_error',
          last_mutation_entry_id: null,
          last_mutation_status: null,
          tracked_entry_id: null,
          generation_error: expect.objectContaining({
            code: 'coach_webhook_failed',
            status: 503,
            requestId: 'req-coach-503',
            functionName: 'coach-generate-response',
          }),
        }),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[CoachScreen] generation loading ended',
        expect.objectContaining({
          exit_reason: 'generation_error',
          generation_error: expect.objectContaining({
            code: 'coach_webhook_failed',
            status: 503,
            requestId: 'req-coach-503',
            functionName: 'coach-generate-response',
          }),
        }),
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
      consoleLogSpy.mockRestore();
    }
  });

  it('blocks advice generation with the first-scan state when no usable scan exists', () => {
    mockCoachEntriesState = {
      data: [],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    };
    mockUseCoachScans.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    });

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-empty-state')).toBeTruthy();
    expect(
      screen.getByText('Commence par un scan'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Lance un scan pour démarrer ton coaching personnalisé.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Faire un scan')).toBeTruthy();
    expect(screen.getByText('Scanner')).toBeTruthy();
    expectActionComposerSummary(screen);
    expect(screen.queryByText('Noah · Scan requis')).toBeNull();
    expect(screen.queryByTestId('coach-unavailable-state')).toBeNull();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/scanner');

    fireEvent.press(screen.getByTestId('coach-empty-scan-cta'));

    expect(mockRouterPush).toHaveBeenCalledWith('/scanner');
  });

  it('surfaces persona save parity errors instead of only tracking analytics', async () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        id: 'user-1',
        account_tier: 'premium',
        coach_persona_key: 'gentle_supportive',
      },
    };
    mockUpdateCoachPersona.mockRejectedValueOnce(
      new Error(
        'Coach persona is unavailable because "user_profiles.coach_persona_key" is missing on the configured Supabase project.',
      ),
    );

    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-persona-analytical_precise'),
    );
    fireEvent.press(screen.getByTestId('coach-persona-details-primary-cta'));

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        'Impossible de rafraîchir Coach maintenant',
        "Votre dernier conseil sauvegardé reste disponible quand c'est possible. Réessayez dans un instant.",
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.any(String),
          }),
        ]),
      );
    });
  });

  it('switches from settings to the freshly generated guidance after pressing the primary action', async () => {
    const freshResponse = {
      success: true,
      entry_id: 'entry-fresh',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'ready',
      title: 'Fresh inline guidance',
      body: 'Generated from inline settings.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };
    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: freshResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return freshResponse;
    });

    const screen = render(<CoachScreen />);

    expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(screen.getByTestId('coach-ready-state')).toBeTruthy();
    });
    expect(screen.queryByTestId('coach-settings-inline')).toBeNull();
    expect(screen.getByText('Fresh inline guidance')).toBeTruthy();
  });

  it('shows structured coach sections immediately for a fresh v2 response', async () => {
    const freshResponse = {
      success: true,
      entry_id: 'entry-structured',
      persona_key: 'patient_calm',
      cached: false,
      fallback: false,
      status: 'ready',
      response_version: 2,
      title: 'Eau au rythme',
      body: 'Prenons un moment. Quelques pauses d eau dans la journee, a ton rythme.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
      content: {
        title: 'Eau au rythme',
        summary: 'Prenons un moment. Quelques pauses d eau dans la journee, a ton rythme.',
        context_notes: [],
        priorities: [],
        action_steps: ['Pose une bouteille visible pres de toi.'],
        warnings: [],
        encouragement: 'Boire posement, c est se recentrer.',
        primary_metric_delta: null,
        data_gaps: [],
        confidence: 'high',
        daily_schedule: [
          {
            day: 'Lundi',
            slots: [
              {
                time: '08:00',
                duration_min: 10,
                action: 'Respiration 4-6 + etirements doux (10 min)',
                tag: null,
              },
            ],
          },
        ],
        micro_routine: [
          {
            name: 'Pauses eau',
            when: 'toute la journee',
            total_min: 3,
            steps: [
              '7h30 - verre d eau + 3 respirations douces',
              '11h - verre d eau en silence',
            ],
          },
        ],
        habit_tracker: [
          {
            label: 'Boire 2L eau',
            target_days: 3,
            window: 'journee',
          },
        ],
      },
    };
    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: freshResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return freshResponse;
    });

    const screen = render(<CoachScreen />);
    enterCoachQuestion(screen);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(screen.getByTestId('coach-ready-state')).toBeTruthy();
    });
    expect(screen.getByTestId('coach-guidance-toggle').props.accessibilityState.expanded).toBe(
      true,
    );
    expect(screen.getByTestId('coach-section-daily_schedule')).toBeTruthy();
    expect(screen.getByTestId('coach-section-micro_routine')).toBeTruthy();
    expect(screen.getByTestId('coach-section-habit_tracker')).toBeTruthy();
    expect(screen.getByText('Lundi')).toBeTruthy();
    expect(screen.getByText('Pauses eau · toute la journee · 3 min')).toBeTruthy();
    expect(screen.getByText('Boire 2L eau · 3j/7 · journee')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toContain('[missing');
  });

  it('returns to inline settings when pressing the primary action from the result view', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const freshResponse = {
      success: true,
      entry_id: 'entry-fresh',
      persona_key: 'gentle_supportive',
      cached: false,
      fallback: false,
      status: 'ready',
      title: 'Fresh inline guidance',
      body: 'Generated from inline settings.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    };
    mockMutateAsync.mockImplementation(async () => {
      mockCoachGenerationState = {
        data: freshResponse,
        isPending: false,
        isError: false,
        error: null,
      };
      return freshResponse;
    });

    (process.env as Record<string, string | undefined>).NODE_ENV =
      'development';

    try {
      const screen = render(<CoachScreen />);
      enterCoachQuestion(screen);

      fireEvent.press(screen.getByTestId('coach-action-primary'));

      await waitFor(() => {
        expect(screen.getByTestId('coach-ready-state')).toBeTruthy();
      });
      expect(screen.queryByTestId('coach-edit-settings')).toBeNull();
      expect(screen.queryByText('Modifier les réglages')).toBeNull();
      expect(screen.getByText('Nouveau conseil')).toBeTruthy();

      fireEvent.press(screen.getByTestId('coach-action-primary'));

      await waitFor(() => {
        expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
      });
      expect(screen.queryByTestId('coach-ready-state')).toBeNull();
      expect(mockResetCoachGeneration).toHaveBeenCalledTimes(1);
      expect(mockUseCoachScreenSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          trackedEntryId: null,
        }),
      );
      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[CoachScreen] ui state',
          expect.objectContaining({
            display_mode: 'settings',
            result_display_enabled: false,
            displayed_guidance_source: null,
            tracked_entry_id: null,
            tracked_guidance_available: false,
            last_mutation_status: null,
            mutation_guidance_available: false,
          }),
        );
      });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalNodeEnv;
      consoleLogSpy.mockRestore();
    }
  });

  it('lets users leave a result view even when Coach quota is exhausted, then alerts on the next request attempt', async () => {
    mockCoachQuotaState = {
      data: {
        account_tier: 'free',
        limit: 1,
        used_count: 1,
        available: 0,
        next_recharge_at: new Date(Date.now() + 23 * 60 * 60_000).toISOString(),
        unlimited: false,
        window_seconds: 86400,
        as_of: new Date().toISOString(),
      },
      error: null,
      isFetching: false,
      refetch: mockRefetchCoachQuota,
    };
    mockCoachGenerationState = {
      data: {
        success: true,
        entry_id: 'entry-fresh',
        persona_key: 'gentle_supportive',
        cached: false,
        fallback: false,
        status: 'ready',
        title: 'Fresh inline guidance',
        body: 'Generated from inline settings.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        source: 'n8n',
        expires_at: null,
        response_payload_json: {},
        payload: {},
      },
      isPending: false,
      isError: false,
      error: null,
    };

    const screen = render(<CoachScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('coach-ready-state')).toBeTruthy();
    });
    expect(screen.queryByText('Modifier les réglages')).toBeNull();
    expect(screen.getByText('Nouveau conseil')).toBeTruthy();
    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(screen.getByTestId('coach-settings-inline')).toBeTruthy();
    });
    expect(screen.queryByTestId('coach-ready-state')).toBeNull();
    const resumedQuestion = screen.getByTestId(
      'coach-settings-inline-question-input',
    ).props.value;
    expect(resumedQuestion).toBe('');
    expectActionComposerSummary(screen);
    expect(screen.queryByText('Noah · Question requise')).toBeNull();
    expect(mockShowAlert).not.toHaveBeenCalled();

    enterCoachQuestion(screen);
    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(
      'Quota Coach atteint',
      expect.stringMatching(/^Prochaine demande dans /),
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.any(String),
        }),
      ]),
      expect.anything(),
      expect.objectContaining({ emoji: null }),
    );
  });

  it('preserves scan result intent when opening preset cards without replacing the question', async () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        ...mockAuthState.userProfile,
        account_tier: 'premium',
      },
    };
    const encodedScanIntent = encodeScanCoachIntentParam({
      scan_id: 'scan-route-123',
      scan_type: 'body',
      has_actionable_issue: true,
      priority_metric: 'posture_score',
      priority_label: 'Posture',
      severity: 'medium',
      reason: 'Posture score needs attention.',
      user_facing_summary: 'Le scan fait ressortir une priorite claire.',
      prompt_type: 'latest_scan_issue_resolution',
      question_key: null,
      question_text: 'Que dois-je travailler apres ce scan ?',
      fallback_prompt_type: 'latest_scan',
      premium_required: false,
    });
    mockLocalSearchParams.mockReturnValue({
      source: 'scan_result',
      scanId: 'scan-route-123',
      scanType: 'body',
      promptType: 'latest_scan_issue_resolution',
      fallback_prompt_type: 'latest_scan',
      questionText: 'Que dois-je travailler apres ce scan ?',
      priorityMetric: 'posture_score',
      scanIntent: encodedScanIntent,
    });

    const rendered = render(<CoachScreen />);

    await waitFor(() => {
      expect(
        rendered.getByTestId('coach-settings-inline-question-input').props.value,
      ).toBe('Que dois-je travailler apres ce scan ?');
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    fireEvent.press(
      rendered.getByTestId('coach-settings-inline-mode-picker-card-latest_scan'),
    );
    fireEvent.press(
      rendered.getByTestId(
        'coach-settings-inline-mode-picker-card-nutrition_focus',
      ),
    );
    fireEvent.press(
      rendered.getByTestId(
        'coach-settings-inline-mode-picker-card-nutrition_focus',
      ),
    );

    fireEvent.press(rendered.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'latest_scan_issue_resolution',
          questionKey: null,
          questionText: 'Que dois-je travailler apres ce scan ?',
          selectedScanId: 'scan-route-123',
          scanIntent: expect.objectContaining({
            scan_id: 'scan-route-123',
            priority_metric: 'posture_score',
            question_text: 'Que dois-je travailler apres ce scan ?',
          }),
        }),
      );
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('auto-submits scan result routes only after boot data settles and only once', async () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        ...mockAuthState.userProfile,
        account_tier: 'premium',
      },
    };
    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: undefined,
      isLoading: true,
    };
    mockLocalSearchParams.mockReturnValue({
      source: 'scan_result',
      autoSubmit: '1',
      scanId: 'scan-auto-123',
      scanType: 'body',
      promptType: 'latest_scan_issue_resolution',
      fallback_prompt_type: 'latest_scan',
      questionText: 'Que dois-je travailler apres ce scan ?',
      priorityMetric: 'posture_score',
    });

    const rendered = render(<CoachScreen />);

    expect(mockMutateAsync).not.toHaveBeenCalled();

    mockCoachEntriesState = {
      ...mockCoachEntriesState,
      data: [createCoachEntry()],
      isLoading: false,
    };

    rendered.rerender(<CoachScreen />);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'latest_scan_issue_resolution',
          questionKey: null,
          questionText: 'Que dois-je travailler apres ce scan ?',
          selectedScanId: 'scan-auto-123',
        }),
      );
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'coach_scan_result_auto_submit_started',
      expect.objectContaining({
        scan_id: 'scan-auto-123',
        scan_type: 'body',
      }),
    );

    rendered.rerender(<CoachScreen />);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('treats an edited scan result route question as a true free-text request', async () => {
    mockLocalSearchParams.mockReturnValue({
      source: 'scan_result',
      scanId: 'scan-edit-123',
      promptType: 'latest_scan',
      questionText: 'Que devrais-je ameliorer a partir de ce scan ?',
    });

    const rendered = render(<CoachScreen />);

    await waitFor(() => {
      expect(
        rendered.getByTestId('coach-settings-inline-question-input').props.value,
      ).toBe('Que devrais-je ameliorer a partir de ce scan ?');
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    fireEvent.changeText(
      rendered.getByTestId('coach-settings-inline-question-input'),
      'Question modifiee avant envoi',
    );
    fireEvent.press(rendered.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          questionKey: null,
          questionText: 'Question modifiee avant envoi',
        }),
      );
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('falls back from a locked scan result prompt to an accessible fallback prompt', async () => {
    mockLocalSearchParams.mockReturnValue({
      source: 'scan_result',
      scanId: 'scan-fallback-123',
      promptType: 'nutrition_focus',
      fallback_prompt_type: 'face_focus',
    });

    const rendered = render(<CoachScreen />);

    await waitFor(() => {
      expect(
        rendered.getByTestId('coach-settings-inline-question-input').props.value,
      ).toBe('Comment maintenir mes bons résultats après ce scan ?');
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    fireEvent.press(rendered.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'face_focus',
          questionKey: null,
          questionText: 'Comment maintenir mes bons résultats après ce scan ?',
          selectedScanId: 'scan-fallback-123',
        }),
      );
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('starts without a selected question and keeps the free draft independent when opening modes', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:30:00.000Z'));
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        ...mockAuthState.userProfile,
        account_tier: 'premium',
      },
    };
    try {
      const screen = render(<CoachScreen />);
      const questionInput = screen.getByTestId(
        'coach-settings-inline-question-input',
      );
      const initialQuestion = questionInput.props.value;

      expect(initialQuestion).toBe('');
      expect(
        screen.getByTestId('coach-settings-inline-question-input-card').props
          .accessibilityState?.selected,
      ).toBe(false);
      expect(
        screen.queryByTestId('coach-settings-inline-question-input-selected-badge'),
      ).toBeNull();
      expectActionComposerSummary(screen);
      expect(screen.queryByText('Noah · Question requise')).toBeNull();
      expect(
        screen.getByTestId('coach-action-primary').props.accessibilityState
          ?.disabled,
      ).toBe(false);

      fireEvent.press(
        screen.getByTestId('coach-settings-inline-mode-picker-card-nutrition_focus'),
      );

      expect(
        screen.getByTestId('coach-settings-inline-question-input').props.value,
      ).toBe(initialQuestion);
      expect(
        screen.getByTestId('coach-settings-inline-question-input-card').props
          .accessibilityState?.selected,
      ).toBe(false);
      expect(
        screen.queryByTestId('coach-settings-inline-question-input-selected-badge'),
      ).toBeNull();
      expect(
        screen.getByTestId('coach-settings-inline-mode-picker-card-nutrition_focus')
          .props.accessibilityState?.expanded,
      ).toBe(true);
      expect(
        screen.getByTestId('coach-settings-inline-mode-picker-card-nutrition_focus')
          .props.accessibilityState?.selected,
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('places the free question input before coach and mode suggestions', () => {
    const rendered = render(<CoachScreen />);
    const testIds = collectTestIds(rendered.toJSON());

    expect(testIds.indexOf('coach-settings-inline-question-input')).toBeLessThan(
      testIds.indexOf('coach-settings-inline-persona-rail'),
    );
    expect(testIds.indexOf('coach-settings-inline-question-input')).toBeLessThan(
      testIds.indexOf('coach-settings-inline-mode-picker'),
    );
    expect(testIds.indexOf('coach-settings-inline-question-input')).toBeLessThan(
      testIds.indexOf('coach-settings-inline-mode-picker-card-latest_scan'),
    );
    expect(testIds).not.toContain('coach-settings-inline-question-list');
  });

  it('keeps a typed free question when the mode changes', async () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        ...mockAuthState.userProfile,
        account_tier: 'premium',
      },
    };
    const screen = render(<CoachScreen />);

    enterCoachQuestion(screen);
    expect(
      screen.getByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeTruthy();
    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-nutrition_focus'),
    );

    expect(
      screen.getByTestId('coach-settings-inline-question-input').props.value,
    ).toBe(DEFAULT_FREE_COACH_QUESTION);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          questionKey: null,
          questionText: DEFAULT_FREE_COACH_QUESTION,
        }),
      );
    });
  });

  it('shows suggestions inline for only one opened prompt card at a time', () => {
    mockAuthState = {
      ...mockAuthState,
      userProfile: {
        ...mockAuthState.userProfile,
        account_tier: 'premium',
      },
    };
    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-latest_scan'),
    );
    expect(
      screen.getByTestId('coach-settings-inline-mode-picker-suggestions-latest_scan'),
    ).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-nutrition_focus'),
    );

    expect(
      screen.queryByTestId(
        'coach-settings-inline-mode-picker-suggestions-latest_scan',
      ),
    ).toBeNull();
    expect(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-suggestions-nutrition_focus',
      ),
    ).toBeTruthy();
  });

  it.each([
    ['2026-04-06T08:00:00.000Z', 'nutrition_focus__breakfast_no_crash'],
    ['2026-04-06T12:30:00.000Z', 'nutrition_focus__simple_lunch_balance'],
    ['2026-04-06T19:30:00.000Z', 'nutrition_focus__light_recovery_dinner'],
  ])(
    'orders nutrition presets by contextual relevance at %s',
    (isoDate, expectedFirstQuestionKey) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(isoDate));
      mockAuthState = {
        ...mockAuthState,
        userProfile: {
          ...mockAuthState.userProfile,
          account_tier: 'premium',
        },
      };

      try {
        const screen = render(<CoachScreen />);

        fireEvent.press(
          screen.getByTestId('coach-settings-inline-mode-picker-card-nutrition_focus'),
        );

        const questionIds = collectTestIds(
          screen.getByTestId(
            'coach-settings-inline-mode-picker-suggestions-nutrition_focus',
          ),
        ).filter((testId) =>
          testId.startsWith('coach-settings-inline-mode-picker-question-'),
        );

        expect(questionIds[0]).toBe(
          `coach-settings-inline-mode-picker-question-${expectedFirstQuestionKey}`,
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('keeps a true free-text question when the locale changes', () => {
    const screen = render(<CoachScreen />);
    const customQuestion = 'Sur quoi je dois me concentrer avant ma seance ce soir ?';

    fireEvent.changeText(
      screen.getByTestId('coach-settings-inline-question-input'),
      customQuestion,
    );

    act(() => {
      mockLocaleState.locale = 'en';
      screen.rerender(<CoachScreen />);
    });

    expect(
      screen.getByTestId('coach-settings-inline-question-input').props.value,
    ).toBe(customQuestion);
  });

  it('fills the composer from a suggested question without auto-submit and sends the preset key', async () => {
    const screen = render(<CoachScreen />);
    const selectedQuestionText = resolveCoachQuestionText(
      'latest_scan__three_simple_actions',
      'fr',
    );

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-latest_scan'),
    );
    fireEvent.press(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions',
      ),
    );
    expect(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions-selected-badge',
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions',
      ).props.accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('coach-settings-inline-mode-picker-card-latest_scan')
        .props.accessibilityState?.selected,
    ).toBe(false);
    expect(
      screen.queryByTestId(
        'coach-settings-inline-mode-picker-card-latest_scan-selected-badge',
      ),
    ).toBeNull();
    expect(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-card-latest_scan-contains-selection-indicator',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeNull();
    expect(
      screen.getByTestId('coach-settings-inline-question-input').props.value,
    ).toBe('');
    expect(screen.getAllByText(selectedQuestionText).length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'latest_scan',
          personaKey: 'gentle_supportive',
          questionKey: 'latest_scan__three_simple_actions',
          questionText: selectedQuestionText,
        }),
      );
    });
  });

  it('switches the selection back to the free question field when it is focused', () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-latest_scan'),
    );
    fireEvent.press(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions',
      ),
    );

    expect(
      screen.getByTestId('coach-settings-inline-question-input-card').props
        .accessibilityState?.selected,
    ).toBe(false);
    expect(
      screen.queryByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeNull();

    fireEvent(screen.getByTestId('coach-settings-inline-question-input'), 'focus');

    expect(
      screen.getByTestId('coach-settings-inline-question-input-card').props
        .accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeTruthy();
  });

  it('clears question_key when the preset question is edited and sends only free text', async () => {
    mockMutateAsync.mockResolvedValue({
      success: true,
      entry_id: 'entry-free-question',
      persona_key: 'gentle_supportive',
      prompt_type: 'free_question',
      question_key: null,
      question_text: 'Sur quoi je dois me concentrer avant ma seance ce soir ?',
      cached: false,
      fallback: false,
      status: 'ready',
      title: 'Question libre',
      body: 'Priorise la recuperation avant ta seance.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
      payload: {},
    });

    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-latest_scan'),
    );
    fireEvent.press(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions',
      ),
    );
    fireEvent.changeText(
      screen.getByTestId('coach-settings-inline-question-input'),
      'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    );
    expect(
      screen.getByTestId('coach-settings-inline-question-input-selected-badge'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions-selected-badge',
      ),
    ).toBeNull();
    fireEvent.press(screen.getByTestId('coach-action-primary'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptType: 'free_question',
          personaKey: 'gentle_supportive',
          questionKey: null,
          questionText:
            'Sur quoi je dois me concentrer avant ma seance ce soir ?',
        }),
      );
    });
    expectActionComposerSummary(screen);
    expect(
      screen.queryByText('Sur quoi je dois me concentrer avant ma seance ce soir ?'),
    ).toBeNull();
  });

  it('shows free-question feedback when editing a selected suggestion to empty text', async () => {
    const screen = render(<CoachScreen />);

    fireEvent.press(
      screen.getByTestId('coach-settings-inline-mode-picker-card-latest_scan'),
    );
    fireEvent.press(
      screen.getByTestId(
        'coach-settings-inline-mode-picker-question-latest_scan__three_simple_actions',
      ),
    );
    fireEvent.changeText(
      screen.getByTestId('coach-settings-inline-question-input'),
      '',
    );

    expect(
      screen.getByTestId('coach-action-primary').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId('coach-action-primary'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(
      'Écris ta demande',
      'Ajoute une question avant de demander un conseil.',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.any(String),
        }),
      ]),
      expect.anything(),
      expect.objectContaining({ emoji: null }),
    );
  });
});
