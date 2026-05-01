import { entryOfferSession } from '@/utils/entryOfferSession';

describe('entryOfferSession', () => {
  beforeEach(() => {
    entryOfferSession.reset();
  });

  it('allows a single auto-presentation per user session', () => {
    expect(entryOfferSession.canAutoPresent('user-1')).toBe(true);

    entryOfferSession.markAutoPresentationStarted('user-1');

    expect(entryOfferSession.canAutoPresent('user-1')).toBe(false);
  });

  it('resets when the active user changes', () => {
    entryOfferSession.markAutoPresentationStarted('user-1');

    expect(entryOfferSession.canAutoPresent('user-2')).toBe(true);
    expect(entryOfferSession.canAutoPresent('user-1')).toBe(true);
  });
});
