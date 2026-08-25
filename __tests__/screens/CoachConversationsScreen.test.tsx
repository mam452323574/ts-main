import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { CoachConversationsScreen } from '@/screens/CoachConversationsScreen';
import type { CoachConversationInboxItem } from '@/shared/coachConversation';
import { LIGHT_COLORS } from '@/constants/theme';
import { getCoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import {
  getCoachActionButtonChrome,
  getCoachConversationCtaChrome,
} from '@/utils/coachActionButtonChrome';

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockUseInfiniteCoachConversations = jest.fn();
const mockStartMutateAsync = jest.fn();
const mockPresentRewardedAdGate = jest.fn();
let mockPersonaKey: string | undefined = 'patient_calm';
let mockIsStartPending = false;
const { useAuth: mockUseAuth } = jest.requireMock('@/contexts/AuthContext') as {
  useAuth: jest.Mock;
};

const defaultAuthState = {
  user: { id: 'test-user', email: 'test@example.com' },
  session: { access_token: 'test-token' },
  userProfile: {
    id: 'test-user',
    account_tier: 'free',
    coach_persona_key: null,
    avatar_url: null,
    has_seen_tutorial: false,
  },
  isLoading: false,
  loading: false,
  signOut: jest.fn(),
  refreshUserProfile: jest.fn(),
  updateUserProfile: jest.fn(),
  updateAvatarUrl: jest.fn(),
  markTutorialSeen: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    back: (...args: unknown[]) => mockRouterBack(...args),
  }),
  useLocalSearchParams: () => ({ persona_key: mockPersonaKey }),
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => null,
}));

jest.mock('@/contexts/AdsContext', () => ({
  useAdsGate: () => ({
    isReady: true,
    presentRewardedAdGate: (...args: unknown[]) =>
      mockPresentRewardedAdGate(...args),
  }),
  AdsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/hooks/queries/useInfiniteCoachConversations', () => ({
  useInfiniteCoachConversations: (...args: unknown[]) =>
    mockUseInfiniteCoachConversations(...args),
}));

jest.mock('@/hooks/queries/useStartCoachConversation', () => ({
  useStartCoachConversation: () => ({
    mutateAsync: (...args: unknown[]) => mockStartMutateAsync(...args),
    isPending: mockIsStartPending,
  }),
}));

function createConversation(
  overrides: Partial<CoachConversationInboxItem> = {},
): CoachConversationInboxItem {
  return {
    id: 'conversation-1',
    user_id: 'user-1',
    created_at: '2026-05-25T09:00:00.000Z',
    updated_at: '2026-05-26T09:00:00.000Z',
    title: null,
    persona_key: 'patient_calm',
    locale: 'fr',
    status: 'active',
    message_count: 3,
    user_message_count: 1,
    account_tier_at_start: 'free',
    last_user_message_at: '2026-05-26T08:00:00.000Z',
    last_assistant_message_at: '2026-05-26T09:00:00.000Z',
    ended_at: null,
    ended_reason: null,
    archived_at: null,
    metadata: {},
    first_user_message_preview: 'Comment mieux dormir ?',
    last_message_preview: 'On peut commencer par ta routine du soir.',
    last_message_at: '2026-05-26T09:00:00.000Z',
    ...overrides,
  };
}

function mockQuery(items: CoachConversationInboxItem[] = []) {
  mockUseInfiniteCoachConversations.mockReturnValue({
    items,
    error: null,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  });
}

