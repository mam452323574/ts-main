import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { normalizeGamificationScanCount } from '@/constants/gamification';

const GAMIFICATION_STORAGE_PREFIX = 'gamification_scan_count:';

interface GamificationContextType {
  scanCount: number;
  isHydrated: boolean;
  incrementScanCount: () => Promise<number>;
  setScanCount: (scanCount: number) => Promise<number>;
  resetInMemoryStateOnUserChange: () => void;
}

const GamificationContext = createContext<GamificationContextType | undefined>(
  undefined
);

export function getGamificationStorageKey(userId: string) {
  return `${GAMIFICATION_STORAGE_PREFIX}${userId}`;
}

export function GamificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [scanCount, setScanCountState] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const scanCountRef = useRef(0);

  const applyScanCount = useCallback((nextScanCount: number) => {
    scanCountRef.current = nextScanCount;
    setScanCountState(nextScanCount);
  }, []);

  const persistScanCount = useCallback(
    async (nextScanCount: number) => {
      if (!userId) {
        return;
      }

      await AsyncStorage.setItem(
        getGamificationStorageKey(userId),
        String(nextScanCount)
      );
    },
    [userId]
  );

  const resetInMemoryStateOnUserChange = useCallback(() => {
    applyScanCount(0);
    setIsHydrated(false);
  }, [applyScanCount]);

  const setScanCount = useCallback(
    async (nextScanCount: number) => {
      const normalizedCount = normalizeGamificationScanCount(nextScanCount);

      if (normalizedCount === scanCountRef.current) {
        return normalizedCount;
      }

      applyScanCount(normalizedCount);

      try {
        await persistScanCount(normalizedCount);
      } catch (error) {
        console.error(
          '[GamificationContext] Error saving scan count to storage:',
          error
        );
      }

      return normalizedCount;
    },
    [applyScanCount, persistScanCount]
  );

  const incrementScanCount = useCallback(async () => {
    const nextScanCount = scanCountRef.current + 1;

    applyScanCount(nextScanCount);

    try {
      await persistScanCount(nextScanCount);
    } catch (error) {
      console.error(
        '[GamificationContext] Error incrementing scan count in storage:',
        error
      );
    }

    return nextScanCount;
  }, [applyScanCount, persistScanCount]);

  useEffect(() => {
    let isActive = true;

    resetInMemoryStateOnUserChange();

    if (!userId) {
      setIsHydrated(true);
      return () => {
        isActive = false;
      };
    }

    const loadStoredScanCount = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(
          getGamificationStorageKey(userId)
        );

        if (!isActive) {
          return;
        }

        applyScanCount(normalizeGamificationScanCount(storedValue));
      } catch (error) {
        if (isActive) {
          console.error(
            '[GamificationContext] Error loading scan count from storage:',
            error
          );
          applyScanCount(0);
        }
      } finally {
        if (isActive) {
          setIsHydrated(true);
        }
      }
    };

    void loadStoredScanCount();

    return () => {
      isActive = false;
    };
  }, [applyScanCount, resetInMemoryStateOnUserChange, userId]);

  const value = useMemo(
    () => ({
      scanCount,
      isHydrated,
      incrementScanCount,
      setScanCount,
      resetInMemoryStateOnUserChange,
    }),
    [
      incrementScanCount,
      isHydrated,
      resetInMemoryStateOnUserChange,
      scanCount,
      setScanCount,
    ]
  );

  return (
    <GamificationContext.Provider value={value}>
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const context = useContext(GamificationContext);

  if (!context) {
    throw new Error(
      'useGamification must be used within a GamificationProvider'
    );
  }

  return context;
}
