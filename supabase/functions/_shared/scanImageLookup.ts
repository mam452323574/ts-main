import { Phase2HttpError } from './phase2Errors.ts';

export const STORAGE_OBJECT_LOOKUP_RETRY_DELAYS_MS = [150, 400, 900] as const;
export const STORAGE_OBJECT_DOWNLOAD_RETRY_DELAYS_MS = [
  250,
  500,
  1000,
  1500,
  2000,
  2500,
] as const;

// S-04 — La fenêtre du fallback `legacy_inferred` est resserrée à 1 s pour
// limiter la possibilité qu'un upload différent dans le namespace utilisateur
// soit incorrectement associé au scan réservé. Le backfill `image_path`
// (20260412143000_backfill_legacy_scan_image_paths) doit avoir traité la
// quasi-totalité des scans legacy. Toute résolution via ce fallback est
// désormais journalisée pour observation — voir resolveStoredScanObject().
const LEGACY_SCAN_IMAGE_LOOKBACK_MS = 1_000;
const LEGACY_SCAN_IMAGE_LOOKAHEAD_MS = 1_000;
const UNIQUE_DISTANCE_EPSILON_MS = 1;

export type StoredScanObjectRow = {
  name: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  owner: string | null;
};

export type ScanImagePathSource = 'scan_row' | 'canonical' | 'legacy_inferred';

export type ResolvedStoredScanObject = {
  path: string;
  pathSource: ScanImagePathSource;
  row: StoredScanObjectRow;
  blob?: Blob | null;
};

export type StoredScanLookupStatus = 'found' | 'missing_row' | 'lookup_error';

export type StoredScanLookupResult = {
  row: StoredScanObjectRow | null;
  lookupStatus: StoredScanLookupStatus;
};

export type StoredScanDownloadStatus =
  | 'found'
  | 'missing_blob'
  | 'download_error';

export type StoredScanDownloadResult = {
  blob: Blob | null;
  downloadStatus: StoredScanDownloadStatus;
};

export type ScanRecordForImageLookup = {
  id: string;
  user_id: string;
  created_at: string;
  analyzed_at: string | null;
  image_path: string | null;
};

type PeerScanForImageLookup = {
  id: string;
  created_at: string | null;
};

type ScanPathCandidate = {
  path: string;
  pathSource: ScanImagePathSource;
};

type StoredScanCandidateContext = {
  objectPath: string;
  pathSource: ScanImagePathSource;
  requestId: string;
  scanId: string;
  userId: string;
};

type RetryLogger = (
  message: string,
  context: Record<string, unknown>,
) => void;

