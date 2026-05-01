import {
  resolveStoredScanObject,
  selectLegacyStoredScanObject,
  type ScanRecordForImageLookup,
  type StoredScanDownloadResult,
  type StoredScanLookupResult,
  type StoredScanObjectRow,
} from '@/supabase/functions/_shared/scanImageLookup';

const baseScanRow: ScanRecordForImageLookup = {
  id: 'scan-123',
  user_id: 'user-123',
  created_at: '2026-04-12T10:00:00.000Z',
  analyzed_at: null,
  image_path: null,
};

const canonicalPath = 'user-123/scans/scan-123.jpg';

function createStoredObjectRow(
  overrides: Partial<StoredScanObjectRow> = {},
): StoredScanObjectRow {
  return {
    name: canonicalPath,
    metadata: { mimetype: 'image/jpeg' },
    created_at: '2026-04-12T10:00:00.200Z',
    owner: 'user-123',
    ...overrides,
  };
}

function createLookupMiss(): StoredScanLookupResult {
  return {
    row: null,
    lookupStatus: 'missing_row',
  };
}

function createDownloadMiss(): StoredScanDownloadResult {
  return {
    blob: null,
    downloadStatus: 'missing_blob',
  };
}

describe('scan image lookup helpers', () => {
  it('resolves the canonical path when scan.image_path is null', async () => {
    const inferLegacyStoredScanObject = jest.fn().mockResolvedValue(null);
    const downloadObjectByPath = jest.fn().mockResolvedValue(createDownloadMiss());

    const result = await resolveStoredScanObject({
      scanRow: baseScanRow,
      canonicalPath,
      requestId: 'req-canonical',
      lookupObjectByPath: jest.fn(async (candidate) => ({
        row:
          candidate.objectPath === canonicalPath
            ? createStoredObjectRow()
            : null,
        lookupStatus:
          candidate.objectPath === canonicalPath
            ? ('found' as const)
            : ('missing_row' as const),
      })),
      downloadObjectByPath,
      inferLegacyStoredScanObject,
    });

    expect(result.path).toBe(canonicalPath);
    expect(result.pathSource).toBe('canonical');
    expect(downloadObjectByPath).not.toHaveBeenCalled();
    expect(inferLegacyStoredScanObject).not.toHaveBeenCalled();
  });

  it('keeps retrying lookup until the storage row becomes visible within the retry budget', async () => {
    const waitCalls: number[] = [];
    let lookupAttempt = 0;

    const result = await resolveStoredScanObject({
      scanRow: baseScanRow,
      canonicalPath,
      requestId: 'req-delayed-lookup',
      lookupObjectByPath: jest.fn(async () => {
        lookupAttempt += 1;
        if (lookupAttempt < 3) {
          return createLookupMiss();
        }

        return {
          row: createStoredObjectRow(),
          lookupStatus: 'found' as const,
        };
      }),
      downloadObjectByPath: jest.fn().mockResolvedValue(createDownloadMiss()),
      inferLegacyStoredScanObject: jest.fn().mockResolvedValue(null),
      waitForDelay: async (delayMs) => {
        waitCalls.push(delayMs);
      },
    });

    expect(result.pathSource).toBe('canonical');
    expect(lookupAttempt).toBe(3);
    expect(waitCalls).toEqual([150, 400]);
  });

  it('falls back to a direct canonical download when metadata lookup keeps missing', async () => {
    const fallbackBlob = new Blob(['scan-image']);
    const waitCalls: number[] = [];
    let downloadAttempt = 0;

    const result = await resolveStoredScanObject({
      scanRow: baseScanRow,
      canonicalPath,
      requestId: 'req-direct-download',
      lookupObjectByPath: jest.fn(async () => createLookupMiss()),
      downloadObjectByPath: jest.fn(async () => {
        downloadAttempt += 1;

        if (downloadAttempt === 1) {
          return createDownloadMiss();
        }

        return {
          blob: fallbackBlob,
          downloadStatus: 'found' as const,
        };
      }),
      inferLegacyStoredScanObject: jest.fn().mockResolvedValue(null),
      waitForDelay: async (delayMs) => {
        waitCalls.push(delayMs);
      },
    });

    expect(result.path).toBe(canonicalPath);
    expect(result.pathSource).toBe('canonical');
    expect(result.row.owner).toBe('user-123');
    expect(result.blob).toBe(fallbackBlob);
    expect(downloadAttempt).toBe(2);
    expect(waitCalls).toEqual([150, 400, 900, 250]);
  });

  it('falls back to the legacy inferred path when canonical lookup fails', async () => {
    const legacyPath = 'user-123/1712916000123.jpg';
    const legacyResolution = selectLegacyStoredScanObject({
      scanRow: baseScanRow,
      storageRows: [
        createStoredObjectRow({
          name: legacyPath,
          created_at: '2026-04-12T10:00:00.123Z',
        }),
      ],
      peerScans: [
        { id: 'scan-123', created_at: '2026-04-12T10:00:00.000Z' },
      ],
    });

    const result = await resolveStoredScanObject({
      scanRow: baseScanRow,
      canonicalPath,
      requestId: 'req-legacy',
      lookupObjectByPath: jest.fn(async () => createLookupMiss()),
      downloadObjectByPath: jest.fn(async () => createDownloadMiss()),
      inferLegacyStoredScanObject: jest.fn().mockResolvedValue(legacyResolution),
      waitForDelay: async () => {},
    });

    expect(result.path).toBe(legacyPath);
    expect(result.pathSource).toBe('legacy_inferred');
  });

  it('logs a structured warning when resolving via legacy_inferred fallback (S-04)', async () => {
    const legacyPath = 'user-123/1712916000123.jpg';
    const legacyResolution = selectLegacyStoredScanObject({
      scanRow: baseScanRow,
      storageRows: [
        createStoredObjectRow({
          name: legacyPath,
          created_at: '2026-04-12T10:00:00.123Z',
        }),
      ],
      peerScans: [
        { id: 'scan-123', created_at: '2026-04-12T10:00:00.000Z' },
      ],
    });
    const logWarning = jest.fn();

    await resolveStoredScanObject({
      scanRow: baseScanRow,
      canonicalPath,
      requestId: 'req-legacy-log',
      lookupObjectByPath: jest.fn(async () => createLookupMiss()),
      downloadObjectByPath: jest.fn(async () => createDownloadMiss()),
      inferLegacyStoredScanObject: jest.fn().mockResolvedValue(legacyResolution),
      waitForDelay: async () => {},
      logWarning,
    });

    const fallbackCalls = logWarning.mock.calls.filter(([message]) =>
      typeof message === 'string' && message.includes('legacy_inferred fallback'),
    );
    expect(fallbackCalls).toHaveLength(1);
    expect(fallbackCalls[0][1]).toMatchObject({
      legacy_fallback_used: true,
      path_source: 'legacy_inferred',
      scan_id: 'scan-123',
      user_id: 'user-123',
    });
  });

  it('throws a 404 scan_image_not_found error when no storage candidate resolves', async () => {
    await expect(
      resolveStoredScanObject({
        scanRow: baseScanRow,
        canonicalPath,
        requestId: 'req-not-found',
        lookupObjectByPath: jest.fn(async () => createLookupMiss()),
        downloadObjectByPath: jest.fn(async () => createDownloadMiss()),
        inferLegacyStoredScanObject: jest.fn().mockResolvedValue(null),
        waitForDelay: async () => {},
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'scan_image_not_found',
    });
  });
});
