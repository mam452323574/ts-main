import { resolveTrustedClientIp } from '../_shared/clientIp.ts';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { assertSafeNumericCode, escapeHtml } from '../_shared/htmlEscape.ts';
import {
  createServiceRoleClient,
  requireAuthenticatedUserAllowingAal1,
} from '../_shared/phase2Auth.ts';
import { Phase2HttpError } from '../_shared/phase2Errors.ts';
import { readOptionalServerEnv, requireServerEnv } from '../_shared/phase2Env.ts';

type Locale = 'fr' | 'en' | 'de' | 'it' | 'es' | 'pt';

const FALLBACK_LOCALE: Locale = 'en';
const CODE_TTL_MS = 15 * 60 * 1000;
const HOURLY_RATE_LIMIT = 5;
const ALLOWED_LOCALES: Locale[] = ['fr', 'en', 'de', 'it', 'es', 'pt'];

const TRANSLATIONS: Record<Locale, { subject: string; title: string; subtitle: string; expireText: string }> = {
  fr: {
    subject: 'Bienvenue sur Health Scan',
    title: 'Bienvenue sur Health Scan',
    subtitle: 'Verifiez votre adresse email pour finaliser votre inscription.',
    expireText: 'Expire dans 15 minutes.',
  },
  en: {
    subject: 'Welcome to Health Scan',
    title: 'Welcome to Health Scan',
    subtitle: 'Verify your email address to complete your registration.',
    expireText: 'Expires in 15 minutes.',
  },
  de: {
    subject: 'Willkommen bei Health Scan',
    title: 'Willkommen bei Health Scan',
    subtitle: 'Bestaetigen Sie Ihre E-Mail-Adresse, um die Registrierung abzuschliessen.',
    expireText: 'Laeuft in 15 Minuten ab.',
  },
  it: {
    subject: 'Benvenuto in Health Scan',
    title: 'Benvenuto in Health Scan',
    subtitle: 'Verifica il tuo indirizzo email per completare la registrazione.',
    expireText: 'Scade tra 15 minuti.',
  },
  es: {
    subject: 'Bienvenido a Health Scan',
    title: 'Bienvenido a Health Scan',
    subtitle: 'Verifique su direccion de correo electronico para completar su registro.',
    expireText: 'Expira en 15 minutos.',
  },
  pt: {
    subject: 'Bem-vindo ao Health Scan',
    title: 'Bem-vindo ao Health Scan',
    subtitle: 'Verifique seu endereco de e-mail para concluir o cadastro.',
    expireText: 'Expira em 15 minutos.',
  },
};