export async function waitForRetryDelay(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isStableScanStoragePath(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmedPath = value.trim();
  if (trimmedPath.length === 0) {
    return false;
  }

  const lowerPath = trimmedPath.toLowerCase();
  if (
    lowerPath.startsWith('http://') ||
    lowerPath.startsWith('https://') ||
    lowerPath.startsWith('data:') ||
    lowerPath.startsWith('file://') ||
    lowerPath.startsWith('exp://')
  ) {
    return false;
  }

  if (
    trimmedPath.startsWith('/') ||
    trimmedPath.includes('?') ||
    trimmedPath.includes('#') ||
    lowerPath.includes('scan-images')
  ) {
    return false;
  }

  const segments = trimmedPath.split('/').filter((segment) => segment.length > 0);
  return segments.length >= 2;
}

export function isLegacyDirectChildScanPath(userId: string, path: string) {
  if (!isStableScanStoragePath(path)) {
    return false;
  }

  const segments = path.split('/').filter((segment) => segment.length > 0);
  const filename = segments[1] ?? '';
  return (
    segments.length === 2 &&
    segments[0] === userId &&
    /^\d+\.(jpg|jpeg)$/i.test(filename)
  );
}

export function toEpochMs(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? epochMs : null;
}

export function createScanImageNotFoundError(
  message = 'Uploaded scan image was not found at a supported storage path',
  details: Record<string, unknown> = {},
) {
  return new Phase2HttpError(404, 'scan_image_not_found', message, details);
}

export function createSyntheticStoredScanObjectRow(
  objectPath: string,
  userId: string,
): StoredScanObjectRow {
  return {
    name: objectPath,
    metadata: null,
    created_at: null,
    owner: userId,
  };
}

export function buildOrderedScanPathCandidates(
  scanRow: ScanRecordForImageLookup,
  canonicalPath: string,
): ScanPathCandidate[] {
  const orderedCandidates: ScanPathCandidate[] = [];

  if (isStableScanStoragePath(scanRow.image_path)) {
    orderedCandidates.push({
      path: scanRow.image_path,
      pathSource: 'scan_row',
    });
  }

  if (!orderedCandidates.some((candidate) => candidate.path === canonicalPath)) {
    orderedCandidates.push({
      path: canonicalPath,
      pathSource: 'canonical',
    });
  }

  return orderedCandidates;
}

export function selectLegacyStoredScanObject(options: {
  scanRow: ScanRecordForImageLookup;
  storageRows: StoredScanObjectRow[];
  peerScans: PeerScanForImageLookup[];
}): ResolvedStoredScanObject | null {
  const scanCreatedAtMs = toEpochMs(options.scanRow.created_at);
  if (scanCreatedAtMs === null) {
    return null;
  }

  const analyzedAtMs = toEpochMs(options.scanRow.analyzed_at);
  const lookupWindowStartMs = scanCreatedAtMs - LEGACY_SCAN_IMAGE_LOOKBACK_MS;
  const lookupWindowEndMs =
    analyzedAtMs ?? scanCreatedAtMs + LEGACY_SCAN_IMAGE_LOOKAHEAD_MS;

  const legacyCandidates = options.storageRows
    .filter((row) => {
      const objectCreatedAtMs = toEpochMs(row.created_at);
      return (
        row.owner === options.scanRow.user_id &&
        objectCreatedAtMs !== null &&
        objectCreatedAtMs >= lookupWindowStartMs &&
        objectCreatedAtMs <= lookupWindowEndMs &&
        isLegacyDirectChildScanPath(options.scanRow.user_id, row.name)
      );
    })
    .map((row) => ({
      row,
      objectCreatedAtMs: toEpochMs(row.created_at) ?? Number.NaN,
      distanceMs: Math.abs(
        (toEpochMs(row.created_at) ?? Number.NaN) - scanCreatedAtMs,
      ),
    }))
    .filter((candidate) => Number.isFinite(candidate.distanceMs));

  if (legacyCandidates.length === 0) {
    return null;
  }

  const normalizedPeerScans = options.peerScans
    .map((row) => ({
      id: typeof row.id === 'string' ? row.id : null,
      createdAtMs: toEpochMs(row.created_at),
    }))
    .filter(
      (row): row is { id: string; createdAtMs: number } =>
        typeof row.id === 'string' && Number.isFinite(row.createdAtMs),
    );

  const viableCandidates = legacyCandidates.filter((candidate) => {
    const distancesToPeerScans = normalizedPeerScans
      .map((peerScan) => ({
        scanId: peerScan.id,
        distanceMs: Math.abs(candidate.objectCreatedAtMs - peerScan.createdAtMs),
      }))
      .sort((left, right) => left.distanceMs - right.distanceMs);

    if (distancesToPeerScans.length === 0) {
      return false;
    }

    const bestPeerScan = distancesToPeerScans[0];
    const secondBestPeerScan = distancesToPeerScans[1];

    return (
      bestPeerScan.scanId === options.scanRow.id &&
      (!secondBestPeerScan ||
        bestPeerScan.distanceMs + UNIQUE_DISTANCE_EPSILON_MS <
          secondBestPeerScan.distanceMs)
    );
  });

  if (viableCandidates.length === 0) {
    return null;
  }

  const sortedCandidates = [...viableCandidates].sort((left, right) => {
    if (left.distanceMs !== right.distanceMs) {
      return left.distanceMs - right.distanceMs;
    }

    if (left.row.created_at !== right.row.created_at) {
      return (left.row.created_at ?? '').localeCompare(right.row.created_at ?? '');
    }

    return left.row.name.localeCompare(right.row.name);
  });

  const bestCandidate = sortedCandidates[0];
  const nextBestCandidate = sortedCandidates[1];
  if (
    nextBestCandidate &&
    bestCandidate.distanceMs + UNIQUE_DISTANCE_EPSILON_MS >=
      nextBestCandidate.distanceMs
  ) {
    return null;
  }

  return {
    path: bestCandidate.row.name,
    pathSource: 'legacy_inferred',
    row: bestCandidate.row,
  };
}

export async function retryStoredScanObjectLookupByPath(options: {
  candidate: StoredScanCandidateContext;
  lookupObjectByPath: (
    candidate: StoredScanCandidateContext,
  ) => Promise<StoredScanLookupResult>;
  retryDelaysMs?: readonly number[];
  waitForDelay?: (delayMs: number) => Promise<void>;
  logWarning?: RetryLogger;
}): Promise<StoredScanLookupResult> {
  const retryDelaysMs =
    options.retryDelaysMs ?? STORAGE_OBJECT_LOOKUP_RETRY_DELAYS_MS;
  const waitForDelay = options.waitForDelay ?? waitForRetryDelay;

  let lastLookupStatus: StoredScanLookupStatus = 'missing_row';

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const lookupResult = await options.lookupObjectByPath(options.candidate);

    if (lookupResult.row) {
      return lookupResult;
    }

    lastLookupStatus = lookupResult.lookupStatus;
    const nextDelayMs = retryDelaysMs[attempt];
    if (typeof nextDelayMs !== 'number') {
      break;
    }

    options.logWarning?.('[analyze-scan] Scan image storage row not ready yet', {
      request_id: options.candidate.requestId,
      scan_id: options.candidate.scanId,
      user_id: options.candidate.userId,
      path_source: options.candidate.pathSource,
      image_path: options.candidate.objectPath,
      attempt: attempt + 1,
      next_delay_ms: nextDelayMs,
      lookup_status: lookupResult.lookupStatus,
    });
    await waitForDelay(nextDelayMs);
  }

  return {
    row: null,
    lookupStatus: lastLookupStatus,
  };
}

