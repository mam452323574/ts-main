import { ApiService } from '@/services/api';
import { supabase } from '@/services/supabase';

// Mock supabase
jest.mock('@/services/supabase', () => ({
    supabase: {
        auth: {
            getSession: jest.fn(),
            getUser: jest.fn(),
        },
        from: jest.fn(),
    },
}));

// Mock fetch global
global.fetch = jest.fn();

describe('ApiService.checkScanEligibility', () => {
    const mockSession = {
        access_token: 'mock-token',
        user: { id: 'user-123' },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({
            data: { session: mockSession },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return allowed for valid free user request within limits', async () => {
        const mockResponse = {
            success: true,
            allowed: true,
            message: 'Scan autorisé',
            current_count: 0,
            limit: 1,
            remaining: 1,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.checkScanEligibility('health');

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(1);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/check-and-record-scan'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ scan_type: 'health' }),
            })
        );
    });

    it('should return denied when limit is reached', async () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000000);
        const nextRechargeAt = 1000000 + 86400000;
        const mockResponse = {
            success: true,
            allowed: false,
            message: 'Limite atteinte',
            current_count: 1,
            limit: 1,
            next_available_date: nextRechargeAt,
            next_recharge_at: nextRechargeAt,
            server_now_ms: 1000500,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.checkScanEligibility('health');

        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.next_available_date).toBe(nextRechargeAt);
        expect(result.next_recharge_at).toBe(nextRechargeAt);
        expect(result.server_now_ms).toBe(1000500);
        expect(result.server_clock_offset_ms).toBe(500);
        nowSpy.mockRestore();
    });

    it('should normalize the camelCase ISO countdown contract', async () => {
        const serverNowMs = Date.parse('2026-04-28T15:24:00.000Z');
        const nextRechargeAtIso = '2026-04-29T15:24:00.000Z';
        const nextRechargeAtMs = Date.parse(nextRechargeAtIso);
        jest.spyOn(Date, 'now').mockReturnValue(serverNowMs);
        const mockResponse = {
            success: true,
            allowed: true,
            message: 'Scan disponible',
            scanType: 'nutrition',
            used: 1,
            available: 2,
            limit: 3,
            nextRechargeAt: nextRechargeAtIso,
            server_now_ms: serverNowMs,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.checkScanEligibilityOnly('nutrition');

        expect(result.current_count).toBe(1);
        expect(result.used).toBe(1);
        expect(result.remaining).toBe(2);
        expect(result.available).toBe(2);
        expect(result.next_recharge_at).toBe(nextRechargeAtMs);
        expect(result.next_available_date).toBeUndefined();
        expect(result.server_clock_offset_ms).toBe(0);
    });

    it('should preserve message_key when the backend returns a dedicated i18n key', async () => {
        const mockResponse = {
            success: true,
            allowed: false,
            message: 'Limite quotidienne atteinte (1 scan). Prochain scan disponible dans',
            message_key: 'scan_limits.msg_daily_reached_1_with_time',
            current_count: 1,
            limit: 1,
            next_available_date: Date.now() + 86400000,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.checkScanEligibility('health');

        expect(result.message_key).toBe('scan_limits.msg_daily_reached_1_with_time');
        expect(result.message).toBe('Limite quotidienne atteinte (1 scan). Prochain scan disponible dans');
    });

    it('should handle welcome credits correctly', async () => {
        const mockResponse = {
            success: true,
            allowed: true,
            message: 'Crédit de bienvenue',
            welcome_credits: 1,
            current_count: 5, // Over limit but allowed due to credit
            limit: 1,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.checkScanEligibility('body');

        expect(result.allowed).toBe(true);
        // Logic inside ApiService might calculate remaining based on limit-current, which would be negative
        // But verify API returns what we expect
        expect(result.welcome_credits).toBe(1);
    });

    it('should handle super scan for free users (denied)', async () => {
        const mockResponse = {
            success: true,
            allowed: false,
            message: 'Premium only',
            current_count: 0,
            limit: 0,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.checkScanEligibility('super');

        expect(result.allowed).toBe(false);
        expect(result.limit).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({
                error: 'Server error',
                code: 'scan_profile_lookup_failed',
                request_id: 'req-500',
            }),
        });

        await expect(ApiService.checkScanEligibility('health'))
            .rejects.toMatchObject({
                message: 'Server error',
                type: 'DATABASE',
                code: 'scan_profile_lookup_failed',
                status: 500,
                requestId: 'req-500',
            });
    });

    it('should surface backend validation errors without local fallback behavior', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 422,
            json: async () => ({
                error: 'Validation failed',
                code: 'invalid_scan_request',
                request_id: 'req-422',
            }),
        });

        await expect(ApiService.checkScanEligibility('health'))
            .rejects.toMatchObject({
                message: 'Validation failed',
                type: 'VALIDATION',
                code: 'invalid_scan_request',
                status: 422,
                requestId: 'req-422',
            });
    });
});