describe('CoachConversationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPersonaKey = 'patient_calm';
    mockIsStartPending = false;
    mockUseAuth.mockReturnValue(defaultAuthState);
    mockPresentRewardedAdGate.mockResolvedValue('rewarded');
    mockQuery();
  });

  it('loads only the requested coach and displays an inbox row with message preview', () => {
    mockQuery([createConversation()]);

    const screen = render(<CoachConversationsScreen />);

    expect(mockUseInfiniteCoachConversations).toHaveBeenCalledWith({
      personaKey: 'patient_calm',
      enabled: true,
    });
    expect(screen.getByText('Mira')).toBeTruthy();
    expect(screen.getByText('Comment mieux dormir ?')).toBeTruthy();
    expect(screen.getByText('On peut commencer par ta routine du soir.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-conversations-item-conversation-1'));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/coach/chat',
      params: { id: 'conversation-1' },
    });
  });

  it('renders the newest conversation as featured and keeps following cards compact', () => {
    mockQuery([
      createConversation({
        id: 'conversation-featured',
        first_user_message_preview: 'Je veux reprendre une routine stable.',
        last_message_preview: 'On commence par un rythme simple.',
      }),
      createConversation({
        id: 'conversation-compact',
        first_user_message_preview: 'Comment gérer mes repas ?',
        last_message_preview: 'On peut construire une base flexible.',
      }),
    ]);

    const screen = render(<CoachConversationsScreen />);

    expect(screen.getByTestId('coach-conversations-item-conversation-featured')).toBeTruthy();
    expect(screen.getByTestId('coach-conversations-item-conversation-compact')).toBeTruthy();
  });

  it('uses the dedicated empty state action to create a conversation and opens its chat', async () => {
    mockStartMutateAsync.mockResolvedValue({
      conversation_id: 'conversation-new',
    });

    const screen = render(<CoachConversationsScreen />);

    expect(screen.getByTestId('coach-conversations-empty-state')).toBeTruthy();
    fireEvent.press(screen.getByTestId('coach-conversations-empty-new'));

    await waitFor(() => {
      expect(mockPresentRewardedAdGate).toHaveBeenCalledWith('coach');
      expect(mockStartMutateAsync).toHaveBeenCalledWith({
        personaKey: 'patient_calm',
      });
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/coach/chat',
        params: { id: 'conversation-new' },
      });
    });
  });

  it('cancels new conversation creation when the rewarded gate is declined', async () => {
    mockPresentRewardedAdGate.mockResolvedValueOnce('skipped');

    const screen = render(<CoachConversationsScreen />);

    fireEvent.press(screen.getByTestId('coach-conversations-empty-new'));

    await waitFor(() => {
      expect(mockPresentRewardedAdGate).toHaveBeenCalledWith('coach');
    });
    expect(mockStartMutateAsync).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('fails open when the rewarded gate is unavailable', async () => {
    mockPresentRewardedAdGate.mockResolvedValueOnce('unavailable');
    mockStartMutateAsync.mockResolvedValue({
      conversation_id: 'conversation-unavailable-open',
    });

    const screen = render(<CoachConversationsScreen />);

    fireEvent.press(screen.getByTestId('coach-conversations-empty-new'));

    await waitFor(() => {
      expect(mockStartMutateAsync).toHaveBeenCalledWith({
        personaKey: 'patient_calm',
      });
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/coach/chat',
        params: { id: 'conversation-unavailable-open' },
      });
    });
  });

  it('creates a new conversation from the compose action and disables it while pending', () => {
    mockIsStartPending = true;
    mockQuery([createConversation()]);

    const screen = render(<CoachConversationsScreen />);
    const compose = screen.getByTestId('coach-conversations-new');

    expect(compose.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(compose);
    expect(mockStartMutateAsync).not.toHaveBeenCalled();
  });

  it('shows loading and retry states and supports refresh and pagination', () => {
    const refetch = jest.fn();
    const fetchNextPage = jest.fn();
    mockUseInfiniteCoachConversations.mockReturnValueOnce({
      items: [],
      error: null,
      isFetching: true,
      isFetchingNextPage: false,
      hasNextPage: false,
      refetch,
      fetchNextPage,
    });
    const loading = render(<CoachConversationsScreen />);
    expect(loading.getByTestId('coach-conversations-loading-state')).toBeTruthy();
    loading.unmount();

    mockUseInfiniteCoachConversations.mockReturnValueOnce({
      items: [],
      error: new Error('network'),
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      refetch,
      fetchNextPage,
    });
    const failed = render(<CoachConversationsScreen />);
    fireEvent.press(failed.getByText('Réessayer'));
    expect(refetch).toHaveBeenCalled();
    failed.unmount();

    mockUseInfiniteCoachConversations.mockReturnValueOnce({
      items: [createConversation()],
      error: null,
      isFetching: true,
      isFetchingNextPage: false,
      hasNextPage: true,
      refetch,
      fetchNextPage,
    });
    const list = render(<CoachConversationsScreen />);
    fireEvent(list.getByTestId('coach-conversations-list'), 'refresh');
    fireEvent.press(list.getByTestId('coach-conversations-load-more'));
    expect(refetch).toHaveBeenCalled();
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('does not fetch a mixed list when persona_key is invalid', () => {
    mockPersonaKey = 'unknown';

    const screen = render(<CoachConversationsScreen />);

    expect(mockUseInfiniteCoachConversations).toHaveBeenCalledWith({
      personaKey: null,
      enabled: false,
    });
    expect(screen.getByTestId('coach-conversations-invalid-state')).toBeTruthy();
  });

  it('loads every coach into a global inbox when persona_key is absent, regardless of the active persona', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-27T12:00:00.000Z'));

    try {
      mockPersonaKey = undefined;
      mockUseAuth.mockReturnValue({
        ...defaultAuthState,
        userProfile: {
          ...defaultAuthState.userProfile,
          account_tier: 'premium',
          coach_persona_key: 'patient_calm',
        },
      });
      mockQuery([
        createConversation({
          id: 'conv-noah',
          persona_key: 'gentle_supportive',
          title: null,
          first_user_message_preview: 'How can I sleep better?',
          last_message_preview: 'Try a wind-down routine.',
          last_message_at: '2026-05-26T09:00:00.000Z',
        }),
        createConversation({
          id: 'conv-mira',
          persona_key: 'patient_calm',
          title: null,
          first_user_message_preview: 'Help me stay calm.',
          last_message_preview: 'Breathe out twice as long as in.',
          last_message_at: '2026-05-26T10:00:00.000Z',
        }),
      ]);

      const screen = render(<CoachConversationsScreen />);

      expect(mockUseInfiniteCoachConversations).toHaveBeenCalledWith({
        personaKey: null,
        enabled: true,
      });
      // Header shows the global title.
      expect(screen.getByText('Messages')).toBeTruthy();
      // The active persona is Mira/patient_calm, but the global hub still shows
      // conversations from other coaches like Noah/gentle_supportive.
      expect(screen.getByText('Noah')).toBeTruthy();
      expect(screen.getByText('Mira')).toBeTruthy();
      // Previews come from last_message_preview on each row.
      expect(screen.getByText('Try a wind-down routine.')).toBeTruthy();
      expect(screen.getByText('Breathe out twice as long as in.')).toBeTruthy();
      // Each row keeps its own conversation timestamp in the global hub.
      expect(screen.getAllByText('Hier')).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts a new global conversation with the user profile persona when no filter is set', async () => {
    mockPersonaKey = undefined;
    mockStartMutateAsync.mockResolvedValue({
      conversation_id: 'conv-global-new',
    });

    const screen = render(<CoachConversationsScreen />);

    fireEvent.press(screen.getByTestId('coach-conversations-empty-new'));

    await waitFor(() => {
      // The jest.setup mock returns a free user with no coach_persona_key set,
      // so the screen falls back to DEFAULT_COACH_PERSONA_KEY ('gentle_supportive').
      expect(mockStartMutateAsync).toHaveBeenCalledWith({
        personaKey: 'gentle_supportive',
      });
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/coach/chat',
        params: { id: 'conv-global-new' },
      });
    });
  });

  describe('preview fallback chain', () => {
    it('falls back to first_user_message_preview when last_message_preview is empty', () => {
      mockQuery([
        createConversation({
          id: 'conv-fresh',
          last_message_preview: null,
          first_user_message_preview: 'Tu peux m’aider à dormir mieux ?',
        }),
      ]);

      const screen = render(<CoachConversationsScreen />);

      // The actual user opener wins over the generic "no_preview" placeholder.
      expect(screen.getByText('Tu peux m’aider à dormir mieux ?…')).toBeTruthy();
    });

    it('falls back to the neutral ellipsis placeholder when no previews are available', () => {
      mockQuery([
        createConversation({
          id: 'conv-empty',
          last_message_preview: null,
          first_user_message_preview: null,
        }),
      ]);

      const screen = render(<CoachConversationsScreen />);

      // Updated copy: single ellipsis instead of the misleading
      // "Commence à écrire..." that used to show even on threads with
      // messages whose preview hadn't been populated server-side.
      expect(screen.getByText('…')).toBeTruthy();
    });
  });

  describe('new conversation CTA', () => {
    it('renders a labelled button styled with the bold inbox-tuned action chrome', () => {
      // Filtered inbox → persona_key='patient_calm' (Mira). The CTA uses the
      // bolder inbox-specific chrome (≈45 % accent over the card surface) so
      // each persona is clearly identifiable — the canonical composer chrome
      // would render almost identical near-black pills for every coach in
      // light mode.
      mockQuery([createConversation()]);

      const screen = render(<CoachConversationsScreen />);

      // The header CTA now carries a visible label, not just the icon.
      expect(screen.getByText('Nouvelle conv')).toBeTruthy();

      const personaVisual = getCoachPersonaVisual('patient_calm');
      const expectedChrome = getCoachConversationCtaChrome(
        LIGHT_COLORS,
        false,
        personaVisual.haloTint,
      );
      // Sanity check: the bold chrome MUST produce a different background
      // from both (a) the raw pastel haloTint and (b) the canonical
      // composer chrome — otherwise we slid back to the old design.
      expect(expectedChrome.backgroundColor).not.toBe(personaVisual.haloTint);
      const subtleChrome = getCoachActionButtonChrome(
        LIGHT_COLORS,
        false,
        personaVisual.haloTint,
      );
      expect(expectedChrome.backgroundColor).not.toBe(subtleChrome.backgroundColor);

      const cta = screen.getByTestId('coach-conversations-new');
      const rawStyle = cta.props.style;
      const flat = Array.isArray(rawStyle) ? rawStyle.flat(Infinity) : [rawStyle];
      const bgEntry = flat.find(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          'backgroundColor' in (entry as object) &&
          (entry as { backgroundColor: unknown }).backgroundColor ===
            expectedChrome.backgroundColor,
      );
      expect(bgEntry).toBeTruthy();
    });

    it('produces visibly distinct backgrounds for different personas in light mode', () => {
      // Regression guard for the user-visible "I can't tell coaches apart"
      // bug — every persona's bold-chrome background must be a different
      // colour in light mode so the inbox CTA reads as that coach's pill.
      const personaKeys = [
        'gentle_supportive',
        'strict_tough',
        'motivational_energetic',
        'patient_calm',
        'analytical_precise',
        'playful_light',
      ] as const;
      const backgrounds = new Set(
        personaKeys.map((key) =>
          getCoachConversationCtaChrome(
            LIGHT_COLORS,
            false,
            getCoachPersonaVisual(key).haloTint,
          ).backgroundColor,
        ),
      );
      expect(backgrounds.size).toBe(personaKeys.length);
    });
  });
});
