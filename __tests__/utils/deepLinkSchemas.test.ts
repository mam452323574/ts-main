import {
  safeParseJsonRouteParam,
  safeReadStringRouteParam,
} from '@/utils/deepLinkSchemas';

describe('deepLinkSchemas', () => {
  describe('safeParseJsonRouteParam', () => {
    it('parses well-formed JSON route params', () => {
      expect(safeParseJsonRouteParam('{"a":1}')).toEqual({ a: 1 });
      expect(safeParseJsonRouteParam(['{"b":"x"}'])).toEqual({ b: 'x' });
    });

    it('returns null for empty or missing values', () => {
      expect(safeParseJsonRouteParam(undefined)).toBeNull();
      expect(safeParseJsonRouteParam('')).toBeNull();
      expect(safeParseJsonRouteParam([])).toBeNull();
      expect(safeParseJsonRouteParam([''])).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      expect(safeParseJsonRouteParam('{not json')).toBeNull();
      expect(safeParseJsonRouteParam('undefined')).toBeNull();
    });

    it('rejects payloads exceeding 64 KB', () => {
      const oversized = `"${'a'.repeat(65 * 1024)}"`;
      expect(safeParseJsonRouteParam(oversized)).toBeNull();
    });

    it('rejects payloads with control characters', () => {
      expect(safeParseJsonRouteParam('"hello\u0000world"')).toBeNull();
      expect(safeParseJsonRouteParam('"hello\u0007world"')).toBeNull();
    });

    it('rejects payloads with bidi control characters', () => {
      expect(safeParseJsonRouteParam('"\u202E hello"')).toBeNull();
      expect(safeParseJsonRouteParam('"\u2066hello\u2069"')).toBeNull();
    });

    it('accepts ordinary unicode text', () => {
      expect(safeParseJsonRouteParam('"héllo wörld"')).toBe('héllo wörld');
      expect(safeParseJsonRouteParam('{"x":"日本語"}')).toEqual({ x: '日本語' });
    });
  });

  describe('safeReadStringRouteParam', () => {
    it('returns the candidate string when safe', () => {
      expect(safeReadStringRouteParam('hello')).toBe('hello');
      expect(safeReadStringRouteParam(['arr'])).toBe('arr');
    });

    it('returns undefined for empty or missing values', () => {
      expect(safeReadStringRouteParam(undefined)).toBeUndefined();
      expect(safeReadStringRouteParam('')).toBeUndefined();
    });

    it('rejects oversized strings', () => {
      const oversized = 'a'.repeat(65 * 1024);
      expect(safeReadStringRouteParam(oversized)).toBeUndefined();
    });

    it('rejects strings with control / bidi characters', () => {
      expect(safeReadStringRouteParam('hello\u0000world')).toBeUndefined();
      expect(safeReadStringRouteParam('hello\u202Eworld')).toBeUndefined();
    });
  });
});
