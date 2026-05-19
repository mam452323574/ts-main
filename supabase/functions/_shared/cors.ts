/**
 * Shared CORS helpers for Supabase Edge Functions.
 *
 * Configure allowed origins through the ALLOWED_ORIGINS environment variable.
 * Example:
 *   https://your-domain.com,http://localhost:8081,http://localhost:19006
 */

const allowedOriginsEnv = Deno.env.get('ALLOWED_ORIGINS') || '';
// S-11 — Normalise en lowercase au load des env vars. RFC 6454 stipule que
// le hostname Origin est case-insensitive. Sans normalisation, un déploiement
// avec ALLOWED_ORIGINS=https://MyApp.com bloquerait les requêtes browser qui
// envoient https://myapp.com (et vice-versa).
const allowedOrigins = allowedOriginsEnv
  .split(',')
  .map((origin) => origin.trim().toLowerCase())
  .filter((origin) => origin.length > 0);

function isProductionEnvironment() {
  const environment = Deno.env.get('SUPABASE_ENV') || Deno.env.get('APP_ENV') || '';
  return environment.trim().toLowerCase() === 'production';
}

function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.length === 0) {
    console.warn('[CORS] No origins configured in ALLOWED_ORIGINS. Denying by default.');
    return false;
  }

  if (allowedOrigins.includes('*')) {
    if (isProductionEnvironment()) {
      console.error('[CORS] Refusing wildcard ALLOWED_ORIGINS in production.');
      return false;
    }

    return true;
  }

  // S-11 — comparison case-insensitive (l'allowlist est deja lowercase).
  return allowedOrigins.includes(origin.toLowerCase());
}

// AUTH-VULN-04 fix: explicit cache-prevention on every Edge Function response.
// Without these headers, intermediate corporate proxies / ISP caches / browser
// caches can store JWT-bearing responses (Cloudflare's `cf-cache-status: DYNAMIC`
// is non-binding for non-Cloudflare caches). Strict-Transport-Security upgraded
// to include `preload` to match the headers GoTrue itself returns.
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function applySecurityHeaders(headers: Headers | Record<string, string>) {
  if (headers instanceof Headers) {
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      headers.set(key, value);
    });
    return;
  }

  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers[key] = value;
  });
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';

  // Audit S-08 : pas d'header Origin = appel non-browser (mobile natif, server-to-server,
  // curl). On renvoie 'null' sans 'Allow-Credentials' : les cookies cross-origin ne peuvent
  // pas etre attaches a une reponse 'null', et l'auth de l'app est portee par le bearer
  // token JWT (header Authorization) - aucune CSRF cookie-based exploitable ici.
  // S-10 — au lieu de '*' (wildcard), on retourne 'null' qui est strictement plus
  // restrictif : un browser legitime sans header Origin (rare, ex: <img>) recoit
  // toujours la reponse via fetch no-cors mais ne peut pas la lire ; le mobile
  // natif ignore CORS de toute facon. Pas de regression UX, posture renforcee.
  const baseHeaders: Record<string, string> = !origin
    ? {
        'Access-Control-Allow-Origin': 'null',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
      }
    : (() => {
        const allowed = isOriginAllowed(origin);

        if (!allowed) {
          console.warn(`[CORS] Origin not allowed: ${origin}`);
        }

        return {
          'Access-Control-Allow-Origin': allowed ? origin : '',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
          'Access-Control-Allow-Credentials': 'true',
        };
      })();

  applySecurityHeaders(baseHeaders);
  return baseHeaders;
}

export function handleCorsPreflightRequest(req: Request): Response {
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(req),
  });
}

export function jsonResponse(
  req: Request,
  payload: unknown,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);

  Object.entries(getCorsHeaders(req)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  headers.set('Content-Type', 'application/json; charset=utf-8');
  applySecurityHeaders(headers);

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export function validateCorsOrigin(req: Request): Response | null {
  const origin = req.headers.get('Origin');

  if (!origin) {
    return null;
  }

  if (!isOriginAllowed(origin)) {
    return jsonResponse(req, { error: 'Origin not allowed' }, { status: 403 });
  }

  return null;
}
