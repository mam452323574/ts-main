import { ApiError } from '@/services/api';
import {
  getScanQuotaStatusLabelKey,
  hasScanQuotaPayload,
  resolveScanQuotaState,
} from '@/utils/scanQuotaState';

describe('scanQuotaState', () => {
  it('returns available for a free standard scan with numeric quota data', () => {
    const state = resolveScanQuotaState({
      scanType: 'health',
      accountTier: 'free',
      eligibility: {
        success: true,
        allowed: true,
        message: 'OK',
        remaining: 1,
        current_count: 0,
        limit: 1,
      },
      isAuthReady: true,
      canQuery: true,
    });

    expect(state).toEqual(
      expect.objectContaining({
        status: 'available',
        remaining: 1,
        limit: 1,
        allowed: true,
        welcomeCredits: 0,
      }),
    );
    expect(hasScanQuotaPayload(state)).toBe(true);
  });

  it('returns exhausted for a premium scan and preserves next availability metadata', () => {
    const state = resolveScanQuotaState({
      scanType: 'body',
      accountTier: 'premium',
      eligibility: {
        success: true,
        allowed: false,
        message: 'Limit reached',
        remaining: 0,
        current_count: 3,
        limit: 3,
        next_available_date: 12345,
        next_recharge_at: 12345,
        server_clock_offset_ms: 250,
        remaining_welcome_credits: 1,
      },
      isAuthReady: true,
      canQuery: true,
    });

    expect(state).toEqual(
      expect.objectContaining({
        status: 'exhausted',
        remaining: 0,
        limit: 3,
        allowed: false,
        nextAvailableDate: 12345,
        nextRechargeAt: 12345,
        serverClockOffsetMs: 250,
        welcomeCredits: 1,
      }),
    );
    expect(hasScanQuotaPayload(state)).toBe(true);
  });

  it('resolves camelCase quota payloads with ISO recharge timestamps', () => {
    const nextRechargeAt = '2026-04-29T15:24:00.000Z';
    const state = resolveScanQuotaState({
      scanType: 'nutrition',
      accountTier: 'premium',
      eligibility: {
        success: true,
        allowed: true,
        message: 'OK',
        used: 1,
        available: 2,
        limit: 3,
        nextRechargeAt,
      },
      isAuthReady: true,
      canQuery: true,
    });

    expect(state).toEqual(
      expect.objectContaining({
        status: 'available',
        remaining: 2,
        limit: 3,
        nextRechargeAt: Date.parse(nextRechargeAt),
      }),
    );
    expect(hasScanQuotaPayload(state)).toBe(true);
  });

  it('returns available for admin with numeric backend limits', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'super',
        accountTier: 'admin',
        eligibility: {
          success: true,
          allowed: true,
          message: 'Admin',
          current_count: 0,
          limit: 20,
        },
        isAuthReady: true,
        canQuery: true,
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'available',
        remaining: 20,
        limit: 20,
      }),
    );
  });

  it('returns locked for free super scan', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'super',
        accountTier: 'free',
        eligibility: {
          success: true,
          allowed: false,
          message: 'Premium only',
          remaining: 0,
          limit: 0,
        },
        isAuthReady: true,
        canQuery: true,
      }),
    ).toEqual({
      status: 'locked',
      accountTier: 'free',
    });
  });

  it('returns auth-unready while auth is hydrating', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'nutrition',
        accountTier: 'premium',
        isAuthReady: false,
        canQuery: false,
      }),
    ).toEqual({ status: 'auth-unready' });
  });

  it('returns auth-unready when querying is disabled after auth is ready', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'health',
        accountTier: 'premium',
        isAuthReady: true,
        canQuery: false,
      }),
    ).toEqual({ status: 'auth-unready' });
  });

  it('returns loading while a query is actively fetching', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'nutrition',
        accountTier: 'premium',
        loading: true,
        isAuthReady: true,
        canQuery: true,
      }),
    ).toEqual({ status: 'loading' });
  });

  it('returns query-error when a non-connectivity eligibility error exists', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'body',
        accountTier: 'admin',
        error: new ApiError('schema mismatch', 'DATABASE'),
        isAuthReady: true,
        canQuery: true,
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'query-error',
      }),
    );
  });

  it('returns backend-unavailable when a connectivity error exists', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'body',
        accountTier: 'premium',
        error: new ApiError('Network request failed', 'NETWORK'),
        isAuthReady: true,
        canQuery: true,
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'backend-unavailable',
      }),
    );
  });

  it('returns missing-payload when the query settles without data or error', () => {
    expect(
      resolveScanQuotaState({
        scanType: 'health',
        accountTier: 'premium',
        isAuthReady: true,
        canQuery: true,
      }),
    ).toEqual({ status: 'missing-payload' });
  });

  it('maps distinct fallback label keys for non-payload states', () => {
    expect(getScanQuotaStatusLabelKey({ status: 'auth-unready' })).toBe(
      'scan_limit.auth_unready',
    );
    expect(getScanQuotaStatusLabelKey({ status: 'loading' })).toBe(
      'scan_limit.loading',
    );
    expect(
      getScanQuotaStatusLabelKey({
        status: 'query-error',
        error: new Error('broken'),
      }),
    ).toBe('scan_limit.query_error');
    expect(
      getScanQuotaStatusLabelKey({
        status: 'backend-unavailable',
        error: new Error('offline'),
      }),
    ).toBe('scan_limit.backend_unavailable');
    expect(getScanQuotaStatusLabelKey({ status: 'missing-payload' })).toBe(
      'scan_limit.missing_payload',
    );
    expect(
      getScanQuotaStatusLabelKey({ status: 'locked', accountTier: 'free' }),
    ).toBe('scan_limits.premium_only');
  });
});
