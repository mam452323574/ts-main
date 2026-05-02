import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { createServiceRoleClient } from '../_shared/phase2Auth.ts';
import { Phase2HttpError } from '../_shared/phase2Errors.ts';

// P3 Phase 3 (U2-γ) — vérification SERVEUR-SIDE qu'un email est éligible au
// signup. Le client appelait directement la table `disposable_email_domains`
// avant `supabase.auth.signUp`, ce qui pouvait être bypassé par un attaquant
// qui invoquait l'API d'auth en direct (sans passer par notre client).
//
// Cette Edge Function est `verify_jwt = false` (appelée avant la création du
// compte) et retourne :
//   - { allowed: true } si l'email peut signup
//   - { allowed: false, reason: 'disposable_email' } si le domaine est jetable
//   - { allowed: false, reason: 'invalid_email' } si l'email est mal formé
//
// Le client doit ensuite refuser de poursuivre `signUp` si `allowed === false`.

const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

function extractEmailDomain(email: string): string | null {
  const match = EMAIL_PATTERN.exec(email.trim().toLowerCase());
  return match ? match[1] : null;
}

// AUTH-VULN-02 fix (Wave 3.6): subdomain matching. The previous
// `.eq('domain', exact_match)` lookup let attackers bypass the disposable
// email filter via subdomains: `evil.tempmail.com` would PASS even if
// `tempmail.com` was on the blocklist.
//
// Now we generate every parent suffix of the user's email domain and look
// up ANY match. Example: for `attacker@evil.foo.tempmail.com` we check
// `evil.foo.tempmail.com`, `foo.tempmail.com`, `tempmail.com`, and `com`
// (we exclude bare TLDs from the lookup itself, but they're cheap to test).
function getDomainSuffixes(domain: string): string[] {
  const parts = domain.toLowerCase().split('.');
  const suffixes: string[] = [];
  // Skip i = parts.length - 1 (bare TLD like "com") — never on blocklist.
  for (let i = 0; i < parts.length - 1; i++) {
    suffixes.push(parts.slice(i).join('.'));
  }
  return suffixes;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }

  try {
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email : '';

    if (email.length === 0 || email.length > 254) {
      return jsonResponse(
        req,
        { allowed: false, reason: 'invalid_email' },
        { status: 200 },
      );
    }

    const domain = extractEmailDomain(email);
    if (!domain) {
      return jsonResponse(
        req,
        { allowed: false, reason: 'invalid_email' },
        { status: 200 },
      );
    }

    const suffixes = getDomainSuffixes(domain);
    const client = createServiceRoleClient();
    const { data, error } = await client
      .from('disposable_email_domains')
      .select('domain')
      .in('domain', suffixes)
      .eq('active', true)
      .limit(1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      return jsonResponse(
        req,
        { allowed: false, reason: 'disposable_email' },
        { status: 200 },
      );
    }

    return jsonResponse(req, { allowed: true }, { status: 200 });
  } catch (error) {
    const status = error instanceof Phase2HttpError ? error.status : 500;
    const code =
      error instanceof Phase2HttpError ? error.code : 'signup_eligibility_failed';
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to check signup eligibility';

    console.error('[check-signup-eligibility] failed', { code });
    return jsonResponse(req, { error: message, code }, { status });
  }
});
