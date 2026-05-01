import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';

const CLEANUP_REQUEST_MAX_BYTES = 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readCleanupBody(req: Request) {
  const contentType = req.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return { error: 'Unsupported content type', status: 415 } as const;
  }

  const rawBody = await req.text();
  if (rawBody.length > CLEANUP_REQUEST_MAX_BYTES) {
    return { error: 'Payload too large', status: 413 } as const;
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return { error: 'Invalid JSON body', status: 400 } as const;
  }

  if (!isRecord(parsedBody)) {
    return { error: 'Invalid JSON body', status: 400 } as const;
  }

  const keys = Object.keys(parsedBody);
  if (keys.length !== 1 || keys[0] !== 'userId') {
    return { error: 'Unexpected request fields', status: 400 } as const;
  }

  const userId = parsedBody.userId;
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    return { error: 'Invalid userId', status: 400 } as const;
  }

  return { userId } as const;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  const corsError = validateCorsOrigin(req);
  if (corsError) return corsError;

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const authHeader = req.headers.get('Authorization') ?? '';
    const authMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!authMatch) {
      return jsonResponse(req, { error: 'Missing authorization' }, { status: 401 });
    }

    const token = authMatch[1];
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    const body = await readCleanupBody(req);
    if ('error' in body) {
      return jsonResponse(req, { error: body.error }, { status: body.status });
    }

    const { userId } = body;

    if (authError || !authUser || authUser.id !== userId) {
      return jsonResponse(req, { error: 'Unauthorized' }, { status: 403 });
    }

    // Vérifier si déjà vérifié pour ne pas supprimer par erreur
    const { data: profile } = await supabase.from('user_profiles').select('email_verified').eq('id', userId).maybeSingle();

    if (profile?.email_verified) {
      return jsonResponse(req, { error: 'User already verified' }, { status: 403 });
    }

    // S-07 — Purge RGPD des scans avant la suppression du profil. Comptes
    // non-vérifiés ne devraient pas avoir de scans, mais on appelle quand
    // même la RPC pour le cas où le user a fait du scan via un crédit
    // welcome avant d'avoir vérifié son email.
    const { error: purgeError } = await supabase.rpc('purge_user_scan_data', {
      p_user_id: userId,
    });
    if (purgeError) {
      console.error('[cleanup-orphan-user] purge_user_scan_data failed', {
        error_name: purgeError.name ?? 'unknown',
        error_code: purgeError.code ?? 'unknown',
      });
    }

    // Suppression en cascade
    await supabase.from('verification_codes').delete().eq('user_id', userId);
    await supabase.from('user_profiles').delete().eq('id', userId);

    // Suppression Auth finale
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return jsonResponse(req, { success: true }, { status: 200 });

  } catch (error) {
    console.error('[cleanup-orphan-user] failed', {
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return jsonResponse(req, { error: 'Failed to cleanup' }, { status: 500 });
  }
});
