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
  summarizeWebhookResult,
} from '../_shared/phase2Observability.ts';
import { postWebhookJson } from '../_shared/phase2Webhook.ts';
import { selectScanWebhookEndpoint } from '../_shared/scanWebhookPool.ts';
import {
  isPendingScanRollback,
  rollbackScanCharge,
  type PendingScanRollback,
  type SupportedScanType,
} from '../_shared/scanReservations.ts';
import { assertNoUnknownKeys, assertUuidLike, buildCanonicalScanImagePath, readJsonBody } from '../_shared/phase2Utils.ts';
import {
  arrayBufferToBase64,
  isStoredScanAnalysisComplete,
  resolveScanAnalysisLanguageContract,
  resolveNormalizedScanAnalysisPayload,
} from '../_shared/scanAnalysis.ts';
import {
  createScanImageNotFoundError,
  resolveStoredScanObject,
  retryStoredScanObjectDownloadByPath,
  selectLegacyStoredScanObject,
  toEpochMs,
  type ResolvedStoredScanObject,
  type ScanImagePathSource,
  type ScanRecordForImageLookup,
  type StoredScanDownloadResult,
  type StoredScanLookupResult,
  type StoredScanObjectRow,
} from '../_shared/scanImageLookup.ts';
import {
  ANALYZE_SCAN_REQUEST_KEYS,
  SCAN_IMAGE_BUCKET,
  SCAN_IMAGE_MAX_BYTES,
  hasJpegMagicBytes,
  isAppScanType,
} from '../../../shared/scanContract.ts';

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function readScanType(value: unknown): SupportedScanType {
  if (isAppScanType(value)) {
    return value as SupportedScanType;
  }

  throw new Phase2HttpError(400, 'invalid_scan_type', 'scan_type is invalid');
}

async function lookupStoredScanObjectByPath(
  client: ReturnType<typeof createServiceRoleClient>,
  options: {
    objectPath: string;
    pathSource: ScanImagePathSource;
    requestId: string;
    scanId: string;
    userId: string;
  },
): Promise<StoredScanLookupResult> {
  const { data, error } = await client
    .schema('storage')
    .from('objects')
    .select('name, metadata, created_at, owner')
    .eq('bucket_id', SCAN_IMAGE_BUCKET)
    .eq('name', options.objectPath)
    .maybeSingle();

  if (!error && data) {
    return {
      row: data as StoredScanObjectRow,
      lookupStatus: 'found',
    };
  }

  return {
    row: null,
    lookupStatus: error ? 'lookup_error' : 'missing_row',
  };
}

async function downloadStoredScanImageByPath(
  client: ReturnType<typeof createServiceRoleClient>,
  options: {
    objectPath: string;
    pathSource: ScanImagePathSource;
    requestId: string;
    scanId: string;
    userId: string;
  },
) : Promise<StoredScanDownloadResult> {
  const { data, error } = await client.storage
    .from(SCAN_IMAGE_BUCKET)
    .download(options.objectPath);

  if (!error && data) {
    return {
      blob: data,
      downloadStatus: 'found',
    };
  }

  return {
    blob: null,
    downloadStatus: error ? 'download_error' : 'missing_blob',
  };
}

async function downloadStoredScanImage(
  client: ReturnType<typeof createServiceRoleClient>,
  options: {
    objectPath: string;
    pathSource: ScanImagePathSource;
    requestId: string;
    scanId: string;
    userId: string;
  },
): Promise<Blob> {
  const downloadResult = await retryStoredScanObjectDownloadByPath({
    candidate: {
      objectPath: options.objectPath,
      pathSource: options.pathSource,
      requestId: options.requestId,
      scanId: options.scanId,
      userId: options.userId,
    },
    downloadObjectByPath: (candidate) =>
      downloadStoredScanImageByPath(client, candidate),
    logWarning: (message, context) => console.warn(message, context),
  });

  if (downloadResult.blob) {
    return downloadResult.blob;
  }

  throw createScanImageNotFoundError(
    'Uploaded scan image could not be downloaded',
    {
      image_path: options.objectPath,
      path_source: options.pathSource,
      ...(downloadResult.downloadStatus === 'download_error'
        ? { storage_download_failed: true }
        : {}),
    },
  );
}

