import { refundCoachQuotaEventWithRetry } from '@/supabase/functions/_shared/coachQuota';

function createRpcClient(responses: Array<{ data?: unknown; error?: unknown }>) {
  const calls: Array<{ name: string; args: unknown }> = [];
  let index = 0;
  return {
    calls,
    rpc: jest.fn((name: string, args: unknown) => {
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      calls.push({ name, args });
      return Promise.resolve({
        data: response.data ?? null,
        error: response.error ?? null,
      });
    }),
  };
}

describe('refundCoachQuotaEventWithRetry', () => {
  it('short-circuits to success when usageEventId is null (no RPC call)', async () => {
    const client = createRpcClient([{ error: { message: 'should not call' } }]);

    const result = await refundCoachQuotaEventWithRetry(client, {
      usageEventId: null,
      userId: 'user-1',
    });

    expect(result).toEqual({ success: true, attempts: 0, data: null, lastError: null });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('returns success on the first attempt when the RPC succeeds', async () => {
    const client = createRpcClient([
      { data: { success: true, refunded: true } },
    ]);

    const result = await refundCoachQuotaEventWithRetry(client, {
      usageEventId: 'usage-1',
      userId: 'user-1',
      reason: 'webhook_timeout',
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.lastError).toBeNull();
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.calls[0]).toEqual({
      name: 'refund_coach_quota_event',
      args: {
        p_usage_event_id: 'usage-1',
        p_user_id: 'user-1',
        p_reason: 'webhook_timeout',
      },
    });
  });

  it('retries after a transient DB failure and reports the winning attempt count', async () => {
    const client = createRpcClient([
      { error: { message: 'deadlock detected', code: '40P01' } },
      { error: { message: 'deadlock detected', code: '40P01' } },
      { data: { success: true, refunded: true } },
    ]);
    const sleep = jest.fn().mockResolvedValue(undefined);

    const result = await refundCoachQuotaEventWithRetry(
      client,
      { usageEventId: 'usage-1', userId: 'user-1' },
      [0, 50, 200],
      sleep,
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(client.rpc).toHaveBeenCalledTimes(3);
    // First attempt has delay 0 → no sleep. Subsequent delays are honored.
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 50);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('returns success=false with the last error after exhausting all attempts', async () => {
    const persistentError = { message: 'connection terminated', code: 'XX000' };
    const client = createRpcClient([
      { error: persistentError },
      { error: persistentError },
      { error: persistentError },
    ]);
    const sleep = jest.fn().mockResolvedValue(undefined);

    const result = await refundCoachQuotaEventWithRetry(
      client,
      { usageEventId: 'usage-1', userId: 'user-1', reason: 'webhook_unreachable' },
      [0, 10, 20],
      sleep,
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.data).toBeNull();
    expect(result.lastError).toBeDefined();
    expect(client.rpc).toHaveBeenCalledTimes(3);
  });

  it('defaults the reason to `technical_failure` when omitted', async () => {
    const client = createRpcClient([{ data: { success: true, refunded: true } }]);

    await refundCoachQuotaEventWithRetry(client, {
      usageEventId: 'usage-1',
      userId: 'user-1',
    });

    expect(client.calls[0].args).toEqual(
      expect.objectContaining({ p_reason: 'technical_failure' }),
    );
  });
});
