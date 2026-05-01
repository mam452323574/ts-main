import { CoachServiceError, resolveCoachFailureKindFromError } from '@/services/coach';
import { isDefaultCoachDisclaimer } from '@/shared/coachCopy';
import {
  getCoachCtaTranslationKey,
  resolveCoachCtaRoute,
  type CoachCtaRoute,
} from '@/utils/coachRoutes';

type TranslateFn = (scope: string, options?: Record<string, unknown>) => string;

function resolveCoachErrorTranslationKey(error: unknown) {
  if (error instanceof CoachServiceError) {
    const normalizedCode = error.code?.trim().toLowerCase() ?? '';

    if (
      normalizedCode === 'invalid_coach_response' ||
      normalizedCode.endsWith('_schema_mismatch') ||
      normalizedCode.includes('invalid_payload') ||
      normalizedCode.includes('invalid_response')
    ) {
      return 'coach.error_body_invalid_response';
    }
  }

  switch (resolveCoachFailureKindFromError(error)) {
    case 'provider_request_failed':
      return 'coach.error_body_provider_unreachable';
    case 'invalid_provider_response':
      return 'coach.error_body_invalid_response';
    case 'provider_unavailable':
    case 'generic':
    default:
      return 'coach.error_body';
  }
}

export function resolveCoachUserFacingErrorMessage(
  error: unknown,
  t: TranslateFn,
) {
  return t(resolveCoachErrorTranslationKey(error));
}

export function resolveCoachDisclaimerText(
  disclaimer: string | null | undefined,
  t: TranslateFn,
) {
  const trimmedDisclaimer = disclaimer?.trim();

  if (!trimmedDisclaimer || isDefaultCoachDisclaimer(trimmedDisclaimer)) {
    return t('coach.disclaimer_default');
  }

  return trimmedDisclaimer;
}

export function resolveCoachCtaLabel(
  ctaRoute: CoachCtaRoute | string | null | undefined,
  providerLabel: string | null | undefined,
  t: TranslateFn,
) {
  const normalizedRoute =
    typeof ctaRoute === 'string' ? resolveCoachCtaRoute(ctaRoute) : ctaRoute;
  const translationKey = getCoachCtaTranslationKey(normalizedRoute ?? null);

  if (translationKey) {
    return t(translationKey);
  }

  const trimmedProviderLabel = providerLabel?.trim();
  return trimmedProviderLabel && trimmedProviderLabel.length > 0
    ? trimmedProviderLabel
    : null;
}
