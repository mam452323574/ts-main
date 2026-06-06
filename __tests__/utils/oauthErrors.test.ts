import {
  OAUTH_CANCELLED_ERROR_NAME,
  createOAuthCancelledError,
  isOAuthCancellationError,
} from '@/utils/oauthErrors';

describe('createOAuthCancelledError', () => {
  it('tags the error with the cancellation name and flag', () => {
    const error = createOAuthCancelledError('Authentification annulée');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(OAUTH_CANCELLED_ERROR_NAME);
    expect(error.cancelled).toBe(true);
    expect(error.message).toBe('Authentification annulée');
  });

  it('produces an error recognised by isOAuthCancellationError', () => {
    expect(isOAuthCancellationError(createOAuthCancelledError('x'))).toBe(true);
  });
});

describe('isOAuthCancellationError', () => {
  it('recognises the cancelled flag', () => {
    expect(isOAuthCancellationError({ cancelled: true })).toBe(true);
  });

  it('recognises the cancellation error name', () => {
    expect(
      isOAuthCancellationError({ name: OAUTH_CANCELLED_ERROR_NAME }),
    ).toBe(true);
  });

  it('returns false for a plain error', () => {
    expect(isOAuthCancellationError(new Error('cancelled'))).toBe(false);
  });

  it('returns false for unrelated values', () => {
    expect(isOAuthCancellationError(null)).toBe(false);
    expect(isOAuthCancellationError(undefined)).toBe(false);
    expect(isOAuthCancellationError('cancelled')).toBe(false);
    expect(isOAuthCancellationError({ code: 'signup_rate_limited' })).toBe(
      false,
    );
  });
});
