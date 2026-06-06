import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import CoachChatScreen from '@/screens/CoachChatScreen';
import { CoachServiceError } from '@/services/coach';

const mockUseCoachConversationQuota = jest.fn();
const mockUseCoachConversation = jest.fn();
const mockUseCoachConversationMessages = jest.fn();
const mockSendMutateAsync = jest.fn();
const mockStartMutateAsync = jest.fn();
const mockArchiveMutateAsync = jest.fn();
const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
    setQueryData: (...args: unknown[]) => mockSetQueryData(...args),
  }),
}));

jest.mock('@/hooks/queries/useCoachConversationQuota', () => ({
  useCoachConversationQuota: () => mockUseCoachConversationQuota(),
}));
jest.mock('@/hooks/queries/useCoachConversation', () => ({
  useCoachConversation: (...args: unknown[]) => mockUseCoachConversation(...args),
}));
jest.mock('@/hooks/queries/useCoachConversationMessages', () => ({
  useCoachConversationMessages: (...args: unknown[]) =>
    mockUseCoachConversationMessages(...args),
}));
jest.mock('@/hooks/queries/useSendCoachMessage', () => ({
  useSendCoachMessage: () => ({
    mutateAsync: (...args: unknown[]) => mockSendMutateAsync(...args),
    isPending: false,
  }),
}));
jest.mock('@/hooks/queries/useStartCoachConversation', () => ({
  useStartCoachConversation: () => ({
    mutateAsync: (...args: unknown[]) => mockStartMutateAsync(...args),
    isPending: false,
  }),
}));
jest.mock('@/hooks/queries/useArchiveCoachConversation', () => ({
  useArchiveCoachConversation: () => ({
    mutateAsync: (...args: unknown[]) => mockArchiveMutateAsync(...args),
    isPending: false,
  }),
}));
jest.mock('@/hooks/useVoiceDictation', () => ({
  useVoiceDictation: () => ({
    isSupported: false,
    isListening: false,
    start: jest.fn(),
    stop: jest.fn(),
  }),
}));
jest.mock('@/hooks/useChatAutoScroll', () => ({
  useChatAutoScroll: () => ({
    listRef: { current: null },
    onScroll: jest.fn(),
    onScrollBeginDrag: jest.fn(),
    onScrollEndDrag: jest.fn(),
    onMomentumScrollEnd: jest.fn(),
    onContentSizeChange: jest.fn(),
    scrollToBottom: jest.fn(),
  }),
}));
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

const mockRouterPush = jest.fn();
let mockSearchParams: Record<string, unknown> = { id: undefined };
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    back: jest.fn(),
    dismiss: jest.fn(),
    canDismiss: () => false,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

function makeQuota(overrides: Record<string, unknown> = {}) {
  return {
    tier: 'free',
    account_tier: 'free',
    unlimited: false,
    window_seconds: 259_200,
    premium_today_used: 0,
    premium_today_limit: null,
    premium_today_available: null,
    next_recharge_at: null,
    per_conversation_limit: 20,
    free_used: false,
    free_message_limit: 4,
    free_used_count: 0,
    free_remaining_messages: 4,
    free_next_recharge_at: null,
    free_window_seconds: 259_200,
    free_conversation_id: null,
    quota_exceeded: false,
    as_of: '2026-05-26T10:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversation_id: 'conv-1',
    user_id: 'test-user',
    role: 'user',
    content: 'Hello coach',
    created_at: '2026-05-26T10:00:00.000Z',
    updated_at: null,
    model: null,
    provider: null,
    prompt_tokens: null,
    completion_tokens: null,
    generation_ms: null,
    status: 'ready',
    error_code: null,
    metadata: {},
    ...overrides,
  };
}

