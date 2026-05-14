import type { ScanType } from '@/types';

export const SCAN_PREVIEW_LOADING_PHASES = [
  { key: 'verification', minProgress: 0, maxProgress: 18 },
  { key: 'upload', minProgress: 19, maxProgress: 42 },
  { key: 'analysis', minProgress: 43, maxProgress: 82 },
  { key: 'preparing', minProgress: 83, maxProgress: 100 },
] as const;

export type ScanPreviewLoadingPhaseKey =
  (typeof SCAN_PREVIEW_LOADING_PHASES)[number]['key'];

interface ScanPreviewLoadingDefinition {
  phaseEyebrowKey: string;
  insightChipKeys: readonly string[];
}

const SCAN_PREVIEW_LOADING_BY_TYPE: Record<
  ScanType,
  ScanPreviewLoadingDefinition
> = {
  health: {
    phaseEyebrowKey: 'scan_preview.loading.scan.health.eyebrow',
    insightChipKeys: [
      'scan_preview.loading.scan.health.insights.hydration',
      'scan_preview.loading.scan.health.insights.symmetry',
      'scan_preview.loading.scan.health.insights.glow',
    ],
  },
  body: {
    phaseEyebrowKey: 'scan_preview.loading.scan.body.eyebrow',
    insightChipKeys: [
      'scan_preview.loading.scan.body.insights.posture',
      'scan_preview.loading.scan.body.insights.composition',
      'scan_preview.loading.scan.body.insights.balance',
    ],
  },
  nutrition: {
    phaseEyebrowKey: 'scan_preview.loading.scan.nutrition.eyebrow',
    insightChipKeys: [
      'scan_preview.loading.scan.nutrition.insights.calories',
      'scan_preview.loading.scan.nutrition.insights.macros',
      'scan_preview.loading.scan.nutrition.insights.quality',
    ],
  },
  super: {
    phaseEyebrowKey: 'scan_preview.loading.scan.super.eyebrow',
    insightChipKeys: [
      'scan_preview.loading.scan.super.insights.synthesis',
      'scan_preview.loading.scan.super.insights.zones',
      'scan_preview.loading.scan.super.insights.score',
    ],
  },
};

export interface ResolvedScanPreviewLoadingContent {
  phaseKey: ScanPreviewLoadingPhaseKey;
  minProgress: number;
  maxProgress: number;
  phaseEyebrowKey: string;
  phaseHeadlineKey: string;
  phaseSubtextKey: string;
  insightChipKeys: readonly string[];
}

export function resolveScanPreviewLoadingPhase(
  progress: number,
): (typeof SCAN_PREVIEW_LOADING_PHASES)[number] {
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    SCAN_PREVIEW_LOADING_PHASES.find(
      (phase) =>
        clampedProgress >= phase.minProgress &&
        clampedProgress <= phase.maxProgress,
    ) ?? SCAN_PREVIEW_LOADING_PHASES[SCAN_PREVIEW_LOADING_PHASES.length - 1]
  );
}

export function resolveScanPreviewLoadingContent(
  scanType: ScanType,
  progress: number,
): ResolvedScanPreviewLoadingContent {
  const phase = resolveScanPreviewLoadingPhase(progress);
  const loadingDefinition =
    SCAN_PREVIEW_LOADING_BY_TYPE[scanType] ??
    SCAN_PREVIEW_LOADING_BY_TYPE.health;

  return {
    phaseKey: phase.key,
    minProgress: phase.minProgress,
    maxProgress: phase.maxProgress,
    phaseEyebrowKey: loadingDefinition.phaseEyebrowKey,
    phaseHeadlineKey: `scan_preview.loading.phases.${phase.key}.headline`,
    phaseSubtextKey: `scan_preview.loading.phases.${phase.key}.subtext`,
    insightChipKeys: loadingDefinition.insightChipKeys,
  };
}