export async function retryStoredScanObjectDownloadByPath(options: {
  candidate: StoredScanCandidateContext;
  downloadObjectByPath: (
    candidate: StoredScanCandidateContext,
  ) => Promise<StoredScanDownloadResult>;
  retryDelaysMs?: readonly number[];
  waitForDelay?: (delayMs: number) => Promise<void>;
  logWarning?: RetryLogger;
}): Promise<StoredScanDownloadResult> {
  const retryDelaysMs =
    options.retryDelaysMs ?? STORAGE_OBJECT_DOWNLOAD_RETRY_DELAYS_MS;
  const waitForDelay = options.waitForDelay ?? waitForRetryDelay;

  let lastDownloadStatus: StoredScanDownloadStatus = 'missing_blob';

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const downloadResult = await options.downloadObjectByPath(options.candidate);

    if (downloadResult.blob) {
      return downloadResult;
    }

    lastDownloadStatus = downloadResult.downloadStatus;
    const nextDelayMs = retryDelaysMs[attempt];
    if (typeof nextDelayMs !== 'number') {
      break;
    }

    options.logWarning?.('[analyze-scan] Scan image download not ready yet', {
      request_id: options.candidate.requestId,
      scan_id: options.candidate.scanId,
      user_id: options.candidate.userId,
      path_source: options.candidate.pathSource,
      image_path: options.candidate.objectPath,
      attempt: attempt + 1,
      next_delay_ms: nextDelayMs,
      download_status: downloadResult.downloadStatus,
    });
    await waitForDelay(nextDelayMs);
  }

  return {
    blob: null,
    downloadStatus: lastDownloadStatus,
  };
}

