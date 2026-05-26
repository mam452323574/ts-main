import {
  COACH_CONVERSATION_SLIDING_WINDOW_SIZE,
  buildSlidingWindowMessages,
  type CoachConversationStoredMessage,
} from '@/supabase/functions/_shared/coachConversation';

function makeMessage(
  id: number,
  role: 'user' | 'assistant' | 'system',
  content: string,
  status: string = 'ready',
): CoachConversationStoredMessage {
  return {
    id: `m-${id}`,
    role,
    content,
    created_at: new Date(2026, 0, 1, 0, id).toISOString(),
    status,
  };
}

describe('coachConversation sliding window', () => {
  it('exports a sliding window size of 40 (anti-regression sentinel)', () => {
    expect(COACH_CONVERSATION_SLIDING_WINDOW_SIZE).toBe(40);
  });

  it('keeps the last 40 messages from history and appends the new user turn', () => {
    const history: CoachConversationStoredMessage[] = [];
    for (let i = 0; i < 50; i += 1) {
      history.push(makeMessage(i, i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`));
    }

    const result = buildSlidingWindowMessages(history, 'nouveau message');

    expect(result).toHaveLength(41);
    expect(result[result.length - 1]).toEqual({ role: 'user', content: 'nouveau message' });
    expect(result[0].content).toBe('msg-10');
    expect(result[39].content).toBe('msg-49');
  });

  it('preserves chronological order of history entries', () => {
    const history = [
      makeMessage(1, 'user', 'Q1'),
      makeMessage(2, 'assistant', 'R1'),
      makeMessage(3, 'user', 'Q2'),
    ];

    const result = buildSlidingWindowMessages(history, 'Q3');

    expect(result).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'R1' },
      { role: 'user', content: 'Q2' },
      { role: 'user', content: 'Q3' },
    ]);
  });

  it('includes ready and streaming statuses, excludes error and pending', () => {
    const history = [
      makeMessage(1, 'user', 'ready-user', 'ready'),
      makeMessage(2, 'assistant', 'streaming-assistant', 'streaming'),
      makeMessage(3, 'assistant', 'error-assistant', 'error'),
      makeMessage(4, 'user', 'pending-user', 'pending'),
    ];

    const result = buildSlidingWindowMessages(history, 'new');

    expect(result).toEqual([
      { role: 'user', content: 'ready-user' },
      { role: 'assistant', content: 'streaming-assistant' },
      { role: 'user', content: 'new' },
    ]);
  });

  it('drops entries whose content is whitespace-only', () => {
    const history = [
      makeMessage(1, 'user', 'real question'),
      makeMessage(2, 'assistant', '   '),
      makeMessage(3, 'assistant', '\n\n'),
      makeMessage(4, 'user', 'follow-up'),
    ];

    const result = buildSlidingWindowMessages(history, 'tail');

    expect(result).toEqual([
      { role: 'user', content: 'real question' },
      { role: 'user', content: 'follow-up' },
      { role: 'user', content: 'tail' },
    ]);
  });

  it('returns only the new user message when history is empty', () => {
    const result = buildSlidingWindowMessages([], 'salut');

    expect(result).toEqual([{ role: 'user', content: 'salut' }]);
  });

  it('honors a custom window size when provided', () => {
    const history: CoachConversationStoredMessage[] = [];
    for (let i = 0; i < 20; i += 1) {
      history.push(makeMessage(i, i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`));
    }

    const result = buildSlidingWindowMessages(history, 'tail', 5);

    expect(result).toHaveLength(6);
    expect(result.slice(0, 5).map((m) => m.content)).toEqual([
      'msg-15',
      'msg-16',
      'msg-17',
      'msg-18',
      'msg-19',
    ]);
    expect(result[5]).toEqual({ role: 'user', content: 'tail' });
  });
});