async function inferLegacyStoredScanObject(
  client: ReturnType<typeof createServiceRoleClient>,
  options: {
    scanRow: ScanRecordForImageLookup;
    requestId: string;
  },
): Promise<ResolvedStoredScanObject | null> {
  const scanCreatedAtMs = toEpochMs(options.scanRow.created_at);
  if (scanCreatedAtMs === null) {
    console.warn('[analyze-scan] Legacy scan image lookup skipped: invalid scan timestamp', {
      request_id: options.requestId,
      scan_id: options.scanRow.id,
      user_id: options.scanRow.user_id,
    });
    return null;
  }

  const analyzedAtMs = toEpochMs(options.scanRow.analyzed_at);
  const lookupWindowStartIso = new Date(scanCreatedAtMs - 5_000).toISOString();
  const lookupWindowEndIso = new Date(
    analyzedAtMs ?? scanCreatedAtMs + 2 * 60 * 1_000,
  ).toISOString();

  const { data: storageRows, error: storageLookupError } = await client
    .schema('storage')
    .from('objects')
    .select('name, metadata, created_at, owner')
    .eq('bucket_id', SCAN_IMAGE_BUCKET)
    .eq('owner', options.scanRow.user_id)
    .gte('created_at', lookupWindowStartIso)
    .lte('created_at', lookupWindowEndIso)
    .order('created_at', { ascending: true });

  if (storageLookupError) {
    console.warn('[analyze-scan] Legacy scan image lookup failed', {
      request_id: options.requestId,
      scan_id: options.scanRow.id,
      user_id: options.scanRow.user_id,
      path_source: 'legacy_inferred',
    });
    return null;
  }

  const { data: peerScans, error: peerScansError } = await client
    .from('scans')
    .select('id, created_at')
    .eq('user_id', options.scanRow.user_id)
    .gte('created_at', lookupWindowStartIso)
    .lte('created_at', lookupWindowEndIso);

  if (peerScansError) {
    console.warn('[analyze-scan] Legacy scan image peer lookup failed', {
      request_id: options.requestId,
      scan_id: options.scanRow.id,
      user_id: options.scanRow.user_id,
      path_source: 'legacy_inferred',
    });
    return null;
  }

  const legacyResolution = selectLegacyStoredScanObject({
    scanRow: options.scanRow,
    storageRows: (Array.isArray(storageRows) ? storageRows : []).map(
      (row) => row as StoredScanObjectRow,
    ),
    peerScans: (Array.isArray(peerScans) ? peerScans : []).map((row) => ({
      id: typeof row.id === 'string' ? row.id : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : null,
    })),
  });

  if (!legacyResolution) {
    console.warn('[analyze-scan] No legacy scan image candidate found', {
      request_id: options.requestId,
      scan_id: options.scanRow.id,
      user_id: options.scanRow.user_id,
      path_source: 'legacy_inferred',
      lookup_window_start: lookupWindowStartIso,
      lookup_window_end: lookupWindowEndIso,
    });
  }

  return legacyResolution;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }
  const requestId = createRequestId();
  let pendingRollback: PendingScanRollback | null = null;
  let client: ReturnType<typeof createServiceRoleClient> | null = null;
  let resolvedImagePath: string | null = null;
  let resolvedPathSource: ScanImagePathSource | null = null;
  let languageReceivedForLog: string | null = null;
  let languageNormalizedForLog: string | null = null;
  let outputLanguageForLog: string | null = null;
  let webhookEnvNameForLog: string | null = null;
  let webhookIndexForLog: number | null = null;

  try {
    requirePostMethod(req);
    client = createServiceRoleClient();

    const user = await requireAuthenticatedUser(client, req);
    const requestBody = await readJsonBody(req, { maxBytes: 8 * 1024 });
    if (
      !requestBody ||
      typeof requestBody !== 'object' ||
      Array.isArray(requestBody)
    ) {
      throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
    }

    assertNoUnknownKeys(
      requestBody as Record<string, unknown>,
      ANALYZE_SCAN_REQUEST_KEYS,
      'Analyze scan request',
    );

    const scanId = typeof requestBody.scan_id === 'string' ? requestBody.scan_id : null;
    assertUuidLike(scanId, 'scan_id');
    const requestedScanType = readScanType(requestBody.scan_type);
    languageReceivedForLog =
      typeof requestBody.language === 'string' ? requestBody.language : null;
    const languageContract = resolveScanAnalysisLanguageContract(requestBody.language);
    const { language, locale, outputLanguage } = languageContract;
    languageNormalizedForLog = language;
    outputLanguageForLog = outputLanguage;

    const { data: scanRow, error: scanError } = await client
      .from('scans')
      .select(
        'id, user_id, scan_type, created_at, used_welcome_credit, image_path, analysis_result, analyzed_at',
      )
      .eq('id', scanId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (scanError || !scanRow) {
      throw new Phase2HttpError(404, 'scan_not_found', 'Scan not found');
    }

    if (scanRow.scan_type !== requestedScanType) {
      throw new Phase2HttpError(
        403,
        'scan_type_mismatch',
        'scan_type must match the existing scan record',
      );
    }

    // S-09 — defense-in-depth tier check pour `super`. La RPC reserve_scan_quota
    // bloque déjà les comptes free, mais un re-check ici protège contre toute
    // régression future de la RPC ou contre un scan créé hors flux normal.
    if (requestedScanType === 'super') {
      const { data: tierProfile, error: tierError } = await client
        .from('user_profiles')
        .select('account_tier')
        .eq('id', user.id)
        .maybeSingle();

      if (tierError || !tierProfile) {
        throw new Phase2HttpError(
          500,
          'scan_tier_lookup_failed',
          'Failed to verify account tier for super scan',
        );
      }

      const accountTier =
        tierProfile.account_tier === 'premium' || tierProfile.account_tier === 'admin'
          ? tierProfile.account_tier
          : 'free';

      if (accountTier === 'free') {
        throw new Phase2HttpError(
          403,
          'super_scan_premium_required',
          'Super scan requires premium',
        );
      }
    }

    const canonicalPath = buildCanonicalScanImagePath(user.id, scanRow.id);
    if (isStoredScanAnalysisComplete(scanRow)) {
      return jsonResponse(req, {
        success: true,
        scan: {
          ...scanRow,
          image_path: scanRow.image_path ?? canonicalPath,
        },
      });
    }

    // S-06 — claim atomique du scan : reserved → analyzing.
    // Si la transition échoue (déjà analyzing par un retry concurrent, ou
    // déjà analyzed/failed/cancelled), on renvoie un code HTTP approprié
    // pour que le client polling sache distinguer retry-attendre vs erreur.
    const { data: claimResult, error: claimError } = await client.rpc(
      'claim_scan_for_analysis',
      { p_scan_id: scanRow.id, p_user_id: user.id },
    );

    if (claimError || !claimResult) {
      throw new Phase2HttpError(
        500,
        'scan_claim_failed',
        'Failed to claim scan for analysis',
      );
    }

    const claimStatus =
      typeof (claimResult as Record<string, unknown>).status === 'string'
        ? ((claimResult as Record<string, unknown>).status as string)
        : 'unknown';
    const claimOk = (claimResult as Record<string, unknown>).ok === true;

    if (!claimOk) {
      if (claimStatus === 'analyzing') {
        throw new Phase2HttpError(
          409,
          'scan_analysis_in_progress',
          'Scan analysis is already in progress',
        );
      }
      if (claimStatus === 'cancelled') {
        throw new Phase2HttpError(
          409,
          'scan_cancelled',
          'Scan reservation was cancelled',
        );
      }
      if (claimStatus === 'not_found') {
        throw new Phase2HttpError(404, 'scan_not_found', 'Scan not found');
      }
      // analyzed → idempotent : on renvoie le scan finalisé tel quel.
      if (claimStatus === 'analyzed') {
        const { data: completedScan } = await client
          .from('scans')
          .select('*')
          .eq('id', scanRow.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (completedScan) {
          return jsonResponse(req, { success: true, scan: completedScan });
        }
      }
      throw new Phase2HttpError(
        409,
        'scan_invalid_state',
        'Scan is not in a state that allows analysis',
        { current_status: claimStatus },
      );
    }

    pendingRollback = {
      scanId: scanRow.id,
      userId: user.id,
      scanType: requestedScanType,
      createdAt: scanRow.created_at,
      usedWelcomeCredit: scanRow.used_welcome_credit === true,
      canonicalPath,
    };

    const resolvedStoredObject = await resolveStoredScanObject({
      scanRow,
      canonicalPath,
      requestId,
      lookupObjectByPath: (candidate) =>
        lookupStoredScanObjectByPath(client, candidate),
      downloadObjectByPath: (candidate) =>
        downloadStoredScanImageByPath(client, candidate),
      inferLegacyStoredScanObject: () =>
        inferLegacyStoredScanObject(client, {
          scanRow,
          requestId,
        }),
      logWarning: (message, context) => console.warn(message, context),
    });
    resolvedImagePath = resolvedStoredObject.path;
    resolvedPathSource = resolvedStoredObject.pathSource;

    const metadata =
      resolvedStoredObject.row.metadata as Record<string, unknown> | null;
    const mimeType =
      typeof metadata?.mimetype === 'string'
        ? metadata.mimetype.toLowerCase()
        : typeof metadata?.contentType === 'string'
          ? metadata.contentType.toLowerCase()
          : null;

    if (mimeType && mimeType !== 'image/jpeg' && mimeType !== 'image/jpg') {
      throw new Phase2HttpError(
        400,
        'invalid_scan_image_type',
        'Scan uploads must be JPEG images',
      );
    }

    const scanImage =
      resolvedStoredObject.blob ??
      (await downloadStoredScanImage(client, {
        objectPath: resolvedImagePath,
        pathSource: resolvedPathSource,
        requestId,
        scanId: scanRow.id,
        userId: user.id,
      }));

    // S-03 — borne serveur sur la taille du blob téléchargé. Le bucket
    // file_size_limit (10 MB) borne déjà l'upload, ce check protège contre
    // une éventuelle dérive de configuration côté Storage et garantit que
    // le payload base64 envoyé au webhook ne dépasse pas ~13.3 MB.
    if (scanImage.size > SCAN_IMAGE_MAX_BYTES) {
      throw new Phase2HttpError(
        413,
        'scan_image_too_large',
        'Scan image exceeds the maximum allowed size',
        { max_bytes: SCAN_IMAGE_MAX_BYTES },
      );
    }

    const imageBuffer = await scanImage.arrayBuffer();

    // S-01 — magic bytes JPEG (FF D8 FF). Le check metadata.mimetype existant
    // se base sur le contentType déclaré par le client lors de l'upload et
    // peut être contourné. La validation des magic bytes protège contre les
    // polyglots et les binaires forgés avec un Content-Type: image/jpeg.
    if (!hasJpegMagicBytes(imageBuffer)) {
      throw new Phase2HttpError(
        400,
        'invalid_scan_image_content',
        'Scan image must be a valid JPEG (magic bytes mismatch)',
      );
    }

    const imageBase64 = arrayBufferToBase64(imageBuffer);
    const webhookEndpoint = await selectScanWebhookEndpoint({
      scanId: scanRow.id,
      scanType: requestedScanType,
      userId: user.id,
    });
    webhookEnvNameForLog = webhookEndpoint.envName;
    webhookIndexForLog = webhookEndpoint.selectedIndex;

    console.info('[analyze-scan] Dispatching scan analysis webhook', {
      request_id: requestId,
      scan_id: scanRow.id,
      user_id: user.id,
      scan_type: requestedScanType,
      language_received: languageReceivedForLog,
      language_normalized: language,
      output_language: outputLanguage,
      webhook_env_name: webhookEndpoint.envName,
      webhook_index: webhookEndpoint.selectedIndex,
    });

    const webhookResult = await postWebhookJson(
      webhookEndpoint.url,
      {
        scanId: scanRow.id,
        userId: user.id,
        scanType: requestedScanType,
        language,
        locale,
        outputLanguage,
        imageBase64,
      },
      60000,
    );

    if (!webhookResult.ok) {
      throw new Phase2HttpError(
        502,
        'analysis_provider_failed',
        'Scan analysis provider returned an error',
        summarizeWebhookResult(webhookResult, {
          provider: 'scan_analysis',
          path_source: resolvedPathSource,
          scan_type: requestedScanType,
          language_received: languageReceivedForLog ?? undefined,
          language_normalized: language,
          output_language: outputLanguage,
          webhook_env_name: webhookEndpoint.envName,
          webhook_index: webhookEndpoint.selectedIndex,
        }),
      );
    }

    const analysisResult = resolveNormalizedScanAnalysisPayload(
      webhookResult.payload,
      requestedScanType,
      webhookResult.rawText,
    );

    console.info('[analyze-scan] Scan analysis response parsed', {
      request_id: requestId,
      scan_id: scanRow.id,
      user_id: user.id,
      scan_type: requestedScanType,
      analysis_scan_type:
        analysisResult && typeof analysisResult === 'object'
          ? (analysisResult as Record<string, unknown>).scan_type
          : undefined,
      language_received: languageReceivedForLog,
      language_normalized: language,
      output_language: outputLanguage,
      webhook_env_name: webhookEndpoint.envName,
      webhook_index: webhookEndpoint.selectedIndex,
      webhook_status: webhookResult.status,
    });

    const analyzedAt = new Date().toISOString();

    // S-06 — finalisation atomique via RPC : analyzing → analyzed.
    // Refuse l'update si le statut a changé (cancelled, déjà analyzed via
    // retry, etc.) pour préserver l'invariant de la machine d'état.
    const { data: finalizeResult, error: finalizeError } = await client.rpc(
      'finalize_scan_analysis',
      {
        p_scan_id: scanRow.id,
        p_user_id: user.id,
        p_status: 'analyzed',
        p_image_path: resolvedImagePath,
        p_analysis_result: analysisResult,
        p_analyzed_at: analyzedAt,
      },
    );

    if (finalizeError || !finalizeResult || (finalizeResult as Record<string, unknown>).ok !== true) {
      throw new Phase2HttpError(
        500,
        'scan_persistence_failed',
        'Failed to persist analyzed scan',
        {
          image_path: resolvedImagePath ?? undefined,
          path_source: resolvedPathSource ?? undefined,
          finalize_status:
            typeof (finalizeResult as Record<string, unknown> | null)?.status === 'string'
              ? ((finalizeResult as Record<string, unknown>).status as string)
              : undefined,
        },
      );
    }

    const { data: updatedScan, error: readBackError } = await client
      .from('scans')
      .select('*')
      .eq('id', scanRow.id)
      .eq('user_id', user.id)
      .single();

    if (readBackError || !updatedScan) {
      throw new Phase2HttpError(
        500,
        'scan_persistence_failed',
        'Failed to read back analyzed scan',
        {
          image_path: resolvedImagePath ?? undefined,
          path_source: resolvedPathSource ?? undefined,
        },
      );
    }

    pendingRollback = null;

    return jsonResponse(req, {
      success: true,
      scan: updatedScan,
    });
  } catch (error) {
    if (client && isPendingScanRollback(pendingRollback)) {
      try {
        await rollbackScanCharge(client, pendingRollback);
      } catch (refundError) {
        logPhase2Error('[analyze-scan] Refund rollback failed', refundError, {
          request_id: requestId,
          scan_id: pendingRollback.scanId,
          user_id: pendingRollback.userId,
          scan_type: pendingRollback.scanType,
        });
      }
    }

    if (error instanceof Phase2HttpError) {
      logPhase2Error('[analyze-scan] Request failed', error, {
        request_id: requestId,
        scan_id: pendingRollback?.scanId,
        user_id: pendingRollback?.userId,
        scan_type: pendingRollback?.scanType,
        language_received: languageReceivedForLog ?? undefined,
        language_normalized: languageNormalizedForLog ?? undefined,
        output_language: outputLanguageForLog ?? undefined,
        webhook_env_name: webhookEnvNameForLog ?? undefined,
        webhook_index: webhookIndexForLog ?? undefined,
        path_source: resolvedPathSource ?? undefined,
        image_path: resolvedImagePath ?? undefined,
      });
      return jsonResponse(
        req,
        toPhase2ErrorPayload(error, { requestId }),
        { status: error.status },
      );
    }

    logPhase2Error('[analyze-scan] Unexpected error', error, {
      request_id: requestId,
      scan_id: pendingRollback?.scanId,
      user_id: pendingRollback?.userId,
      scan_type: pendingRollback?.scanType,
      language_received: languageReceivedForLog ?? undefined,
      language_normalized: languageNormalizedForLog ?? undefined,
      output_language: outputLanguageForLog ?? undefined,
      webhook_env_name: webhookEnvNameForLog ?? undefined,
      webhook_index: webhookIndexForLog ?? undefined,
      path_source: resolvedPathSource ?? undefined,
      image_path: resolvedImagePath ?? undefined,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: 500 },
    );
  }
});
