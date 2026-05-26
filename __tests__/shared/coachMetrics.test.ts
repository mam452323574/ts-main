import {
  SCAN_TYPE_TO_METRICS_PREFIX,
  TRENDED_METRICS_BY_TYPE,
  PRIORITY_METRIC_KEYS_BY_TYPE,
  getMetricsPrefixForScanType,
  getMetricDirection,
  roundMetricDelta,
  classifyMetricChange,
  orderMetricKeys,
} from '@/shared/coachMetrics';

describe('SCAN_TYPE_TO_METRICS_PREFIX', () => {
  it('maps health and face to the face_ prefix', () => {
    expect(SCAN_TYPE_TO_METRICS_PREFIX.health).toBe('face_');
    expect(SCAN_TYPE_TO_METRICS_PREFIX.face).toBe('face_');
  });

  it('keeps body, nutrition, super on their own prefix', () => {
    expect(SCAN_TYPE_TO_METRICS_PREFIX.body).toBe('body_');
    expect(SCAN_TYPE_TO_METRICS_PREFIX.nutrition).toBe('nutrition_');
    expect(SCAN_TYPE_TO_METRICS_PREFIX.super).toBe('super_');
  });
});

describe('getMetricsPrefixForScanType', () => {
  it('returns the right prefix for known scan types', () => {
    expect(getMetricsPrefixForScanType('health')).toBe('face_');
    expect(getMetricsPrefixForScanType('body')).toBe('body_');
    expect(getMetricsPrefixForScanType('nutrition')).toBe('nutrition_');
    expect(getMetricsPrefixForScanType('super')).toBe('super_');
  });

  it('returns null for unknown or null scan types', () => {
    expect(getMetricsPrefixForScanType('hydration')).toBeNull();
    expect(getMetricsPrefixForScanType('')).toBeNull();
    expect(getMetricsPrefixForScanType(null)).toBeNull();
    expect(getMetricsPrefixForScanType(undefined)).toBeNull();
  });
});

describe('getMetricDirection', () => {
  it('classifies a higher-is-better metric improvement', () => {
    expect(getMetricDirection('skin_clarity_score', 80, 70)).toBe('improving');
    expect(getMetricDirection('muscle_definition_score', 55, 50)).toBe('improving');
  });

  it('classifies a higher-is-better metric decline', () => {
    expect(getMetricDirection('skin_clarity_score', 60, 70)).toBe('declining');
  });

  it('flips the sign for lower-is-better metrics', () => {
    // Inflammation drop from 80 -> 60 should be IMPROVING.
    expect(getMetricDirection('inflammation_index_score', 60, 80)).toBe('improving');
    // Sodium rising from 40 -> 70 should be DECLINING.
    expect(getMetricDirection('sodium_level_score', 70, 40)).toBe('declining');
    expect(getMetricDirection('under_eye_shadow_score', 30, 50)).toBe('improving');
  });

  it('returns stable when the change is within tolerance', () => {
    expect(getMetricDirection('skin_clarity_score', 70, 70)).toBe('stable');
    expect(getMetricDirection('skin_clarity_score', 71, 70, { tolerance: 2 })).toBe('stable');
    expect(getMetricDirection('skin_clarity_score', 73, 70, { tolerance: 2 })).toBe('improving');
  });
});

describe('roundMetricDelta', () => {
  it('returns a 1-decimal rounded delta', () => {
    expect(roundMetricDelta(75.34, 70.16)).toBe(5.2);
    expect(roundMetricDelta(70, 75)).toBe(-5);
  });
});

describe('classifyMetricChange', () => {
  it('returns direction + signed delta + absolute magnitude', () => {
    expect(classifyMetricChange('skin_clarity_score', 78, 70)).toEqual({
      direction: 'improving',
      delta: 8,
      magnitude_abs: 8,
    });
    expect(classifyMetricChange('inflammation_index_score', 50, 70)).toEqual({
      direction: 'improving',
      delta: -20,
      magnitude_abs: 20,
    });
  });
});

describe('orderMetricKeys', () => {
  it('places priority keys first in their declared order', () => {
    const ordered = orderMetricKeys('nutrition', [
      'meal_balance_score',
      'fiber_grams_estimate',
      'hydration_contribution_score',
      'processing_level_score',
    ]);
    expect(ordered.slice(0, 3)).toEqual([
      'hydration_contribution_score',
      'meal_balance_score',
      'processing_level_score',
    ]);
    expect(ordered).toContain('fiber_grams_estimate');
  });

  it('sorts non-priority keys alphabetically after the priority block', () => {
    const ordered = orderMetricKeys('face', [
      'pore_visibility_score',
      'hydration_level',
      'lip_dryness_score',
      'skin_clarity_score',
    ]);
    expect(ordered[0]).toBe('skin_clarity_score');
    expect(ordered[1]).toBe('hydration_level');
    const tail = ordered.slice(2);
    expect(tail).toEqual(['lip_dryness_score', 'pore_visibility_score']);
  });

  it('handles unknown scan_type with pure alphabetical sort', () => {
    const ordered = orderMetricKeys('weird', ['z_key', 'a_key', 'm_key']);
    expect(ordered).toEqual(['a_key', 'm_key', 'z_key']);
  });

  it('deduplicates input keys', () => {
    const ordered = orderMetricKeys('body', [
      'recovery_readiness_score',
      'recovery_readiness_score',
      'muscle_definition_score',
    ]);
    expect(ordered).toEqual(['recovery_readiness_score', 'muscle_definition_score']);
  });
});

describe('TRENDED_METRICS_BY_TYPE', () => {
  it('exposes the four expected buckets', () => {
    expect(Object.keys(TRENDED_METRICS_BY_TYPE).sort()).toEqual(
      ['body', 'face', 'nutrition', 'super'].sort(),
    );
  });

  it('lists hydration_contribution_score in the nutrition bucket (audit driver)', () => {
    expect(TRENDED_METRICS_BY_TYPE.nutrition).toContain('hydration_contribution_score');
  });
});

describe('PRIORITY_METRIC_KEYS_BY_TYPE', () => {
  it('places hydration_contribution_score first for nutrition (audit driver)', () => {
    expect(PRIORITY_METRIC_KEYS_BY_TYPE.nutrition[0]).toBe('hydration_contribution_score');
  });

  it('places skin_clarity_score first for face', () => {
    expect(PRIORITY_METRIC_KEYS_BY_TYPE.face[0]).toBe('skin_clarity_score');
  });
});
