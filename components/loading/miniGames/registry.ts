import type React from 'react';

import type { LoadingMiniGameGameProps } from '../LoadingMiniGame';

import { BarStopGame } from './BarStopGame';
import { BubblePopGame } from './BubblePopGame';
import { BugSquashGame } from './BugSquashGame';
import { ColorMatchGame } from './ColorMatchGame';
import { FloatDodgeGame } from './FloatDodgeGame';
import { GreenLightGame } from './GreenLightGame';
import { MazeRunnerGame } from './MazeRunnerGame';
import { NumberOrderGame } from './NumberOrderGame';
import { OddOneOutGame } from './OddOneOutGame';
import { OrderRecallGame } from './OrderRecallGame';
import { PathTraceGame } from './PathTraceGame';
import { PerfectTimingGame } from './PerfectTimingGame';
import { QuickGlanceGame } from './QuickGlanceGame';
import { ReflexDotsGame } from './ReflexDotsGame';
import { RhythmTapGame } from './RhythmTapGame';
import { SameShapeGame } from './SameShapeGame';
import { SimonSaysGame } from './SimonSaysGame';
import { SlalomGame } from './SlalomGame';
import { SortFallingGame } from './SortFallingGame';
import { TapTargetsGame } from './TapTargetsGame';

export interface LoadingMiniGameEntry {
  key: string;
  component: React.ComponentType<LoadingMiniGameGameProps>;
  promptI18nKey: string;
}

export const LOADING_MINI_GAMES: readonly LoadingMiniGameEntry[] = [
  { key: 'tapTargets', component: TapTargetsGame, promptI18nKey: 'loading_mini_game.prompts.tap_targets' },
  { key: 'floatDodge', component: FloatDodgeGame, promptI18nKey: 'loading_mini_game.prompts.float_dodge' },
  { key: 'reflexDots', component: ReflexDotsGame, promptI18nKey: 'loading_mini_game.prompts.reflex_dots' },
  { key: 'bugSquash', component: BugSquashGame, promptI18nKey: 'loading_mini_game.prompts.bug_squash' },
  { key: 'colorMatch', component: ColorMatchGame, promptI18nKey: 'loading_mini_game.prompts.color_match' },
  { key: 'numberOrder', component: NumberOrderGame, promptI18nKey: 'loading_mini_game.prompts.number_order' },
  { key: 'bubblePop', component: BubblePopGame, promptI18nKey: 'loading_mini_game.prompts.bubble_pop' },
  { key: 'perfectTiming', component: PerfectTimingGame, promptI18nKey: 'loading_mini_game.prompts.perfect_timing' },
  { key: 'rhythmTap', component: RhythmTapGame, promptI18nKey: 'loading_mini_game.prompts.rhythm_tap' },
  { key: 'barStop', component: BarStopGame, promptI18nKey: 'loading_mini_game.prompts.bar_stop' },
  { key: 'simonSays', component: SimonSaysGame, promptI18nKey: 'loading_mini_game.prompts.simon_says' },
  { key: 'orderRecall', component: OrderRecallGame, promptI18nKey: 'loading_mini_game.prompts.order_recall' },
  { key: 'quickGlance', component: QuickGlanceGame, promptI18nKey: 'loading_mini_game.prompts.quick_glance' },
  { key: 'pathTrace', component: PathTraceGame, promptI18nKey: 'loading_mini_game.prompts.path_trace' },
  { key: 'sameShape', component: SameShapeGame, promptI18nKey: 'loading_mini_game.prompts.same_shape' },
  { key: 'oddOneOut', component: OddOneOutGame, promptI18nKey: 'loading_mini_game.prompts.odd_one_out' },
  { key: 'mazeRunner', component: MazeRunnerGame, promptI18nKey: 'loading_mini_game.prompts.maze_runner' },
  { key: 'slalom', component: SlalomGame, promptI18nKey: 'loading_mini_game.prompts.slalom' },
  { key: 'greenLight', component: GreenLightGame, promptI18nKey: 'loading_mini_game.prompts.green_light' },
  { key: 'sortFalling', component: SortFallingGame, promptI18nKey: 'loading_mini_game.prompts.sort_falling' },
];

export function getLoadingMiniGameEntry(key: string): LoadingMiniGameEntry | undefined {
  return LOADING_MINI_GAMES.find((entry) => entry.key === key);
}
