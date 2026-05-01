import {
  invalidateScanEligibilityQueries,
  SCAN_ELIGIBILITY_QUERY_KEY,
  SCAN_ELIGIBILITY_QUERY_SCOPE,
} from '@/utils/scanEligibilityQuery';

describe('scanEligibilityQuery', () => {
  it('builds user-scoped eligibility keys', () => {
    expect(SCAN_ELIGIBILITY_QUERY_SCOPE('user-123')).toEqual([
      'scanEligibility',
      'user-123',
    ]);
    expect(SCAN_ELIGIBILITY_QUERY_KEY('user-123', 'body')).toEqual([
      'scanEligibility',
      'user-123',
      'body',
    ]);
  });

  it('invalidates all scan eligibility queries for a user', async () => {
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);

    await invalidateScanEligibilityQueries(
      { invalidateQueries } as any,
      'user-123',
    );

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['scanEligibility', 'user-123'],
    });
  });

  it('skips invalidation when there is no user id', async () => {
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);

    await invalidateScanEligibilityQueries({ invalidateQueries } as any, null);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