function normalizeLocale(value: unknown): Locale {
  return typeof value === 'string' && ALLOWED_LOCALES.includes(value as Locale)
    ? (value as Locale)
    : FALLBACK_LOCALE;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashVerificationCode(options: {
  userId: string;
  email: string;
  type: string;
  code: string;
  pepper: string;
}) {
  return sha256Hex(
    `${options.userId}:${options.email.toLowerCase()}:${options.type}:${options.code}:${options.pepper}`,
  );
}

function generateEmailTemplate(code: string, locale: Locale) {
  const safeCode = assertSafeNumericCode(code, { length: 6 });
  const t = TRANSLATIONS[locale] || TRANSLATIONS[FALLBACK_LOCALE];
  const safeTitle = escapeHtml(t.title);
  const safeSubtitle = escapeHtml(t.subtitle);
  const safeExpireText = escapeHtml(t.expireText);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title></head>
  <body style="font-family: sans-serif; background-color: #f5f5f5; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px;">
      <h1 style="color: #1a1a1a;">${safeTitle}</h1>
      <p style="color: #666;">${safeSubtitle}</p>
      <div style="background: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
        <span style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #E53935;">${safeCode}</span>
      </div>
      <p style="font-size: 12px; color: #999;">${safeExpireText}</p>
    </div>
  </body></html>`;

  return { html, subject: t.subject };
}

async function assertRateLimit(client: ReturnType<typeof createServiceRoleClient>, options: {
  userId: string;
  email: string;
  clientIp: string;
}) {
  const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const baseQuery = client
    .from('verification_codes')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'signup')
    .gte('created_at', cutoffIso);

  const checks = [
    baseQuery.eq('user_id', options.userId),
    client
      .from('verification_codes')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'signup')
      .eq('email', options.email)
      .gte('created_at', cutoffIso),
    client
      .from('verification_codes')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'signup')
      .eq('request_ip', options.clientIp)
      .gte('created_at', cutoffIso),
  ];

  const results = await Promise.all(checks);
  if (results.some(({ count }) => (count ?? 0) >= HOURLY_RATE_LIMIT)) {
    throw new Phase2HttpError(
      429,
      'verification_rate_limited',
      'Too many verification email requests',
    );
  }
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

    const resendApiKey = requireServerEnv('RESEND_API_KEY', {
      code: 'missing_resend_api_key',
      message: 'RESEND_API_KEY is not configured',
    });
    const pepper = requireServerEnv('EMAIL_VERIFICATION_CODE_PEPPER', {
      code: 'missing_email_verification_code_pepper',
      message: 'EMAIL_VERIFICATION_CODE_PEPPER is not configured',
    });

    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUserAllowingAal1(client, req);
    const body = await req.json().catch(() => ({}));
    const locale = normalizeLocale((body as Record<string, unknown>).locale);
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      throw new Phase2HttpError(400, 'missing_user_email', 'Authenticated user has no email');
    }

    const clientIp = resolveTrustedClientIp(req);
    await assertRateLimit(client, { userId: user.id, email, clientIp });

    await client
      .from('verification_codes')
      .update({ expires_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('type', 'signup')
      .is('verified_at', null);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await hashVerificationCode({
      userId: user.id,
      email,
      type: 'signup',
      code,
      pepper,
    });
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error: insertError } = await client.from('verification_codes').insert({
      user_id: user.id,
      email,
      code_hash: codeHash,
      type: 'signup',
      request_ip: clientIp,
      expires_at: expiresAt,
    });

    if (insertError) {
      throw insertError;
    }

    const { html, subject } = generateEmailTemplate(code, locale);
    const from =
      readOptionalServerEnv('VERIFICATION_EMAIL_FROM') ??
      'Health Scan <noreply@healthscan.cloud>';

    console.log('[send-verification-email] calling Resend', {
      from,
      to_domain: email.split('@')[1] ?? 'unknown',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let resendResponse: Response;
    try {
      resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: email, subject, html }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        console.error('[send-verification-email] Resend timeout after 10s');
        throw new Phase2HttpError(504, 'resend_timeout', 'Resend API timed out');
      }
      console.error('[send-verification-email] Resend fetch failed', {
        name: fetchError instanceof Error ? fetchError.name : 'unknown',
        message: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
      throw new Phase2HttpError(
        502,
        'resend_network_error',
        fetchError instanceof Error ? fetchError.message : 'Resend network error',
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text().catch(() => '<unreadable>');
      console.error('[send-verification-email] Resend API error', {
        status: resendResponse.status,
        body: errorBody.slice(0, 500),
      });
      throw new Phase2HttpError(
        502,
        'resend_api_error',
        `Resend returned ${resendResponse.status}: ${errorBody.slice(0, 200)}`,
      );
    }

    const resendResult = (await resendResponse.json().catch(() => ({}))) as {
      id?: unknown;
    };
    console.log('[send-verification-email] Resend OK', {
      email_id: typeof resendResult.id === 'string' ? resendResult.id : null,
    });

    return jsonResponse(req, { success: true }, { status: 200 });
  } catch (error) {
    const status = error instanceof Phase2HttpError ? error.status : 500;
    const code =
      error instanceof Phase2HttpError ? error.code : 'verification_email_failed';
    const message =
      error instanceof Error ? error.message : 'Failed to send verification email';

    console.error('[send-verification-email] failed', { code, message });
    return jsonResponse(req, { error: message, code }, { status });
  }
});
