import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity, View } from 'react-native';

import {
  GamificationProvider,
  getGamificationStorageKey,
  useGamification,
} from '@/contexts/GamificationContext';
import { useAuth } from '@/contexts/AuthContext';

function buildAuthMock(userId: string | null) {
  return {
    user: userId ? { id: userId, email: `${userId}@example.com` } : null,
    session: userId ? { access_token: 'test-token' } : null,
    userProfile: userId ? { account_tier: 'free', avatar_url: null } : null,
    isLoading: false,
    loading: false,
    signOut: jest.fn(),
  };
}

function Harness() {
  const {
    scanCount,
    isHydrated,
    incrementScanCount,
    setScanCount,
  } = useGamification();

  return (
    <View>
      <Text testID="scan-count">{String(scanCount)}</Text>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <TouchableOpacity
        testID="increment"
        onPress={() => {
          void incrementScanCount();
        }}
      />
      <TouchableOpacity
        testID="set-count"
        onPress={() => {
          void setScanCount(7);
        }}
      />
    </View>
  );
}

describe('GamificationContext', () => {
  const mockUseAuth = useAuth as unknown as jest.Mock;
  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(buildAuthMock('user-1'));
    mockedAsyncStorage.getItem.mockResolvedValue(null);
  });

  it('loads the stored scan count for the current user', async () => {
    mockedAsyncStorage.getItem.mockResolvedValue('4');

    render(
      <GamificationProvider>
        <Harness />
      </GamificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('scan-count').props.children).toBe('4');
      expect(screen.getByTestId('hydrated').props.children).toBe('true');
    });
    expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith(
      getGamificationStorageKey('user-1')
    );
  });

  it('increments and persists the local scan count', async () => {
    render(
      <GamificationProvider>
        <Harness />
      </GamificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hydrated').props.children).toBe('true');
    });

    fireEvent.press(screen.getByTestId('increment'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-count').props.children).toBe('1');
    });
    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      getGamificationStorageKey('user-1'),
      '1'
    );
  });

  it('persists setScanCount updates for the current user', async () => {
    render(
      <GamificationProvider>
        <Harness />
      </GamificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hydrated').props.children).toBe('true');
    });

    fireEvent.press(screen.getByTestId('set-count'));

    await waitFor(() => {
      expect(screen.getByTestId('scan-count').props.children).toBe('7');
    });
    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      getGamificationStorageKey('user-1'),
      '7'
    );
  });

  it('reloads a different stored count when the authenticated user changes', async () => {
    mockedAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === getGamificationStorageKey('user-1')) {
        return '2';
      }

      if (key === getGamificationStorageKey('user-2')) {
        return '9';
      }

      return null;
    });

    const { rerender } = render(
      <GamificationProvider>
        <Harness />
      </GamificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('scan-count').props.children).toBe('2');
    });

    mockUseAuth.mockReturnValue(buildAuthMock('user-2'));

    rerender(
      <GamificationProvider>
        <Harness />
      </GamificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('scan-count').props.children).toBe('9');
    });
    expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith(
      getGamificationStorageKey('user-2')
    );
  });
});
