import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { createServiceRoleClient, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import { Phase2HttpError, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import { syncRevenueCatSubscriptionForUser } from '../_shared/revenueCat.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }
  const requestId = createRequestId();

  try {
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const supabaseClient = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabaseClient, req);
    const syncedProfile = await syncRevenueCatSubscriptionForUser(
      supabaseClient,
      user.id,
      user.id,
    );

    return jsonResponse(req, {
      success: true,
      source: 'revenuecat',
      user_id: user.id,
      entitlement: syncedProfile,
    });
  } catch (error) {
    logPhase2Error('[sync-subscription-status] Failed to sync subscription', error, {
      request_id: requestId,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: error instanceof Phase2HttpError ? error.status : 400 }
    );
  }
});
