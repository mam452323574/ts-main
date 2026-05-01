// B-02 backend audit — En production, ne faire confiance qu'à `cf-connecting-ip`
// (Supabase Edge tourne derrière Cloudflare). Sinon un attaquant peut forger
// `X-Forwarded-For` ou `X-Real-IP` pour contourner les rate limits par IP.

function isProductionEnvironment() {
  const environment =
    Deno.env.get('SUPABASE_ENV') || Deno.env.get('APP_ENV') || '';
  return environment.trim().toLowerCase() === 'production';
}

export function resolveTrustedClientIp(req: Request): string {
  const cloudflareIp = req.headers.get('cf-connecting-ip');
  if (cloudflareIp) {
    return cloudflareIp;
  }

  if (isProductionEnvironment()) {
    return 'unknown';
  }

  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
