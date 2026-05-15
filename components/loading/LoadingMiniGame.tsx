import React, { useMemo, useState } from 'react';

import { useLanguage } from '@/contexts/LanguageContext';

import { FloatDodgeGame } from './FloatDodgeGame';
import { ReflexDotsGame } from './ReflexDotsGame';
import { TapTargetsGame } from './TapTargetsGame';

export type LoadingMiniGameVariant = 'coach' | 'superScan';

export interface LoadingMiniGameProps {
  accentColor?: string;
  active: boolean;
  enabled?: boolean;
  durationHintMs?: number;
  variant?: LoadingMiniGameVariant;
  compact?: boolean;
  onComplete?: () => void;
}

export interface LoadingMiniGameLabels {
  title: string;
  score: string;
  tapTargetsPrompt: string;
  floatDodgePrompt: string;
  reflexDotsPrompt: string;
}

export interface LoadingMiniGameGameProps {
  accentColor?: string;
  active: boolean;
  compact: boolean;
  durationHintMs?: number;
  labels: LoadingMiniGameLabels;
  onComplete?: () => void;
  variant: LoadingMiniGameVariant;
}

type GameKey = 'tapTargets' | 'floatDodge' | 'reflexDots';
type GameComponent = React.ComponentType<LoadingMiniGameGameProps>;

const GAME_KEYS: readonly GameKey[] = ['tapTargets', 'floatDodge', 'reflexDots'];

const GAME_COMPONENTS: Record<GameKey, GameComponent> = {
  tapTargets: TapTargetsGame,
  floatDodge: FloatDodgeGame,
  reflexDots: ReflexDotsGame,
};

function pickGame(): GameKey {
  return GAME_KEYS[Math.floor(Math.random() * GAME_KEYS.length)] ?? 'tapTargets';
}

export function LoadingMiniGame({
  accentColor,
  active,
  enabled = true,
  durationHintMs,
  variant = 'coach',
  compact = false,
  onComplete,
}: LoadingMiniGameProps) {
  const [gameKey] = useState<GameKey>(() => pickGame());
  const { t } = useLanguage();

  const labels = useMemo<LoadingMiniGameLabels>(
    () => ({
      title: t('loading_mini_game.title'),
      score: t('loading_mini_game.score'),
      tapTargetsPrompt: t('loading_mini_game.tap_targets_prompt'),
      floatDodgePrompt: t('loading_mini_game.float_dodge_prompt'),
      reflexDotsPrompt: t('loading_mini_game.reflex_dots_prompt'),
    }),
    [t],
  );

  if (!active || enabled === false) {
    return null;
  }

  const SelectedGame = GAME_COMPONENTS[gameKey];

  return (
    <SelectedGame
      accentColor={accentColor}
      active={active}
      compact={compact}
      durationHintMs={durationHintMs}
      labels={labels}
      onComplete={onComplete}
      variant={variant}
    />
  );
}