export async function resolveStoredScanObject(options: {
  scanRow: ScanRecordForImageLookup;
  canonicalPath: string;
  requestId: string;
  lookupObjectByPath: (
    candidate: StoredScanCandidateContext,
  ) => Promise<StoredScanLookupResult>;
  downloadObjectByPath: (
    candidate: StoredScanCandidateContext,
  ) => Promise<StoredScanDownloadResult>;
  inferLegacyStoredScanObject: () => Promise<ResolvedStoredScanObject | null>;
  lookupRetryDelaysMs?: readonly number[];
  downloadRetryDelaysMs?: readonly number[];
  waitForDelay?: (delayMs: number) => Promise<void>;
  logWarning?: RetryLogger;
}): Promise<ResolvedStoredScanObject> {
  const orderedCandidates = buildOrderedScanPathCandidates(
    options.scanRow,
    options.canonicalPath,
  );

  let lastCanonicalCandidate: StoredScanCandidateContext | null = null;
  let lastCanonicalDownloadStatus: StoredScanDownloadStatus | null = null;

  for (const candidate of orderedCandidates) {
    const candidateContext: StoredScanCandidateContext = {
      objectPath: candidate.path,
      pathSource: candidate.pathSource,
      requestId: options.requestId,
      scanId: options.scanRow.id,
      userId: options.scanRow.user_id,
    };

    const lookupResult = await retryStoredScanObjectLookupByPath({
      candidate: candidateContext,
      lookupObjectByPath: options.lookupObjectByPath,
      retryDelaysMs: options.lookupRetryDelaysMs,
      waitForDelay: options.waitForDelay,
      logWarning: options.logWarning,
    });

    if (lookupResult.row) {
      return {
        path: candidate.path,
        pathSource: candidate.pathSource,
        row: lookupResult.row,
      };
    }

    options.logWarning?.('[analyze-scan] Scan image path candidate not available', {
      request_id: options.requestId,
      scan_id: options.scanRow.id,
      user_id: options.scanRow.user_id,
      path_source: candidate.pathSource,
      image_path: candidate.path,
      lookup_status: lookupResult.lookupStatus,
    });

    if (candidate.path !== options.canonicalPath) {
      continue;
    }

    lastCanonicalCandidate = candidateContext;
    const downloadResult = await retryStoredScanObjectDownloadByPath({
      candidate: candidateContext,
      downloadObjectByPath: options.downloadObjectByPath,
      retryDelaysMs: options.downloadRetryDelaysMs,
      waitForDelay: options.waitForDelay,
      logWarning: options.logWarning,
    });

    if (downloadResult.blob) {
      return {
        path: candidate.path,
        pathSource: candidate.pathSource,
        row: createSyntheticStoredScanObjectRow(
          candidate.path,
          options.scanRow.user_id,
        ),
        blob: downloadResult.blob,
      };
    }

    lastCanonicalDownloadStatus = downloadResult.downloadStatus;
    options.logWarning?.(
      '[analyze-scan] Canonical scan image download fallback not ready',
      {
        request_id: options.requestId,
        scan_id: options.scanRow.id,
        user_id: options.scanRow.user_id,
        path_source: candidate.pathSource,
        image_path: candidate.path,
        download_status: downloadResult.downloadStatus,
      },
    );
  }

  const legacyResolution = await options.inferLegacyStoredScanObject();
  if (legacyResolution) {
    // S-04 — log d'alerte structuré : tomber dans le fallback signifie qu'un
    // scan ne dispose toujours pas d'`image_path` à jour. Ce chemin doit
    // disparaître à terme ; chaque résolution est journalisée pour suivi.
    options.logWarning?.(
      '[analyze-scan] Resolved scan image via legacy_inferred fallback — review pending',
      {
        request_id: options.requestId,
        scan_id: options.scanRow.id,
        user_id: options.scanRow.user_id,
        path_source: legacyResolution.pathSource,
        image_path: legacyResolution.path,
        legacy_fallback_used: true,
      },
    );
    return legacyResolution;
  }

  throw createScanImageNotFoundError(
    'Uploaded scan image was not found at a supported storage path',
    {
      ...(lastCanonicalCandidate
        ? {
            image_path: lastCanonicalCandidate.objectPath,
            path_source: lastCanonicalCandidate.pathSource,
          }
        : {}),
      ...(lastCanonicalDownloadStatus === 'download_error'
        ? { storage_download_failed: true }
        : {}),
    },
  );
}
