import { GamificationData } from '@/types';

export const GAMIFICATION_EMPTY_FILENAME = 'stade_0.png' as const;
export const GAMIFICATION_LEGACY_EMPTY_FILENAME = 'image_vide.png' as const;

export const GAMIFICATION_STAGES = [
  { minScans: 200, stage: 10, filename: 'stade_10.png' },
  { minScans: 150, stage: 9, filename: 'stade_9.png' },
  { minScans: 100, stage: 8, filename: 'stade_8.png' },
  { minScans: 50, stage: 7, filename: 'stade_7.png' },
  { minScans: 30, stage: 6, filename: 'stade_6.png' },
  { minScans: 20, stage: 5, filename: 'stade_5.png' },
  { minScans: 10, stage: 4, filename: 'stade_4.png' },
  { minScans: 5, stage: 3, filename: 'stade_3.png' },
  { minScans: 3, stage: 2, filename: 'stade_2.png' },
  { minScans: 1, stage: 1, filename: 'stade_1.png' },
  { minScans: 0, stage: 0, filename: GAMIFICATION_EMPTY_FILENAME },
] as const;

export type GamificationStageDefinition = (typeof GAMIFICATION_STAGES)[number];
export type GamificationMascotFilename = GamificationStageDefinition['filename'];

export interface GamificationStageProgress {
  scanCount: number;
  currentStage: number;
  currentStageMinScans: number;
  nextStageMinScans: number | null;
  progressInStage: number;
  progressPercent: number;
  scansIntoStage: number;
  scansRemaining: number;
  isFinalStage: boolean;
}

interface ResolveGamificationOptions {
  mascotStage?: number | string | null;
  mascotFilename?: string | null;
  mascotImageUrl?: string | null;
}

const ASCENDING_GAMIFICATION_STAGES = [...GAMIFICATION_STAGES].reverse();

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeGamificationScanCount(value: unknown): number {
  const parsedValue = Number(value ?? 0);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsedValue));
}

export function getGamificationStageDefinition(
  scanCountInput: unknown
): GamificationStageDefinition {
  const scanCount = normalizeGamificationScanCount(scanCountInput);

  return (
    GAMIFICATION_STAGES.find((entry) => scanCount >= entry.minScans) ??
    GAMIFICATION_STAGES[GAMIFICATION_STAGES.length - 1]
  );
}

export function getGamificationStageProgress(
  scanCountInput: unknown
): GamificationStageProgress {
  const scanCount = normalizeGamificationScanCount(scanCountInput);
  const currentStageDefinition = getGamificationStageDefinition(scanCount);
  const currentStageIndex = ASCENDING_GAMIFICATION_STAGES.findIndex(
    (entry) => entry.stage === currentStageDefinition.stage
  );
  const nextStageDefinition =
    currentStageIndex >= 0
      ? ASCENDING_GAMIFICATION_STAGES[currentStageIndex + 1] ?? null
      : null;
  const currentStageMinScans = currentStageDefinition.minScans;
  const nextStageMinScans = nextStageDefinition?.minScans ?? null;
  const isFinalStage = nextStageMinScans === null;
  const scansIntoStage = Math.max(scanCount - currentStageMinScans, 0);
  const stageSpan =
    nextStageMinScans === null
      ? null
      : Math.max(nextStageMinScans - currentStageMinScans, 0);
  const progressInStage =
    stageSpan && stageSpan > 0
      ? clamp(scansIntoStage / stageSpan, 0, 1)
      : 1;
  const progressPercent = progressInStage * 100;
  const scansRemaining =
    nextStageMinScans === null
      ? 0
      : Math.max(nextStageMinScans - scanCount, 0);

  return {
    scanCount,
    currentStage: currentStageDefinition.stage,
    currentStageMinScans,
    nextStageMinScans,
    progressInStage,
    progressPercent,
    scansIntoStage,
    scansRemaining,
    isFinalStage,
  };
}

export function resolveGamification(
  scanCountInput: unknown,
  options: ResolveGamificationOptions = {}
): GamificationData {
  const scanCount = normalizeGamificationScanCount(scanCountInput);
  const defaultStage = getGamificationStageDefinition(scanCount);
  const parsedStage = Number(options.mascotStage ?? defaultStage.stage);
  const mascotStage = Number.isFinite(parsedStage)
    ? Math.max(0, Math.floor(parsedStage))
    : defaultStage.stage;
  const providedMascotFilename =
    typeof options.mascotFilename === 'string'
      ? options.mascotFilename.trim()
      : '';
  const mascotFilename =
    providedMascotFilename.length > 0
      ? providedMascotFilename === GAMIFICATION_LEGACY_EMPTY_FILENAME
        ? GAMIFICATION_EMPTY_FILENAME
        : providedMascotFilename
      : defaultStage.filename;
  const mascotImageUrl =
    typeof options.mascotImageUrl === 'string'
      ? options.mascotImageUrl.trim()
      : '';

  return {
    scanCount,
    mascotStage,
    mascotFilename,
    mascotImageUrl,
  };
}
