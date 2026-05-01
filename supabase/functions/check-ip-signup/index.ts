import { resolveTrustedClientIp } from '../_shared/clientIp.ts';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireAuthenticatedUserAllowingAal1,
} from '../_shared/phase2Auth.ts';
import { Phase2HttpError } from '../_shared/phase2Errors.ts';

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

    const client = createServiceRoleClient();
    const clientIp = resolveTrustedClientIp(req);
    const { action = 'check' } = await req.json().catch(() => ({}));

    if (action === 'record') {
      const user = await requireAuthenticatedUserAllowingAal1(client, req);
      const { error } = await client.rpc('record_ip_signup', {
        client_ip: clientIp,
        p_user_id: user.id,
      });

      if (error) {
        throw error;
      }

      return jsonResponse(req, { success: true }, { status: 200 });
    }

    if (action !== 'check') {
      throw new Phase2HttpError(400, 'invalid_action', 'Invalid signup IP action');
    }

    const { data, error } = await client.rpc('check_ip_signup_allowed', {
      client_ip: clientIp,
    });

    if (error) {
      throw error;
    }

    const result = data && data[0] ? data[0] : { allowed: true };
    if (!result.allowed) {
      return jsonResponse(
        req,
        {
          allowed: false,
          reason: result.reason,
          error: 'Signup limit reached',
        },
        { status: 429 },
      );
    }

    return jsonResponse(req, { allowed: true }, { status: 200 });
  } catch (error) {
    const status = error instanceof Phase2HttpError ? error.status : 500;
    const code = error instanceof Phase2HttpError ? error.code : 'ip_signup_check_failed';
    const message =
      error instanceof Error ? error.message : 'Failed to check signup IP eligibility';

    console.error('[check-ip-signup] failed', { code, message });
    return jsonResponse(req, { error: message, code }, { status });
  }
});
