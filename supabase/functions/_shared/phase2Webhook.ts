import { readOptionalServerEnv, getPhase2WebhookAuthConfig } from './phase2Env.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import { isRecord } from './phase2Utils.ts';
import { validateWebhookUrlWithDnsCheck } from './webhookHostAllowlist.ts';

// S-01 — Inlined pour eviter une dependence transitive vers phase2Auth.ts
// (qui importe `npm:@supabase/supabase-js` non-resolvable par Jest cote
// tests Node). La fonction est triviale et n'a aucune dependence.
function timingSafeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export interface Phase2WebhookResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown> | null;
  bodyPresent: boolean;
  rawText: string | null;
}

export interface Phase2WebhookRequestOptions {
  maxResponseBytes?: number;
  // S-01 — Verification HMAC de la reponse webhook. Defaut true en prod si
  // PHASE2_WEBHOOK_AUTH_MODE inclut 'hmac' ; les callers peuvent forcer false
  // pour les workflows en cours de migration (legacy n8n sans signature
  // sortante). A retirer apres cutover complet.
  verifyResponseSignature?: boolean;
}

export const PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE =
  'webhook_response_too_large';

export const PHASE2_WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const PHASE2_WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

// S-01 — Headers attendus sur la reponse webhook signee par n8n.
export const PHASE2_WEBHOOK_RESPONSE_TIMESTAMP_HEADER =
  'x-webhook-response-timestamp';
export const PHASE2_WEBHOOK_RESPONSE_SIGNATURE_HEADER =
  'x-webhook-response-signature';
const PHASE2_WEBHOOK_RESPONSE_TOLERANCE_MS = 5 * 60 * 1000;

const PHASE2_WEBHOOK_SIGNATURE_PREFIX = 'sha256=';
const textEncoder = new TextEncoder();

function arrayBufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function createPhase2WebhookSignature(
  timestamp: string,
  rawBody: string,
  secret: string,
) {
  const signingKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    textEncoder.encode(`${timestamp}.${rawBody}`),
  );

  return `${PHASE2_WEBHOOK_SIGNATURE_PREFIX}${arrayBufferToHex(signature)}`;
}

export async function buildPhase2WebhookHeaders(
  rawBody: string,
  options: {
    timestamp?: string;
  } = {},
) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json; charset=utf-8',
  });
  const authConfig = getPhase2WebhookAuthConfig();

  if (authConfig.useBearer) {
    headers.set('Authorization', `Bearer ${authConfig.bearerToken!}`);
  }

  if (authConfig.useHeader) {
    headers.set(authConfig.secretHeaderName!, authConfig.secretHeaderValue!);
  }

  if (authConfig.useHmac) {
    const timestamp = options.timestamp ?? new Date().toISOString();
    headers.set(PHASE2_WEBHOOK_TIMESTAMP_HEADER, timestamp);
    headers.set(
      PHASE2_WEBHOOK_SIGNATURE_HEADER,
      await createPhase2WebhookSignature(
        timestamp,
        rawBody,
        authConfig.hmacSecret!,
      ),
    );
  }

  return headers;
}

// S-01 — Vérifie la signature HMAC sur la reponse webhook. Le format est
// identique a la signature outbound : sha256=<hex>, sur "<timestamp>.<rawBody>".
// La tolerance temporelle est de 5 min (anti-replay sans nonce ; le secret
// HMAC change la signature de chaque payload et la fenetre limite la fenetre
// d'exploitation d'un replay si le secret est intact).
export async function verifyPhase2WebhookResponseSignature(
  response: Response,
  rawText: string,
  secret: string,
): Promise<void> {
  const sig = response.headers.get(PHASE2_WEBHOOK_RESPONSE_SIGNATURE_HEADER);
  const ts = response.headers.get(PHASE2_WEBHOOK_RESPONSE_TIMESTAMP_HEADER);

  if (!sig || !ts) {
    throw new Phase2HttpError(
      502,
      'webhook_response_unsigned',
      'Webhook response is missing signature headers',
      {
        signature_header_present: Boolean(sig),
        timestamp_header_present: Boolean(ts),
      },
    );
  }

  const tsMs = Date.parse(ts);
  if (!Number.isFinite(tsMs)) {
    throw new Phase2HttpError(
      502,
      'webhook_response_stale',
      'Webhook response timestamp is not a valid ISO date',
    );
  }
  if (Math.abs(Date.now() - tsMs) > PHASE2_WEBHOOK_RESPONSE_TOLERANCE_MS) {
    throw new Phase2HttpError(
      502,
      'webhook_response_stale',
      'Webhook response timestamp is outside the allowed window',
    );
  }

  const expected = await createPhase2WebhookSignature(ts, rawText, secret);
  if (!timingSafeEqual(sig, expected)) {
    throw new Phase2HttpError(
      502,
      'webhook_response_invalid_signature',
      'Webhook response signature mismatch',
    );
  }
}

