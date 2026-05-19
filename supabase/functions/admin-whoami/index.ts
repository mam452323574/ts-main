// S-07 — Endpoint dedie pour confirmer cote serveur le tier admin.
// Le frontend (AdminSocialModerationScreen, etc.) appelle cet endpoint avant
// de rendre les UI destructives. Si l'utilisateur a perdu son tier admin
// entre le moment ou il a charge l'app et le moment ou il ouvre l'ecran, la
// reponse 403 permet de bloquer l'affichage avant qu'il puisse declencher
// des mutations (qui seraient quand meme rejetees serveur, mais cela ferme
// la fenetre d'observation des endpoints / payloads attendus).
import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireAdminUserProfile,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import {
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';

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
    if (req.method !== 'GET' && req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const supabase = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabase, req);
    const profile = await requireAdminUserProfile(supabase, user.id);

    return jsonResponse(req, {
      success: true,
      is_admin: true,
      user_id: profile.id,
      account_tier: profile.account_tier,
    });
  } catch (error) {
    logPhase2Error('[admin-whoami] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
