import { formatCoachConversationQuotaDuration } from '@/utils/coachConversationFormatting';

describe('formatCoachConversationQuotaDuration', () => {
  it.each([
    [72 * 60 * 60 * 1000, '3 jours'],
    [48 * 60 * 60 * 1000, '2 jours'],
    [24 * 60 * 60 * 1000, '1 jour'],
    [15 * 60 * 60 * 1000, '15h'],
    [45 * 60 * 1000, '45min'],
  ])('formats %i milliseconds as %s', (remainingMs, label) => {
    expect(formatCoachConversationQuotaDuration(remainingMs)).toBe(label);
  });

  it('rounds upward in the unit displayed', () => {
    expect(formatCoachConversationQuotaDuration(24 * 60 * 60 * 1000 + 1)).toBe(
      '2 jours',
    );
    expect(formatCoachConversationQuotaDuration(15 * 60 * 60 * 1000 + 1)).toBe(
      '16h',
    );
    expect(formatCoachConversationQuotaDuration(45 * 60 * 1000 + 1)).toBe(
      '46min',
    );
  });
});
