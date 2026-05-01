import {
  isPendingScanRollback,
  rollbackScanCharge,
} from '@/supabase/functions/_shared/scanReservations';

describe('scan reservation helpers', () => {
  it('identifies whether a failed scan still has a pending rollback to refund', () => {
    expect(isPendingScanRollback(null)).toBe(false);
    expect(
      isPendingScanRollback({
        scanId: 'scan-123',
        userId: 'user-123',
        scanType: 'health',
        createdAt: '2026-04-08T12:00:00.000Z',
        usedWelcomeCredit: false,
        canonicalPath: 'user-123/scans/scan-123.jpg',
      }),
    ).toBe(true);
  });

  it('restores a consumed welcome credit and removes the pending scan assets when refunding', async () => {
    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        welcome_credits: { health: 0, body: 1, nutrition: 1 },
        scan_usage: {
          health: {
            last_scan_date: '2026-04-08T12:00:00.000Z',
            scan_timestamps: ['2026-04-08T12:00:00.000Z'],
          },
          body: { last_scan_date: null, scan_timestamps: [] },
          nutrition: { last_scan_date: null, scan_timestamps: [] },
          super: { last_scan_date: null, scan_timestamps: [] },
        },
      },
      error: null,
    });
    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const mockDeleteEqUser = jest.fn().mockResolvedValue({ error: null });
    const mockRemove = jest.fn().mockResolvedValue({ error: null });

    const client = {
      from: jest.fn((table: string) => {
        if (table === 'user_profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: mockSingle,
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: mockUpdateEq,
            }),
          };
        }

        if (table === 'scans') {
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: mockDeleteEqUser,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      storage: {
        from: jest.fn().mockReturnValue({
          remove: mockRemove,
        }),
      },
    };

    await rollbackScanCharge(client, {
      scanId: 'scan-123',
      userId: 'user-123',
      scanType: 'health',
      createdAt: '2026-04-08T12:00:00.000Z',
      usedWelcomeCredit: true,
      canonicalPath: 'user-123/scans/scan-123.jpg',
    });

    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-123');
    expect(client.from).toHaveBeenCalledWith('user_profiles');
    expect(client.storage.from).toHaveBeenCalledWith('scan-images');
    expect(mockRemove).toHaveBeenCalledWith(['user-123/scans/scan-123.jpg']);
  });
});
