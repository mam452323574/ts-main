import {
  __clearSquirclePathCacheForTests,
  buildSquirclePath,
  clampCorners,
  isPillRadius,
} from '@/utils/squirclePath';

describe('squirclePath', () => {
  beforeEach(() => {
    __clearSquirclePathCacheForTests();
  });

  it('produces a non-empty SVG path for a uniform radius', () => {
    const path = buildSquirclePath({
      width: 200,
      height: 120,
      cornerRadius: 24,
    });
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(20);
    expect(path.startsWith('M')).toBe(true);
  });

  it('matches a stable snapshot for a 200x120 uniform 24 radius squircle', () => {
    const path = buildSquirclePath({
      width: 200,
      height: 120,
      cornerRadius: 24,
      cornerSmoothing: 0.6,
    });
    expect(path).toMatchSnapshot();
  });

  it('produces a different path for asymmetric corners', () => {
    const symmetric = buildSquirclePath({
      width: 200,
      height: 120,
      cornerRadius: 24,
    });
    const asymmetric = buildSquirclePath({
      width: 200,
      height: 120,
      topLeftCornerRadius: 24,
      topRightCornerRadius: 24,
      bottomLeftCornerRadius: 8,
      bottomRightCornerRadius: 8,
    });
    expect(asymmetric).not.toBe(symmetric);
    expect(asymmetric.length).toBeGreaterThan(20);
  });

  it('returns memoized result for identical params (referential cache hit)', () => {
    const a = buildSquirclePath({ width: 100, height: 100, cornerRadius: 12 });
    const b = buildSquirclePath({ width: 100, height: 100, cornerRadius: 12 });
    expect(a).toBe(b);
  });

  it('detects pill via large radius', () => {
    expect(isPillRadius(9999)).toBe(true);
    expect(isPillRadius(1000)).toBe(true);
    expect(isPillRadius(999)).toBe(true);
    expect(isPillRadius(24)).toBe(false);
  });

  it('detects pill via radius >= half min dimension', () => {
    expect(isPillRadius(40, 80, 100)).toBe(true);
    expect(isPillRadius(20, 80, 100)).toBe(false);
  });

  it('clamps corners to half the smaller dimension', () => {
    const result = clampCorners(
      { topLeft: 50, topRight: 50, bottomLeft: 50, bottomRight: 50 },
      80,
      100,
    );
    expect(result.topLeft).toBe(40);
    expect(result.topRight).toBe(40);
    expect(result.bottomLeft).toBe(40);
    expect(result.bottomRight).toBe(40);
  });
});
