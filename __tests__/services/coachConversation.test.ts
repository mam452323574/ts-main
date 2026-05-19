import { generateCoachConversationClientRequestId } from '@/services/coachConversation';

describe('coachConversation service helpers', () => {
  describe('generateCoachConversationClientRequestId', () => {
    it('produces a stable UUIDv4 shape', () => {
      const id = generateCoachConversationClientRequestId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('never returns the same id twice in a row', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 32; i += 1) {
        const id = generateCoachConversationClientRequestId();
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    });
  });
});
