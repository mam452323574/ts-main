import { AnalysisType, PremiumPotentialHistoryPoint } from '@/types';

export type ProjectionMode = 'generic' | 'blended' | 'personalized';
export type ProjectionDirection = 'up' | 'down';
type ProjectionAnalysisType = Exclude<AnalysisType, 'fat_distribution_scan_v2'>;

export interface ResultProjectionPoint {
  id: string;
  day: number;
  date: string;
  chartValue: number;
  displayValue: number;
}

export interface ThirtyDayProjectionResult {
  points: ResultProjectionPoint[];
  projectedChartValue: number;
  projectedDisplayValue: number;
  currentChartValue: number;
  currentDisplayValue: number;
  midpointDisplayValue: number;
  projectedDeltaDisplayValue: number;
  projectionMode: ProjectionMode;
  direction: ProjectionDirection;
  hasHistoricalContext: boolean;
  historyPointCount: number;
}

interface BuildThirtyDayProjectionOptions {
  scanType: ProjectionAnalysisType;
  currentScore: number;
  currentDate?: string | null;
  history?: PremiumPotentialHistoryPoint[] | null;
  historicalAverage30d?: number | null;
}

interface BuildLockedTrajectoryTeaserOptions {
  scanType: ProjectionAnalysisType;
  currentScore: number;
  currentDate?: string | null;
}

interface BuildLoadingTrajectoryPlaceholderOptions {
  scanType: ProjectionAnalysisType;
  currentScore: number;
  currentDate?: string | null;
}

type ProgressScanType = BuildThirtyDayProjectionOptions['scanType'];
type ScoreZone = 'early' | 'building' | 'strong' | 'high';

interface ProjectionConfig {
  alpha: number;
  perDaySlopeCap: number;
  negativeTrendPenaltyMultiplier: number;
  baseGains: Record<ScoreZone, number>;
}

interface SanitizedHistoryResult {
  anchorDate: Date;
  anchorDateKey: string;
  currentProgressScore: number;
  entries: Array<{ date: string; progressScore: number }>;
  hasHistoricalContext: boolean;
  historyPointCount: number;
  historySpanDays: number;
}

interface TrendProfile {
  trendSlope: number;
  trendConfidence: number;
  stabilityMultiplier: number;
  positiveTrendGain: number;
  negativeTrendPenalty: number;
  anchorOutlierPenalty: number;
}

const PROJECTION_DAYS = 30;
const PROJECTION_HISTORY_WINDOW_DAYS = 90;
const MAX_RECENT_SEGMENTS = 8;
const TARGET_SERIES_DAYS = Array.from(
  { length: PROJECTION_DAYS + 1 },
  (_value, day) => day,
);

const PROJECTION_CONFIG: Record<ProgressScanType, ProjectionConfig> = {
  face: {
    alpha: 0.34,
    perDaySlopeCap: 0.4,
    negativeTrendPenaltyMultiplier: 1.24,
    baseGains: {
      early: 7.2,
      building: 5.2,
      strong: 2.8,
      high: 1.2,
    },
  },
  body: {
    alpha: 0.3,
    perDaySlopeCap: 0.34,
    negativeTrendPenaltyMultiplier: 1.28,
    baseGains: {
      early: 6.2,
      building: 4.6,
      strong: 2.4,
      high: 1.1,
    },
  },
  nutrition: {
    alpha: 0.38,
    perDaySlopeCap: 0.44,
    negativeTrendPenaltyMultiplier: 1.22,
    baseGains: {
      early: 8,
      building: 5.8,
      strong: 3,
      high: 1.3,
    },
  },
  super_health_v2: {
    alpha: 0.28,
    perDaySlopeCap: 0.26,
    negativeTrendPenaltyMultiplier: 1.08,
    baseGains: {
      early: 5,
      building: 3.8,
      strong: 2,
      high: 1,
    },
  },
};

const HISTORY_BLEND_WEIGHT: Record<ProjectionMode, number> = {
  generic: 0,
  blended: 0.42,
  personalized: 0.78,
};

