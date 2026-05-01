import { handleCorsPreflightRequest, jsonResponse } from '../_shared/cors.ts';
import { createServiceRoleClient } from '../_shared/phase2Auth.ts';
import { getRevenueCatServerConfig } from '../_shared/phase2Env.ts';
import { Phase2HttpError, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  extractRevenueCatAppUserIds,
  resolveRevenueCatUserIdFromWebhookPayload,
  syncRevenueCatSubscriptionForUser,
} from '../_shared/revenueCat.ts';
import { isRecord, readJsonBody, readOptionalString } from '../_shared/phase2Utils.ts';

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

async function buildDeterministicEventId(payload: unknown) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload ?? {})),
  );

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function readWebhookEvent(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Webhook payload must be an object');
  }

  return isRecord(payload.event) ? payload.event : payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }
  const requestId = createRequestId();
  let eventId: string | null = null;

  try {
    requirePostMethod(req);

    const client = createServiceRoleClient();

    const { webhookAuthorization } = getRevenueCatServerConfig();
    if (!webhookAuthorization) {
      throw new Phase2HttpError(
        500,
        'missing_revenuecat_webhook_authorization',
        'RevenueCat webhook authorization is not configured',
      );
    }

    const authorizationHeader = req.headers.get('Authorization');
    if (authorizationHeader !== webhookAuthorization) {
      throw new Phase2HttpError(
        401,
        'invalid_webhook_authorization',
        'Invalid RevenueCat webhook authorization',
      );
    }

    const payload = await readJsonBody(req, { maxBytes: 64 * 1024 });
    const event = readWebhookEvent(payload);
    const appUserIds = extractRevenueCatAppUserIds(payload);
    const primaryAppUserId = appUserIds[0] ?? null;
    eventId =
      readOptionalString(event.id) ??
      readOptionalString(event.event_id) ??
      await buildDeterministicEventId(event);
    const eventType =
      readOptionalString(event.type) ??
      readOptionalString(event.event_type) ??
      'unknown';

    const { data: existingEvent, error: existingEventError } = await client
      .from('revenuecat_webhook_events')
      .select('id, processing_state')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingEventError) {
      throw new Phase2HttpError(
        500,
        'webhook_event_lookup_failed',
        'Failed to load RevenueCat webhook event state',
      );
    }

    let eventRowId = existingEvent?.id ?? null;

    if (existingEvent?.processing_state === 'processed') {
      return jsonResponse(req, {
        success: true,
        duplicate: true,
        event_id: eventId,
      });
    }

    if (eventRowId) {
      const { error: updateExistingError } = await client
        .from('revenuecat_webhook_events')
        .update({
          app_user_id: primaryAppUserId,
          event_type: eventType,
          payload: event,
          processing_state: 'pending',
          last_error: null,
        })
        .eq('id', eventRowId);

      if (updateExistingError) {
        throw new Phase2HttpError(
          500,
          'webhook_event_prepare_failed',
          'Failed to prepare RevenueCat webhook event for processing',
        );
      }
    } else {
      const { data: createdEvent, error: createEventError } = await client
        .from('revenuecat_webhook_events')
        .insert({
          event_id: eventId,
          app_user_id: primaryAppUserId,
          event_type: eventType,
          payload: event,
          processing_state: 'pending',
        })
        .select('id')
        .single();

      if (createEventError || !createdEvent) {
        throw new Phase2HttpError(
          500,
          'webhook_event_create_failed',
          'Failed to persist RevenueCat webhook event',
        );
      }

      eventRowId = createdEvent.id;
    }

    try {
      const resolvedUserId = await resolveRevenueCatUserIdFromWebhookPayload(
        client,
        payload,
      );
      const syncedProfile = resolvedUserId
        ? await syncRevenueCatSubscriptionForUser(
            client,
            resolvedUserId,
            primaryAppUserId ?? resolvedUserId,
          )
        : null;

      await client
        .from('revenuecat_webhook_events')
        .update({
          processed_at: new Date().toISOString(),
          processing_state: 'processed',
          last_error: null,
          synced_user_id: syncedProfile?.user_id ?? null,
        })
        .eq('id', eventRowId);

      return jsonResponse(req, {
        success: true,
        duplicate: false,
        event_id: eventId,
        synced_user_id: syncedProfile?.user_id ?? null,
      });
    } catch (processingError) {
      await client
        .from('revenuecat_webhook_events')
        .update({
          processing_state: 'error',
          last_error:
            processingError instanceof Error
              ? processingError.message
              : 'Unknown RevenueCat webhook processing error',
        })
        .eq('id', eventRowId);

      throw processingError;
    }
  } catch (error) {
    logPhase2Error('[revenuecat-webhook] Failed to process webhook', error, {
      request_id: requestId,
      event_id: eventId ?? undefined,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, {
        requestId,
        eventId: eventId ?? undefined,
      }),
      { status: error instanceof Phase2HttpError ? error.status : 500 },
    );
  }
});
