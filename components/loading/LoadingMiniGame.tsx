import React, { useEffect, useMemo, useState } from 'react';

import { useLanguage } from '@/contexts/LanguageContext';

import {
  loadLoadingMiniGameHistory,
  pickLoadingMiniGameKey,
  recordLoadingMiniGamePlayed,
} from './miniGames/pickGame';
import { LOADING_MINI_GAMES, getLoadingMiniGameEntry } from './miniGames/registry';

export type LoadingMiniGameVariant = 'coach' | 'scan';

export interface LoadingMiniGameProps {
  accentColor?: string;
  active: boolean;
  enabled?: boolean;
  durationHintMs?: number;
  variant?: LoadingMiniGameVariant;
  compact?: boolean;
  onComplete?: () => void;
  cardHeight?: number;
}

export interface LoadingMiniGameLabels {
  title: string;
  score: string;
  prompt: string;
}

export interface LoadingMiniGameGameProps {
  accentColor?: string;
  active: boolean;
  compact: boolean;
  durationHintMs?: number;
  labels: LoadingMiniGameLabels;
  onComplete?: () => void;
  variant: LoadingMiniGameVariant;
  cardHeight?: number;
}

let cachedHistory: string[] | undefined;
let pendingHistoryLoad: Promise<string[]> | undefined;

function ensureHistoryLoaded(): void {
  if (cachedHistory !== undefined || pendingHistoryLoad) {
    return;
  }
  pendingHistoryLoad = loadLoadingMiniGameHistory().then((history) => {
    cachedHistory = history;
    return history;
  });
  void pendingHistoryLoad.catch(() => {
    cachedHistory = [];
  });
}

export function __resetLoadingMiniGameStateForTests(): void {
  cachedHistory = undefined;
  pendingHistoryLoad = undefined;
}

function pickInitialGameKey(): string {
  const history = cachedHistory ?? [];
  return pickLoadingMiniGameKey(history);
}

export function LoadingMiniGame({
  accentColor,
  active,
  enabled = true,
  durationHintMs,
  variant = 'coach',
  compact = false,
  onComplete,
  cardHeight,
}: LoadingMiniGameProps) {
  ensureHistoryLoaded();
  const [gameKey] = useState<string>(() => pickInitialGameKey());
  const { t } = useLanguage();

  useEffect(() => {
    if (!active || enabled === false) {
      return;
    }
    const history = cachedHistory ?? [];
    cachedHistory = [...history.filter((entry) => entry !== gameKey), gameKey].slice(-3);
    void recordLoadingMiniGamePlayed(gameKey);
  }, [active, enabled, gameKey]);

  const entry = useMemo(
    () => getLoadingMiniGameEntry(gameKey) ?? LOADING_MINI_GAMES[0],
    [gameKey],
  );

  const labels = useMemo<LoadingMiniGameLabels>(
    () => ({
      title: t('loading_mini_game.title'),
      score: t('loading_mini_game.score'),
      prompt: entry ? t(entry.promptI18nKey) : '',
    }),
    [t, entry],
  );

  if (!active || enabled === false || !entry) {
    return null;
  }

  const SelectedGame = entry.component;

  return (
    <SelectedGame
      accentColor={accentColor}
      active={active}
      compact={compact}
      durationHintMs={durationHintMs}
      labels={labels}
      onComplete={onComplete}
      variant={variant}
      cardHeight={cardHeight}
    />
  );
}