const LOCKED_TEASER_GAINS: Record<ProgressScanType, Record<ScoreZone, number>> = {
  face: {
    early: 5.6,
    building: 4.2,
    strong: 2.4,
    high: 1.1,
  },
  body: {
    early: 4.8,
    building: 3.8,
    strong: 2.1,
    high: 1,
  },
  nutrition: {
    early: 5.8,
    building: 4.4,
    strong: 2.6,
    high: 1.2,
  },
  super_health_v2: {
    early: 4.2,
    building: 3.2,
    strong: 1.8,
    high: 0.9,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function medianAbsoluteDeviation(values: number[], center = median(values)) {
  if (values.length === 0) {
    return 0;
  }

  return median(values.map((value) => Math.abs(value - center)));
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    values.length;

  return Math.sqrt(variance);
}

function coefficientOfVariation(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  if (mean === 0) {
    return 0;
  }

  return standardDeviation(values) / mean;
}

function smoothProjectionProgress(progress: number) {
  const normalized = clamp(progress, 0, 1);
  const smoothstep = normalized * normalized * (3 - 2 * normalized);
  return normalized * 0.4 + smoothstep * 0.6;
}

function normalizeDateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function parseDateKey(value: string | null | undefined) {
  const normalized = normalizeDateKey(value);
  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return { key: normalized, date };
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function diffDays(fromDate: Date, toDate: Date) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function dateToKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function getTodayUtcDate(baseDate = new Date()) {
  return new Date(
    Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
    ),
  );
}

function toProgressScore(scanType: ProgressScanType, score: number) {
  const clamped = clamp(score, 0, 100);
  return scanType === 'super_health_v2' ? 100 - clamped : clamped;
}

function toDisplayScore(scanType: ProgressScanType, progressScore: number) {
  const clamped = clamp(progressScore, 0, 100);
  return scanType === 'super_health_v2' ? 100 - clamped : clamped;
}

function resolveScoreZone(progressScore: number): ScoreZone {
  if (progressScore < 55) {
    return 'early';
  }

  if (progressScore < 75) {
    return 'building';
  }

  if (progressScore < 90) {
    return 'strong';
  }

  return 'high';
}

function computeEwma(values: number[], alpha: number) {
  if (values.length === 0) {
    return [];
  }

  const smoothed: number[] = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    smoothed.push(alpha * values[index] + (1 - alpha) * smoothed[index - 1]);
  }

  return smoothed;
}

function clampHistoricalOutliers(entries: Array<{ date: string; progressScore: number }>) {
  if (entries.length < 4) {
    return entries;
  }

  const historicalValues = entries.map((entry) => entry.progressScore);
  const center = median(historicalValues);
  const mad = medianAbsoluteDeviation(historicalValues, center);
  const band = Math.max(mad * 2.75, 5);

  return entries.map((entry) => ({
    ...entry,
    progressScore: clamp(entry.progressScore, center - band, center + band),
  }));
}

function resolveAnchorDate(currentDate?: string | null) {
  const explicitDate = parseDateKey(currentDate)?.date;
  return explicitDate ?? getTodayUtcDate();
}

function sanitizeHistory(options: {
  scanType: ProgressScanType;
  history?: PremiumPotentialHistoryPoint[] | null;
  currentScore: number;
  currentDate?: string | null;
}): SanitizedHistoryResult {
  const { scanType, history, currentScore, currentDate } = options;
  const anchorDate = resolveAnchorDate(currentDate);
  const anchorDateKey = dateToKey(anchorDate);
  const currentProgressScore = toProgressScore(scanType, currentScore);
  const grouped = new Map<string, number[]>();

  for (const point of history ?? []) {
    const parsedDate = parseDateKey(point.date);
    if (!parsedDate) {
      continue;
    }

    const daysBeforeAnchor = diffDays(parsedDate.date, anchorDate);
    if (
      daysBeforeAnchor < 1 ||
      daysBeforeAnchor > PROJECTION_HISTORY_WINDOW_DAYS
    ) {
      continue;
    }

    const rawScore = Number(point.score);
    if (!Number.isFinite(rawScore)) {
      continue;
    }

    const existing = grouped.get(parsedDate.key) ?? [];
    existing.push(toProgressScore(scanType, rawScore));
    grouped.set(parsedDate.key, existing);
  }

  const historicalEntries = clampHistoricalOutliers(
    Array.from(grouped.entries())
      .map(([date, scores]) => ({
        date,
        progressScore: average(scores),
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  );
  const earliestHistoryDate = parseDateKey(historicalEntries[0]?.date)?.date;
  const historySpanDays = earliestHistoryDate
    ? Math.max(0, diffDays(earliestHistoryDate, anchorDate))
    : 0;

  return {
    anchorDate,
    anchorDateKey,
    currentProgressScore,
    entries: historicalEntries.concat({
      date: anchorDateKey,
      progressScore: currentProgressScore,
    }),
    hasHistoricalContext: historicalEntries.length > 0,
    historyPointCount: historicalEntries.length,
    historySpanDays,
  };
}

function estimateTrendProfile(options: {
  config: ProjectionConfig;
  entries: Array<{ date: string; progressScore: number }>;
  historyPointCount: number;
  historySpanDays: number;
}): TrendProfile {
  const { config, entries, historyPointCount, historySpanDays } = options;
  if (entries.length <= 1) {
    return {
      trendSlope: 0,
      trendConfidence: 0,
      stabilityMultiplier: 1,
      positiveTrendGain: 0,
      negativeTrendPenalty: 0,
      anchorOutlierPenalty: 0,
    };
  }

  const smoothedValues = computeEwma(
    entries.map((entry) => entry.progressScore),
    config.alpha,
  );
  const segmentSlopes: number[] = [];
  const intervalDays: number[] = [];

  for (let index = 1; index < smoothedValues.length; index += 1) {
    const previousDate = parseDateKey(entries[index - 1].date)?.date;
    const currentDate = parseDateKey(entries[index].date)?.date;
    if (!previousDate || !currentDate) {
      continue;
    }

    const elapsedDays = Math.max(1, diffDays(previousDate, currentDate));
    intervalDays.push(elapsedDays);
    segmentSlopes.push(
      clamp(
        (smoothedValues[index] - smoothedValues[index - 1]) / elapsedDays,
        -config.perDaySlopeCap,
        config.perDaySlopeCap,
      ),
    );
  }

  if (segmentSlopes.length === 0) {
    return {
      trendSlope: 0,
      trendConfidence: 0,
      stabilityMultiplier: 1,
      positiveTrendGain: 0,
      negativeTrendPenalty: 0,
      anchorOutlierPenalty: 0,
    };
  }

  const recentSlopes = segmentSlopes.slice(-MAX_RECENT_SEGMENTS);
  const recentMedianSlope = median(recentSlopes);
  const recentMeanSlope = average(recentSlopes);
  const firstDate = parseDateKey(entries[0].date)?.date;
  const lastDate = parseDateKey(entries[entries.length - 1].date)?.date;
  const spanDays =
    firstDate && lastDate ? Math.max(1, diffDays(firstDate, lastDate)) : 1;
  const globalSlope = clamp(
    (smoothedValues[smoothedValues.length - 1] - smoothedValues[0]) / spanDays,
    -config.perDaySlopeCap,
    config.perDaySlopeCap,
  );
  const blendedSlope = clamp(
    recentMedianSlope * 0.6 + recentMeanSlope * 0.2 + globalSlope * 0.2,
    -config.perDaySlopeCap,
    config.perDaySlopeCap,
  );
  const slopeMad = medianAbsoluteDeviation(recentSlopes, recentMedianSlope);
  const slopeVolatility =
    slopeMad + standardDeviation(recentSlopes) * 0.35;
  const volatilityRatio = clamp(
    slopeVolatility / Math.max(config.perDaySlopeCap, 0.01),
    0,
    1.35,
  );
  const intervalRegularity = clamp(
    1 - coefficientOfVariation(intervalDays),
    0.35,
    1,
  );
  const densityScore =
    historySpanDays <= 0
      ? clamp(historyPointCount / 3, 0, 1)
      : clamp(historyPointCount / Math.max(historySpanDays / 10, 1.5), 0, 1);
  const lastHistoricalDate = parseDateKey(entries[entries.length - 2]?.date)?.date;
  const anchorDate = parseDateKey(entries[entries.length - 1].date)?.date;
  const daysSinceLastHistory =
    lastHistoricalDate && anchorDate
      ? Math.max(0, diffDays(lastHistoricalDate, anchorDate))
      : PROJECTION_HISTORY_WINDOW_DAYS;
  const countConfidence = clamp(historyPointCount / 6, 0, 1);
  const coverageConfidence = clamp(historySpanDays / 35, 0, 1);
  const recencyConfidence = clamp(1 - daysSinceLastHistory / 35, 0, 1);
  const trendConfidence =
    countConfidence * 0.35 +
    coverageConfidence * 0.25 +
    recencyConfidence * 0.2 +
    intervalRegularity * 0.1 +
    densityScore * 0.1;
  const stabilityMultiplier = clamp(
    1 -
      volatilityRatio * 0.42 -
      (1 - intervalRegularity) * 0.2 +
      (densityScore - 0.5) * 0.08,
    0.58,
    1.04,
  );
  const positiveTrendGain =
    Math.max(0, blendedSlope) *
    PROJECTION_DAYS *
    (0.75 + densityScore * 0.2);
  const negativeTrendPenalty =
    Math.max(0, -blendedSlope) *
    PROJECTION_DAYS *
    config.negativeTrendPenaltyMultiplier;
  const historicalMedian = median(
    entries.slice(0, -1).map((entry) => entry.progressScore),
  );
  const currentProgressScore = entries[entries.length - 1]?.progressScore ?? 0;
  const anchorOutlierPenalty =
    historyPointCount === 0
      ? 0
      : clamp(
          Math.max(0, currentProgressScore - historicalMedian - 6) * 0.18,
          0,
          2.8,
        );

  return {
    trendSlope: blendedSlope,
    trendConfidence,
    stabilityMultiplier,
    positiveTrendGain,
    negativeTrendPenalty,
    anchorOutlierPenalty,
  };
}

function resolveProjectionMode(
  historyPointCount: number,
  historySpanDays: number,
): ProjectionMode {
  if (historyPointCount >= 5 && historySpanDays >= 28) {
    return 'personalized';
  }

  if (historyPointCount >= 3 && historySpanDays >= 10) {
    return 'blended';
  }

  return 'generic';
}

function resolveHistoricalAverageBonus(options: {
  historicalAverage30d?: number | null;
  projectionMode: ProjectionMode;
  scanType: ProgressScanType;
  currentProgressScore: number;
}) {
  const {
    historicalAverage30d,
    projectionMode,
    scanType,
    currentProgressScore,
  } = options;
  if (
    historicalAverage30d === null ||
    historicalAverage30d === undefined ||
    projectionMode === 'personalized'
  ) {
    return 0;
  }

  const averageProgressScore = toProgressScore(scanType, historicalAverage30d);
  const progressDelta = Math.max(0, averageProgressScore - currentProgressScore);
  if (progressDelta <= 0) {
    return 0;
  }

  const multiplier = projectionMode === 'generic' ? 0.16 : 0.1;
  const cap = projectionMode === 'generic' ? 1.2 : 0.8;
  return clamp(progressDelta * multiplier, 0, cap);
}

function resolveSoftCap(options: {
  baseGain: number;
  currentProgressScore: number;
  historicalAverageBonus: number;
  projectionMode: ProjectionMode;
  scoreZone: ScoreZone;
}) {
  const {
    baseGain,
    currentProgressScore,
    historicalAverageBonus,
    projectionMode,
    scoreZone,
  } = options;
  const headroom = Math.max(0, 100 - currentProgressScore);
  if (headroom <= 0) {
    return 0;
  }

  const headroomFactorByZone: Record<ScoreZone, number> = {
    early: 0.74,
    building: 0.58,
    strong: 0.4,
    high: 0.24,
  };
  const ceilingBufferByZone: Record<ScoreZone, number> = {
    early: 1.2,
    building: 0.9,
    strong: 0.45,
    high: 0.15,
  };
  const historyAllowanceByMode: Record<ProjectionMode, number> = {
    generic: 0.9,
    blended: 1.6,
    personalized: 2.4,
  };
  const headroomCap =
    headroom * headroomFactorByZone[scoreZone] +
    historicalAverageBonus +
    historyAllowanceByMode[projectionMode] * 0.65;
  const targetCap =
    baseGain +
    ceilingBufferByZone[scoreZone] +
    historicalAverageBonus +
    historyAllowanceByMode[projectionMode];

  return clamp(Math.min(headroom, Math.min(headroomCap, targetCap)), 0, headroom);
}

function resolveMotivationalFloor(options: {
  scanType: ProgressScanType;
  baseGain: number;
  projectionMode: ProjectionMode;
  stabilityMultiplier: number;
  negativeTrendPenalty: number;
  currentProgressScore: number;
}) {
  const {
    scanType,
    baseGain,
    projectionMode,
    stabilityMultiplier,
    negativeTrendPenalty,
    currentProgressScore,
  } = options;
  if (currentProgressScore >= 95) {
    return 0;
  }

  const baseFloorByMode =
    scanType === 'super_health_v2'
      ? {
          generic: 0.45,
          blended: 0.3,
          personalized: 0.18,
        }
      : {
          generic: Math.min(1.15, baseGain * 0.16 + 0.32),
          blended: Math.min(0.85, baseGain * 0.12 + 0.24),
          personalized: Math.min(0.55, baseGain * 0.08 + 0.16),
        };
  const penaltyFloorFactor = clamp(
    1 - negativeTrendPenalty / Math.max(baseGain + 0.5, 1),
    scanType === 'super_health_v2' ? 0.24 : 0.35,
    1,
  );

  return (
    baseFloorByMode[projectionMode] *
    clamp(stabilityMultiplier, 0.65, 1) *
    penaltyFloorFactor
  );
}

function resolveSparseHighRiskMultiplier(options: {
  scanType: ProgressScanType;
  currentDisplayValue: number;
  historyPointCount: number;
}) {
  const { scanType, currentDisplayValue, historyPointCount } = options;
  if (scanType !== 'super_health_v2' || historyPointCount >= 3) {
    return 1;
  }

  if (currentDisplayValue >= 80) {
    return 0.58;
  }

  if (currentDisplayValue >= 70) {
    return 0.7;
  }

  if (currentDisplayValue >= 60) {
    return 0.82;
  }

  return 1;
}

function buildProjectionPoints(options: {
  anchorDate: Date;
  scanType: ProgressScanType;
  currentProgressScore: number;
  targetChartValue: number;
}): ResultProjectionPoint[] {
  const { anchorDate, scanType, currentProgressScore, targetChartValue } = options;

  return TARGET_SERIES_DAYS.map((day) => {
    const progress = smoothProjectionProgress(day / PROJECTION_DAYS);
    const chartValue =
      currentProgressScore +
      (targetChartValue - currentProgressScore) * progress;

    return {
      id: `day_${day}`,
      day,
      date: dateToKey(addDays(anchorDate, day)),
      chartValue,
      displayValue: Math.round(toDisplayScore(scanType, chartValue)),
    };
  });
}

function resolveDirection(
  scanType: ProgressScanType,
  currentDisplayValue: number,
  projectedDisplayValue: number,
): ProjectionDirection {
  if (projectedDisplayValue !== currentDisplayValue) {
    return projectedDisplayValue > currentDisplayValue ? 'up' : 'down';
  }

  return scanType === 'super_health_v2' ? 'down' : 'up';
}

export function buildLockedTrajectoryTeaser(
  options: BuildLockedTrajectoryTeaserOptions,
) {
  const anchorDate = resolveAnchorDate(options.currentDate);
  const currentProgressScore = toProgressScore(
    options.scanType,
    options.currentScore,
  );
  const scoreZone = resolveScoreZone(currentProgressScore);
  const teaserGain = LOCKED_TEASER_GAINS[options.scanType][scoreZone];
  const targetChartValue = clamp(
    currentProgressScore + teaserGain,
    currentProgressScore,
    100,
  );

  return buildProjectionPoints({
    anchorDate,
    scanType: options.scanType,
    currentProgressScore,
    targetChartValue,
  });
}

export function buildLoadingTrajectoryPlaceholder(
  options: BuildLoadingTrajectoryPlaceholderOptions,
) {
  const anchorDate = resolveAnchorDate(options.currentDate);
  const currentProgressScore = toProgressScore(
    options.scanType,
    options.currentScore,
  );

  return buildProjectionPoints({
    anchorDate,
    scanType: options.scanType,
    currentProgressScore,
    targetChartValue: currentProgressScore,
  });
}

export function buildThirtyDayProjection(
  options: BuildThirtyDayProjectionOptions,
): ThirtyDayProjectionResult {
  const config = PROJECTION_CONFIG[options.scanType];
  const sanitized = sanitizeHistory(options);
  const scoreZone = resolveScoreZone(sanitized.currentProgressScore);
  const projectionMode = resolveProjectionMode(
    sanitized.historyPointCount,
    sanitized.historySpanDays,
  );
  const trendProfile = estimateTrendProfile({
    config,
    entries: sanitized.entries,
    historyPointCount: sanitized.historyPointCount,
    historySpanDays: sanitized.historySpanDays,
  });
  const baseGain = config.baseGains[scoreZone];
  const historicalAverageBonus = resolveHistoricalAverageBonus({
    historicalAverage30d: options.historicalAverage30d,
    projectionMode,
    scanType: options.scanType,
    currentProgressScore: sanitized.currentProgressScore,
  });
  const softCap = resolveSoftCap({
    baseGain,
    currentProgressScore: sanitized.currentProgressScore,
    historicalAverageBonus,
    projectionMode,
    scoreZone,
  });
  const observedWeight = HISTORY_BLEND_WEIGHT[projectionMode] * trendProfile.trendConfidence;
  const cappedPositiveTrendGain = Math.min(
    trendProfile.positiveTrendGain,
    baseGain +
      (projectionMode === 'personalized'
        ? 2.6
        : projectionMode === 'blended'
          ? 1.9
          : 1.2),
  );
  const currentDisplayValue = Math.round(
    toDisplayScore(options.scanType, sanitized.currentProgressScore),
  );
  const confidenceMultiplier = 0.82 + trendProfile.trendConfidence * 0.18;
  const sparseHighRiskMultiplier = resolveSparseHighRiskMultiplier({
    scanType: options.scanType,
    currentDisplayValue,
    historyPointCount: sanitized.historyPointCount,
  });
  const rawGain =
    (baseGain + historicalAverageBonus + cappedPositiveTrendGain * observedWeight) *
      trendProfile.stabilityMultiplier *
      confidenceMultiplier *
      sparseHighRiskMultiplier -
    trendProfile.negativeTrendPenalty * (0.45 + observedWeight * 0.55) -
    trendProfile.anchorOutlierPenalty;
  const motivationalFloor = resolveMotivationalFloor({
    scanType: options.scanType,
    baseGain,
    projectionMode,
    stabilityMultiplier: trendProfile.stabilityMultiplier,
    negativeTrendPenalty: trendProfile.negativeTrendPenalty,
    currentProgressScore: sanitized.currentProgressScore,
  });
  const finalGain =
    softCap <= 0
      ? 0
      : clamp(Math.max(rawGain, motivationalFloor), 0, softCap);
  const targetChartValue = clamp(
    sanitized.currentProgressScore + finalGain,
    sanitized.currentProgressScore,
    100,
  );
  const points = buildProjectionPoints({
    anchorDate: sanitized.anchorDate,
    scanType: options.scanType,
    currentProgressScore: sanitized.currentProgressScore,
    targetChartValue,
  });
  const midpointDisplayValue =
    points.find((point) => point.day === 15)?.displayValue ?? currentDisplayValue;
  const projectedDisplayValue =
    points[points.length - 1]?.displayValue ?? currentDisplayValue;

  return {
    points,
    projectedChartValue:
      points[points.length - 1]?.chartValue ?? sanitized.currentProgressScore,
    projectedDisplayValue,
    currentChartValue: sanitized.currentProgressScore,
    currentDisplayValue,
    midpointDisplayValue,
    projectedDeltaDisplayValue: projectedDisplayValue - currentDisplayValue,
    projectionMode,
    direction: resolveDirection(
      options.scanType,
      currentDisplayValue,
      projectedDisplayValue,
    ),
    hasHistoricalContext: sanitized.hasHistoricalContext,
    historyPointCount: sanitized.historyPointCount,
  };
}