// The backend seeds this auto-generated system welcome on every fresh
// conversation, so a "fresh" thread is never literally empty.
function makeWelcomeMessage(overrides: Record<string, unknown> = {}) {
  return makeMessage({
    id: 'welcome-1',
    role: 'system',
    content: 'Bienvenue ! Pose ta première question.',
    metadata: { auto_generated: true, kind: 'welcome' },
    ...overrides,
  });
}

describe('CoachChatScreen — rolling free quota', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: undefined };
    mockUseCoachConversation.mockReturnValue({ data: null, isPending: false });
    mockUseCoachConversationMessages.mockReturnValue({
      items: [],
      dataUpdatedAt: Date.now(),
    });
  });

  it('lets a free user with credits enter the chat with the composer enabled', () => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({ free_remaining_messages: 4 }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    const input = screen.getByTestId('coach-chat-composer-input');
    expect(input.props.editable).toBe(true);

    // No automatic premium upsell while credits remain.
    expect(screen.queryByTestId('coach-chat-upsell-inline')).toBeNull();
  });

  it.each([
    { remaining: 4, used: 0, label: 'Messages gratuits : 4/4' },
    { remaining: 3, used: 1, label: 'Messages gratuits : 3/4' },
    { remaining: 2, used: 2, label: 'Messages gratuits : 2/4' },
  ])('renders the fraction counter $label', ({ remaining, used, label }) => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        free_remaining_messages: remaining,
        free_used_count: used,
      }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Dernier message')).toBeNull();
  });

  it('keeps the counter visible with the last-message hint at 1/4', () => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({ free_remaining_messages: 1, free_used_count: 3 }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    expect(screen.getByText('Messages gratuits : 1/4')).toBeTruthy();
    expect(screen.getByText('Dernier message')).toBeTruthy();
  });

  it('renders a single actionable card when the free quota is exhausted', () => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        free_remaining_messages: 0,
        free_used_count: 4,
        free_used: true,
        quota_exceeded: true,
        free_next_recharge_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    const input = screen.getByTestId('coach-chat-composer-input');
    expect(input.props.editable).toBe(false);
    expect(screen.getByText('Messages gratuits : 0/4')).toBeTruthy();

    // The standalone premium upsell must not render alongside the quota banner —
    // a single unified card is the whole point of this fix.
    expect(screen.queryByTestId('coach-chat-upsell-inline')).toBeNull();

    const banner = screen.getByTestId('coach-chat-quota-banner');
    expect(banner.props.accessibilityRole).toBe('button');
    expect(screen.getByText('Passer premium')).toBeTruthy();

    fireEvent.press(banner);
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith('/premium-upgrade');
  });

  it('shows the countdown body when free_next_recharge_at is in the future', () => {
    jest.useFakeTimers();
    const now = new Date('2026-05-26T10:00:00.000Z');
    jest.setSystemTime(now);
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        free_remaining_messages: 0,
        free_used_count: 4,
        free_used: true,
        quota_exceeded: true,
        free_next_recharge_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      }),
      isPending: false,
    });

    const rendered = render(<CoachChatScreen />);
    try {
      expect(screen.getByText('Recharge gratuite dans 2h')).toBeTruthy();
      expect(screen.queryByText('Recharge gratuite à venir')).toBeNull();
    } finally {
      rendered.unmount();
      jest.useRealTimers();
    }
  });

  it('falls back to a vague label when no recharge timestamp is provided', () => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        free_remaining_messages: 0,
        free_used_count: 4,
        free_used: true,
        quota_exceeded: true,
        free_next_recharge_at: null,
        next_recharge_at: null,
      }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    expect(screen.getByText('Recharge gratuite à venir')).toBeTruthy();
    expect(screen.queryByText('Recharge gratuite imminente')).toBeNull();
  });

  it('invalidates the quota query when free_next_recharge_at is already in the past', () => {
    jest.useFakeTimers();
    const now = new Date('2026-05-26T10:00:00.000Z');
    jest.setSystemTime(now);
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        free_remaining_messages: 0,
        free_used_count: 4,
        free_used: true,
        quota_exceeded: true,
        // 5 minutes in the past — TanStack's interval may not have fired yet.
        free_next_recharge_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      }),
      isPending: false,
    });

    const rendered = render(<CoachChatScreen />);
    try {
      expect(mockInvalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: expect.arrayContaining(['coachConversationQuota']),
        }),
      );
    } finally {
      rendered.unmount();
      jest.useRealTimers();
    }
  });

  it('uses the server-provided free_message_limit for the counter when available', () => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        free_message_limit: 6,
        free_remaining_messages: 2,
        free_used_count: 4,
      }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    expect(screen.getByText('Messages gratuits : 2/6')).toBeTruthy();
  });

  it('does not render any quota banner for admin tier', () => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        tier: 'admin',
        account_tier: 'admin',
        free_remaining_messages: null,
        free_used_count: null,
        free_message_limit: null,
      }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    expect(screen.queryByTestId('coach-chat-quota-banner')).toBeNull();
    expect(screen.queryByTestId('coach-chat-upsell-inline')).toBeNull();
  });

  it.each([
    { delayMs: 72 * 60 * 60 * 1000, label: 'Recharge gratuite dans 3 jours' },
    { delayMs: 15 * 60 * 60 * 1000, label: 'Recharge gratuite dans 15h' },
    { delayMs: 45 * 60 * 1000, label: 'Recharge gratuite dans 45min' },
  ])('renders human recharge time: $label', ({ delayMs, label }) => {
    jest.useFakeTimers();
    const now = new Date('2026-05-26T10:00:00.000Z');
    jest.setSystemTime(now);
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        free_remaining_messages: 0,
        free_used_count: 4,
        free_used: true,
        quota_exceeded: true,
        free_next_recharge_at: new Date(now.getTime() + delayMs).toISOString(),
      }),
      isPending: false,
    });

    const rendered = render(<CoachChatScreen />);

    try {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByText(/72h 0m/)).toBeNull();
    } finally {
      rendered.unmount();
      jest.useRealTimers();
    }
  });

  it('keeps the composer enabled and hides the upsell for premium users with quota', () => {
    mockUseCoachConversationQuota.mockReturnValue({
      data: makeQuota({
        tier: 'premium',
        account_tier: 'premium',
        free_used: false,
        free_remaining_messages: null,
        free_used_count: null,
        premium_today_limit: 40,
        premium_today_used: 2,
        premium_today_available: 38,
      }),
      isPending: false,
    });

    render(<CoachChatScreen />);

    const input = screen.getByTestId('coach-chat-composer-input');
    expect(input.props.editable).toBe(true);
    expect(screen.getByText('Aujourd’hui')).toBeTruthy();
    expect(screen.queryByText(/Messages gratuits/)).toBeNull();
    expect(screen.queryByText('Dernier message')).toBeNull();
    expect(screen.queryByTestId('coach-chat-upsell-inline')).toBeNull();
  });

  it('absorbs a server quota-exhausted error and refreshes the cached quota', async () => {
    const initialQuota = makeQuota({ free_remaining_messages: 4 });
    mockUseCoachConversationQuota.mockReturnValue({
      data: initialQuota,
      isPending: false,
    });

    const newQuota = makeQuota({
      free_remaining_messages: 0,
      free_used: true,
      free_used_count: 4,
      quota_exceeded: true,
      free_next_recharge_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    mockStartMutateAsync.mockRejectedValueOnce(
      new CoachServiceError('Quota exhausted', {
        code: 'coach_free_conversation_message_limit_reached',
        details: { quota: newQuota },
      }),
    );

    render(<CoachChatScreen />);

    fireEvent.changeText(
      screen.getByTestId('coach-chat-composer-input'),
      'Hello',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('coach-chat-composer-send-button'));
    });

    await waitFor(() => {
      expect(mockSetQueryData).toHaveBeenCalledWith(
        expect.anything(),
        newQuota,
      );
    });
  });

  describe('route params — "new=1" and "persona_key"', () => {
    it('ignores any "id" param when "new=1" is set and lands on an empty composer', () => {
      mockSearchParams = {
        id: 'stale-conv-id',
        new: '1',
        persona_key: 'strict_tough',
      };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });

      render(<CoachChatScreen />);

      // The screen passes the active id (here: null) to useCoachConversation.
      // forceNew must short-circuit the "stale-conv-id" param so no fetch
      // is initiated against a conversation the user explicitly left.
      const calls = mockUseCoachConversation.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCallArg = calls[calls.length - 1]?.[0];
      expect(lastCallArg).toEqual({ conversationId: null });
    });

    it('honours a plain "id" param without "new" by resuming the conversation', () => {
      mockSearchParams = { id: 'resume-conv-id' };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });

      render(<CoachChatScreen />);

      const calls = mockUseCoachConversation.mock.calls;
      const lastCallArg = calls[calls.length - 1]?.[0];
      expect(lastCallArg).toEqual({ conversationId: 'resume-conv-id' });
    });

    it('treats new=true as truthy (parity with new=1)', () => {
      mockSearchParams = {
        id: 'stale-conv-id',
        new: 'true',
        persona_key: 'playful_light',
      };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });

      render(<CoachChatScreen />);

      const calls = mockUseCoachConversation.mock.calls;
      const lastCallArg = calls[calls.length - 1]?.[0];
      expect(lastCallArg).toEqual({ conversationId: null });
    });
  });

  describe('header persona — source of truth', () => {
    // Regression: opening an old conversation whose persona differs from the
    // profile's active persona used to render the profile's coach (avatar +
    // name) in the top-left, while only the message-send path used the
    // conversation's persona. The header must follow the loaded conversation.
    it('renders the conversation persona in the header, not the profile persona', () => {
      mockSearchParams = { id: 'old-conv-id' };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });
      mockUseCoachConversation.mockReturnValue({
        data: {
          id: 'old-conv-id',
          persona_key: 'patient_calm',
          status: 'active',
        },
        isPending: false,
      });

      render(<CoachChatScreen />);

      const title = screen.getByTestId('coach-chat-screen-header-title');
      expect(title.props.children).toBe('Mira');
      // Avatar slot must render (driven by personaVisual, now derived from
      // the conversation persona).
      expect(screen.getByTestId('coach-chat-screen-header-avatar')).toBeTruthy();
    });

    it('falls back to the profile persona for a brand-new conversation with no param', () => {
      mockSearchParams = { id: undefined };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });
      mockUseCoachConversation.mockReturnValue({ data: null, isPending: false });

      render(<CoachChatScreen />);

      // Default profile mock has no coach_persona_key → defaults to Noah.
      const title = screen.getByTestId('coach-chat-screen-header-title');
      expect(title.props.children).toBe('Noah');
    });

    it('honours an explicit persona_key param when starting a fresh conversation', () => {
      mockSearchParams = { new: '1', persona_key: 'analytical_precise' };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });
      mockUseCoachConversation.mockReturnValue({ data: null, isPending: false });

      render(<CoachChatScreen />);

      const title = screen.getByTestId('coach-chat-screen-header-title');
      expect(title.props.children).toBe('Elias');
    });
  });

  describe('starter on a freshly-created conversation', () => {
    // Regression: pressing "Nouvelle conv" in the inbox creates the
    // conversation upstream — and the backend seeds an auto-generated `system`
    // welcome message — then lands the user here with an id already set. The
    // starter must show even though the thread is not literally empty: it has
    // exactly one `system` welcome and no real user/assistant turn yet.
    it('renders 4 starter suggestions when a fresh conversation only has the welcome message', () => {
      mockSearchParams = { id: 'fresh-conv-id' };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });
      mockUseCoachConversation.mockReturnValue({
        data: {
          id: 'fresh-conv-id',
          persona_key: 'gentle_supportive',
          status: 'active',
        },
        isPending: false,
      });
      // Realistic fresh-conversation state: a single seeded `system` welcome.
      mockUseCoachConversationMessages.mockReturnValue({
        items: [makeWelcomeMessage({ conversation_id: 'fresh-conv-id' })],
        dataUpdatedAt: Date.now(),
      });

      render(<CoachChatScreen />);

      expect(screen.getByTestId('coach-chat-starter')).toBeTruthy();
      // The starter renders one suggestion per item — 4 items expected,
      // sampled deterministically from the FR pool.
      expect(screen.getByTestId('coach-chat-starter-suggestion-starter-0')).toBeTruthy();
      expect(screen.getByTestId('coach-chat-starter-suggestion-starter-1')).toBeTruthy();
      expect(screen.getByTestId('coach-chat-starter-suggestion-starter-2')).toBeTruthy();
      expect(screen.getByTestId('coach-chat-starter-suggestion-starter-3')).toBeTruthy();
    });

    it('hides the starter once a real user/assistant turn exists', () => {
      mockSearchParams = { id: 'started-conv-id' };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });
      mockUseCoachConversation.mockReturnValue({
        data: {
          id: 'started-conv-id',
          persona_key: 'gentle_supportive',
          status: 'active',
        },
        isPending: false,
      });
      // Welcome + a real user turn → the conversation is no longer "fresh".
      mockUseCoachConversationMessages.mockReturnValue({
        items: [
          makeWelcomeMessage({ conversation_id: 'started-conv-id' }),
          makeMessage({
            id: 'user-1',
            conversation_id: 'started-conv-id',
            role: 'user',
            content: 'Comment mieux dormir ?',
          }),
        ],
        dataUpdatedAt: Date.now(),
      });

      render(<CoachChatScreen />);

      expect(screen.queryByTestId('coach-chat-starter')).toBeNull();
    });

    it('hides the starter while an existing conversation is still loading its history', () => {
      mockSearchParams = { id: 'loading-conv-id' };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });
      mockUseCoachConversation.mockReturnValue({
        data: {
          id: 'loading-conv-id',
          persona_key: 'gentle_supportive',
          status: 'active',
        },
        isPending: false,
      });
      // dataUpdatedAt === 0 means the messages query hasn't resolved yet.
      mockUseCoachConversationMessages.mockReturnValue({
        items: [],
        dataUpdatedAt: 0,
      });

      render(<CoachChatScreen />);

      // No starter while the existing history is still in flight — we don't
      // want to flash suggestions on a thread that already has messages.
      expect(screen.queryByTestId('coach-chat-starter')).toBeNull();
    });

    it('picks deterministic suggestions per conversation id', () => {
      mockSearchParams = { id: 'deterministic-conv-id' };
      mockUseCoachConversationQuota.mockReturnValue({
        data: makeQuota({ free_remaining_messages: 4 }),
        isPending: false,
      });
      mockUseCoachConversation.mockReturnValue({
        data: {
          id: 'deterministic-conv-id',
          persona_key: 'gentle_supportive',
          status: 'active',
        },
        isPending: false,
      });
      mockUseCoachConversationMessages.mockReturnValue({
        items: [],
        dataUpdatedAt: Date.now(),
      });

      const first = render(<CoachChatScreen />);
      const firstLabels = [0, 1, 2, 3].map(
        (i) =>
          first
            .getByTestId(`coach-chat-starter-suggestion-starter-${i}`)
            .findByType('Text' as any).props.children,
      );
      first.unmount();

      const second = render(<CoachChatScreen />);
      const secondLabels = [0, 1, 2, 3].map(
        (i) =>
          second
            .getByTestId(`coach-chat-starter-suggestion-starter-${i}`)
            .findByType('Text' as any).props.children,
      );

      expect(secondLabels).toEqual(firstLabels);
    });
  });
});
