import {
  COACH_CHAT_STARTER_SUGGESTIONS_FR,
  pickRandomStarterSuggestions,
} from '@/shared/coachChatStarterSuggestions';

describe('coachChatStarterSuggestions', () => {
  it('exposes exactly 250 starter suggestions in French', () => {
    expect(COACH_CHAT_STARTER_SUGGESTIONS_FR).toHaveLength(250);
  });

  it('contains only non-empty unique entries', () => {
    const seen = new Set<string>();
    for (const entry of COACH_CHAT_STARTER_SUGGESTIONS_FR) {
      expect(typeof entry).toBe('string');
      expect(entry.trim().length).toBeGreaterThan(0);
      expect(seen.has(entry)).toBe(false);
      seen.add(entry);
    }
  });

  it('picks the requested count of unique suggestions', () => {
    const picks = pickRandomStarterSuggestions(4, { seed: 'conv-abc' });
    expect(picks).toHaveLength(4);
    expect(new Set(picks).size).toBe(4);
    for (const pick of picks) {
      expect(COACH_CHAT_STARTER_SUGGESTIONS_FR).toContain(pick);
    }
  });

  it('is deterministic for a given seed', () => {
    const first = pickRandomStarterSuggestions(4, { seed: 'conv-deadbeef' });
    const second = pickRandomStarterSuggestions(4, { seed: 'conv-deadbeef' });
    expect(first).toEqual(second);
  });

  it('produces different picks for different seeds', () => {
    const a = pickRandomStarterSuggestions(4, { seed: 'conv-aaaa' });
    const b = pickRandomStarterSuggestions(4, { seed: 'conv-bbbb' });
    expect(a).not.toEqual(b);
  });

  it('caps the pick count at the pool size', () => {
    const tinyPool = ['one', 'two', 'three'];
    const picks = pickRandomStarterSuggestions(10, {
      seed: 'whatever',
      pool: tinyPool,
    });
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
  });

  it('returns an empty array for count <= 0', () => {
    expect(pickRandomStarterSuggestions(0)).toEqual([]);
    expect(pickRandomStarterSuggestions(-1, { seed: 'x' })).toEqual([]);
  });

  it('uses Math.random() when no seed is provided', () => {
    // Two unseeded picks back-to-back should *usually* differ. We allow a
    // single collision retry to avoid flakiness (probability of two
    // identical 4-of-250 picks is vanishingly small even once, but better
    // safe than sorry on CI).
    const a = pickRandomStarterSuggestions(4);
    const b = pickRandomStarterSuggestions(4);
    if (a.join('|') === b.join('|')) {
      const c = pickRandomStarterSuggestions(4);
      expect(a.join('|') === c.join('|')).toBe(false);
    } else {
      expect(a).not.toEqual(b);
    }
  });
});
