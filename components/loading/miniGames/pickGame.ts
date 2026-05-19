import AsyncStorage from '@react-native-async-storage/async-storage';

import { LOADING_MINI_GAMES } from './registry';

const STORAGE_KEY = 'loading_mini_game.recent_history';
const MAX_HISTORY = 3;

export function pickLoadingMiniGameKey(
  recentKeys: readonly string[],
  random: () => number = Math.random,
): string {
  const allKeys = LOADING_MINI_GAMES.map((entry) => entry.key);
  if (allKeys.length === 0) {
    return 'tapTargets';
  }

  const recent = new Set(recentKeys);
  const candidates =
    recent.size >= allKeys.length
      ? allKeys
      : allKeys.filter((key) => !recent.has(key));

  const pool = candidates.length > 0 ? candidates : allKeys;
  const index = Math.floor(random() * pool.length);
  return pool[index] ?? pool[0] ?? allKeys[0]!;
}

export async function loadLoadingMiniGameHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === 'string').slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export async function recordLoadingMiniGamePlayed(key: string): Promise<void> {
  try {
    const current = await loadLoadingMiniGameHistory();
    const next = [...current.filter((entry) => entry !== key), key].slice(-MAX_HISTORY);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Persistence is best-effort. If it fails, the next pick simply has less anti-repetition signal.
  }
}
