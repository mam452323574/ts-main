import { CoachServiceError } from '@/services/coach';

const NON_RETRYABLE_COACH_ERROR_SUFFIXES = [
  '_unavailable',
  '_schema_mismatch',
  '_policy_denied',
] as const;

function hasNonRetryableCoachErrorCode(error: CoachServiceError) {
  const errorCode = typeof error.code === 'string' ? error.code : null;

  return !!errorCode &&
    NON_RETRYABLE_COACH_ERROR_SUFFIXES.some((suffix) => errorCode.endsWith(suffix));
}

export function isRetryableCoachReadError(error: unknown) {
  if (!(error instanceof CoachServiceError)) {
    return true;
  }

  if (hasNonRetryableCoachErrorCode(error)) {
    return false;
  }

  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    return false;
  }

  return true;
}

export function shouldRetryCoachReadQuery(failureCount: number, error: unknown) {
  return isRetryableCoachReadError(error) && failureCount < 2;
}
