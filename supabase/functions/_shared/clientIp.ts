// B-02 backend audit — historiquement, derrière Cloudflare on ne faisait
// confiance qu'à `cf-connecting-ip`. Depuis la migration self-hosted (derrière
// Caddy/Kong, sans Cloudflare), ce header n'existe plus : on retombe sur les
// headers de proxy `X-Forwarded-For` / `X-Real-IP` posés par Caddy.
//
// IMPORTANT : le fallback DOIT être une `inet` valide. L'ancien fallback
// littéral "unknown" cassait tous les RPC typés `inet` (ex. check_ip_signup_allowed
// → 22P02 "invalid input syntax for type inet" → signup en 503).
//
// Compromis sécurité : X-Forwarded-For est falsifiable côté client. Le rate
// limit par IP reste une défense en profondeur (les contrôles email jetable +
// vérification email restent prioritaires). Pour durcir : configurer Caddy/Kong
// pour écraser X-Forwarded-For avec l'IP réelle.

export function resolveTrustedClientIp(req: Request): string {
  const cloudflareIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwardedFor) {
    return forwardedFor;
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  // Fallback = inet valide (jamais "unknown") pour ne pas casser les RPC inet.
  return '0.0.0.0';
}