function readGlobalWebhookVerifyResponseFlag(): boolean | null {
  const raw = readOptionalServerEnv('WEBHOOK_VERIFY_RESPONSE');
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return null;
}

function shouldVerifyResponseSignature(
  options: Phase2WebhookRequestOptions,
  authConfig: { useHmac: boolean },
): boolean {
  // Per-call override prend la priorite.
  if (options.verifyResponseSignature === false) return false;
  if (options.verifyResponseSignature === true) return true;
  // Kill-switch global pour rollback urgent (ex : n8n pas encore configure).
  const globalFlag = readGlobalWebhookVerifyResponseFlag();
  if (globalFlag !== null) return globalFlag;
  // Default : on verifie SSI on signe deja en sortie (mode hmac active).
  return authConfig.useHmac;
}

export async function postWebhookJson(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000,
  options: Phase2WebhookRequestOptions = {},
): Promise<Phase2WebhookResult> {
  // S-02 — Defense-in-depth contre le DNS rebinding : on resout le hostname
  // juste avant le fetch et on rejette toute IP privee / loopback / link-local.
  // L'allowlist hostname seule ne suffit pas, un domaine allowlist peut etre
  // pointe vers 127.0.0.1 ou 169.254.169.254 (metadata AWS).
  const dnsValidation = await validateWebhookUrlWithDnsCheck(url);
  if (!dnsValidation.ok) {
    const reason = dnsValidation.reason;
    const errorCode =
      reason === 'host_resolves_private' ? 'webhook_host_resolves_private'
      : reason === 'host_dns_resolution_failed' ? 'webhook_dns_resolution_failed'
      : `webhook_url_${reason}`;
    throw new Phase2HttpError(
      502,
      errorCode,
      `Webhook URL rejected by host validation (${reason})`,
      dnsValidation.details,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const rawBody = JSON.stringify(payload);
  const maxResponseBytes = options.maxResponseBytes;

  try {
    // On charge la config auth UNE FOIS pour decider si on doit verifier la
    // signature de la reponse plus bas (evite un 2e appel a getPhase2WebhookAuthConfig).
    const authConfig = getPhase2WebhookAuthConfig();
    const response = await fetch(url, {
      method: 'POST',
      headers: await buildPhase2WebhookHeaders(rawBody),
      body: rawBody,
      signal: controller.signal,
    });

    if (typeof maxResponseBytes === 'number' && maxResponseBytes > 0) {
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredContentLength = Number(contentLengthHeader);
        if (
          Number.isFinite(declaredContentLength) &&
          declaredContentLength > maxResponseBytes
        ) {
          throw new Phase2HttpError(
            502,
            PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE,
            `Webhook response must be ${maxResponseBytes} bytes or fewer`,
          );
        }
      }
    }

    const text = await response.text();
    if (
      typeof maxResponseBytes === 'number' &&
      maxResponseBytes > 0 &&
      new TextEncoder().encode(text).length > maxResponseBytes
    ) {
      throw new Phase2HttpError(
        502,
        PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE,
        `Webhook response must be ${maxResponseBytes} bytes or fewer`,
      );
    }

    // S-01 — Verification HMAC de la reponse, avant tout parsing/utilisation
    // des champs comme workflow_status. On utilise N8N_RESPONSE_HMAC_SECRET
    // si configure (secret dedie a l'inbound), sinon fallback sur le secret
    // outbound PHASE2_WEBHOOK_HMAC_SECRET (meme cle dans les deux sens).
    if (shouldVerifyResponseSignature(options, authConfig)) {
      const responseSecret =
        readOptionalServerEnv('N8N_RESPONSE_HMAC_SECRET') ??
        authConfig.hmacSecret;
      if (!responseSecret) {
        throw new Phase2HttpError(
          500,
          'webhook_response_secret_missing',
          'Cannot verify webhook response signature: HMAC secret not configured',
        );
      }
      await verifyPhase2WebhookResponseSignature(response, text, responseSecret);
    }

    const trimmedText = text.trim();
    let parsedPayload: Record<string, unknown> | null = null;

    if (trimmedText.length > 0) {
      try {
        const parsed = JSON.parse(text);
        parsedPayload = isRecord(parsed) ? parsed : null;
      } catch {
        parsedPayload = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      payload: parsedPayload,
      bodyPresent: trimmedText.length > 0,
      rawText: trimmedText.length > 0 ? text : null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
