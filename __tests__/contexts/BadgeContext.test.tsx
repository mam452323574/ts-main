import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { BadgeProvider, useBadges } from '@/contexts/BadgeContext';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

const mockSubscribe = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
jest.mock('@/services/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: mockSubscribe,
    })),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
      })),
    })),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BadgeProvider>{children}</BadgeProvider>
);

describe('BadgeContext', () => {
  it('provides default badge state', async () => {
    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => {
      expect(result.current.badges).toEqual({
        coach: false,
        social: false,
        recipes: false,
        exercises: false,
      });
    });
  });

  it('provides clearBadge function', async () => {
    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => {
      expect(typeof result.current.clearBadge).toBe('function');
    });
  });

  it('provides setBadge function', async () => {
    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => {
      expect(typeof result.current.setBadge).toBe('function');
    });
  });

  it('sets badge when setBadge is called', async () => {
    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => {
      expect(result.current.badges.coach).toBe(false);
    });

    act(() => {
      result.current.setBadge('coach');
    });

    expect(result.current.badges.coach).toBe(true);
  });

  it('clears badge when clearBadge is called', async () => {
    const { result } = renderHook(() => useBadges(), { wrapper });

    act(() => {
      result.current.setBadge('recipes');
    });

    expect(result.current.badges.recipes).toBe(true);

    act(() => {
      result.current.clearBadge('recipes');
    });

    expect(result.current.badges.recipes).toBe(false);
  });

  it('throws error when used outside provider', () => {
    expect(() => {
      renderHook(() => useBadges());
    }).toThrow('useBadges must be used within a BadgeProvider');
  });

  it('can set and clear multiple badges', async () => {
    const { result } = renderHook(() => useBadges(), { wrapper });

    act(() => {
      result.current.setBadge('coach');
      result.current.setBadge('social');
      result.current.setBadge('recipes');
      result.current.setBadge('exercises');
    });

    expect(result.current.badges.coach).toBe(true);
    expect(result.current.badges.social).toBe(true);
    expect(result.current.badges.recipes).toBe(true);
    expect(result.current.badges.exercises).toBe(true);

    act(() => {
      result.current.clearBadge('recipes');
    });

    expect(result.current.badges.coach).toBe(true);
    expect(result.current.badges.social).toBe(true);
    expect(result.current.badges.recipes).toBe(false);
    expect(result.current.badges.exercises).toBe(true);
  });
});
