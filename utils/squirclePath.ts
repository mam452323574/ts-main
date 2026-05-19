import { getSvgPath } from 'figma-squircle';

import { SQUIRCLE_PILL_THRESHOLD, SQUIRCLE_SMOOTHING } from '@/constants/theme';

export interface SquirclePathParams {
  width: number;
  height: number;
  cornerRadius?: number;
  topLeftCornerRadius?: number;
  topRightCornerRadius?: number;
  bottomLeftCornerRadius?: number;
  bottomRightCornerRadius?: number;
  cornerSmoothing?: number;
  preserveSmoothing?: boolean;
}

const MAX_CACHE_ENTRIES = 256;
const pathCache = new Map<string, string>();

function cacheKey(params: SquirclePathParams): string {
  return [
    Math.round(params.width * 100),
    Math.round(params.height * 100),
    params.cornerRadius ?? '',
    params.topLeftCornerRadius ?? '',
    params.topRightCornerRadius ?? '',
    params.bottomRightCornerRadius ?? '',
    params.bottomLeftCornerRadius ?? '',
    params.cornerSmoothing ?? SQUIRCLE_SMOOTHING.default,
    params.preserveSmoothing === false ? '0' : '1',
  ].join('|');
}

export function buildSquirclePath(params: SquirclePathParams): string {
  const key = cacheKey(params);
  const cached = pathCache.get(key);
  if (cached !== undefined) {
    pathCache.delete(key);
    pathCache.set(key, cached);
    return cached;
  }

  const path = getSvgPath({
    width: params.width,
    height: params.height,
    cornerRadius: params.cornerRadius,
    topLeftCornerRadius: params.topLeftCornerRadius,
    topRightCornerRadius: params.topRightCornerRadius,
    bottomRightCornerRadius: params.bottomRightCornerRadius,
    bottomLeftCornerRadius: params.bottomLeftCornerRadius,
    cornerSmoothing: params.cornerSmoothing ?? SQUIRCLE_SMOOTHING.default,
    preserveSmoothing: params.preserveSmoothing ?? true,
  });

  if (pathCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = pathCache.keys().next().value;
    if (oldestKey !== undefined) pathCache.delete(oldestKey);
  }
  pathCache.set(key, path);
  return path;
}

export interface NormalizedCorners {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
}

export function maxCorner(corners: NormalizedCorners): number {
  return Math.max(corners.topLeft, corners.topRight, corners.bottomLeft, corners.bottomRight);
}

export function isPillRadius(value: number, width?: number, height?: number): boolean {
  if (value >= SQUIRCLE_PILL_THRESHOLD) return true;
  if (width !== undefined && height !== undefined) {
    return value >= Math.min(width, height) / 2;
  }
  return false;
}

export function clampCorners(
  corners: NormalizedCorners,
  width: number,
  height: number,
): NormalizedCorners {
  const limit = Math.min(width, height) / 2;
  return {
    topLeft: Math.min(corners.topLeft, limit),
    topRight: Math.min(corners.topRight, limit),
    bottomLeft: Math.min(corners.bottomLeft, limit),
    bottomRight: Math.min(corners.bottomRight, limit),
  };
}

export function __clearSquirclePathCacheForTests(): void {
  pathCache.clear();
}
