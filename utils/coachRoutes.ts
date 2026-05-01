export const CANONICAL_COACH_CTA_ROUTES = [
  '/coach-history',
  '/recipes',
  '/exercises',
  '/scan-result',
  '/premium-upgrade',
  '/settings',
  '/notifications',
  '/notification-settings',
] as const;

export type CoachCtaRoute = (typeof CANONICAL_COACH_CTA_ROUTES)[number];

const COACH_CTA_ROUTE_TRANSLATION_KEYS: Record<CoachCtaRoute, string> = {
  '/coach-history': 'coach.cta_routes.history',
  '/recipes': 'coach.cta_routes.recipes',
  '/exercises': 'coach.cta_routes.exercises',
  '/scan-result': 'coach.cta_routes.scan_result',
  '/premium-upgrade': 'coach.cta_routes.premium',
  '/settings': 'coach.cta_routes.settings',
  '/notifications': 'coach.cta_routes.notifications',
  '/notification-settings': 'coach.cta_routes.notifications',
};

const COACH_CTA_ROUTE_MAP = {
  '/coach-history': '/coach-history',
  '/coach/history': '/coach-history',
  '/recipes': '/recipes',
  '/exercises': '/exercises',
  '/scan-result': '/scan-result',
  '/premium-upgrade': '/premium-upgrade',
  '/settings': '/settings',
  '/notifications': '/notifications',
  '/notification-settings': '/notification-settings',
} as const satisfies Record<string, CoachCtaRoute>;

function normalizeCoachRoute(rawRoute: string) {
  const trimmedRoute = rawRoute.trim();
  if (trimmedRoute.length === 0) {
    return null;
  }

  const withoutTrailingSlash =
    trimmedRoute.length > 1 ? trimmedRoute.replace(/\/+$/, '') : trimmedRoute;

  return withoutTrailingSlash.length > 0 ? withoutTrailingSlash : null;
}

export function resolveCoachCtaRoute(
  rawRoute: string | null | undefined,
): CoachCtaRoute | null {
  if (typeof rawRoute !== 'string') {
    return null;
  }

  const normalizedRoute = normalizeCoachRoute(rawRoute);
  if (!normalizedRoute) {
    return null;
  }

  return COACH_CTA_ROUTE_MAP[normalizedRoute as keyof typeof COACH_CTA_ROUTE_MAP] ?? null;
}

export function getCoachCtaTranslationKey(route: CoachCtaRoute | null) {
  if (!route) {
    return null;
  }

  return COACH_CTA_ROUTE_TRANSLATION_KEYS[route];
}
