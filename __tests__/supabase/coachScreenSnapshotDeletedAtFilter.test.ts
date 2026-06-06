// Hotfix lock for F-01 residual (audit express 2026-05-27).
//
// The `coach-screen-snapshot` Edge Function feeds the Coach idle screen
// (`screens/CoachScreen.tsx` → `useCoachScreenSnapshot()`). The audit found
// that the function read `coach_entries` three times without filtering
// `deleted_at IS NULL`, which let a soft-deleted advice resurface as the
// "latest" guidance on the idle screen.
//
// The hotfix:
//   - anchored `.is('deleted_at', null)` in `applyReadyEntryFilters` (covers
//     `fetchLatestReadyEntry` + `fetchHistorySummary` in one place)
//   - mirrored the filter inline inside `fetchCoachEntries`, which does not go
//     through the helper
//
// This file follows the same pattern as
// `__tests__/supabase/coachHistorySoftDeleteEdgeFunctions.test.ts`: it greps the
// source of the Edge Function so a future regression that removes the filter
// fails the CI loudly. We do not boot Deno in Jest — the existing soft-delete
// Edge Function suite uses the same source-level lock for the same reason.

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const SNAPSHOT_INDEX_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'functions',
  'coach-screen-snapshot',
  'index.ts',
);

function read(p: string) {
  return fs.readFileSync(p, 'utf8');
}

function extractFunctionBody(source: string, signature: RegExp): string {
  const match = source.match(signature);
  if (!match) {
    throw new Error(
      `Function signature not found in coach-screen-snapshot/index.ts: ${signature}`,
    );
  }
  // The signature regex captures up to and including the `(` of the parameter
  // list. We start scanning right after that `(`, already inside the param
  // group (parenDepth = 1), so we can walk past inline object-type braces
  // without mistaking them for the function body.
  let i = (match.index ?? 0) + match[0].length;
  let parenDepth = 1;
  for (; i < source.length; i++) {
    const char = source[i];
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        i += 1;
        break;
      }
    }
  }
  // Now find the first `{` after the parameter list — that's the body start.
  while (i < source.length && source[i] !== '{') {
    i += 1;
  }
  if (i >= source.length) {
    throw new Error(
      `Could not locate function body for signature: ${signature}`,
    );
  }
  const bodyStart = i;
  let depth = 0;
  for (let j = bodyStart; j < source.length; j++) {
    const char = source[j];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, j + 1);
      }
    }
  }
  throw new Error(
    `Unable to extract balanced body for signature: ${signature}`,
  );
}

describe('coach-screen-snapshot Edge Function excludes soft-deleted entries (F-01)', () => {
  it('the snapshot Edge Function source file exists', () => {
    expect(fs.existsSync(SNAPSHOT_INDEX_PATH)).toBe(true);
  });

  describe('applyReadyEntryFilters helper', () => {
    it("anchors `.is('deleted_at', null)` so callers cannot forget it", () => {
      const source = read(SNAPSHOT_INDEX_PATH);
      const helperBody = extractFunctionBody(
        source,
        /function\s+applyReadyEntryFilters\s*\(/,
      );

      expect(helperBody).toMatch(/\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)/);
      // Sanity: the original ready/title/body guards are still here too.
      expect(helperBody).toMatch(/\.eq\(\s*['"]status['"]\s*,\s*['"]ready['"]/);
      expect(helperBody).toMatch(/\.not\(\s*['"]title['"]\s*,\s*['"]is['"]/);
    });
  });

  describe('fetchCoachEntries (does not go through the helper)', () => {
    it("applies `.is('deleted_at', null)` inline on the entries query", () => {
      const source = read(SNAPSHOT_INDEX_PATH);
      const body = extractFunctionBody(
        source,
        /async\s+function\s+fetchCoachEntries\s*\(/,
      );

      expect(body).toMatch(/\.from\(\s*['"]coach_entries['"]\s*\)/);
      expect(body).toMatch(/\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)/);
      // Sanity: the query is still scoped to the caller (no cross-user leak).
      expect(body).toMatch(/\.eq\(\s*['"]user_id['"]\s*,\s*userId\s*\)/);
    });
  });

  describe('fetchLatestReadyEntry consumes the helper', () => {
    it('routes its base query through applyReadyEntryFilters', () => {
      const source = read(SNAPSHOT_INDEX_PATH);
      const body = extractFunctionBody(
        source,
        /async\s+function\s+fetchLatestReadyEntry\s*\(/,
      );

      expect(body).toContain('applyReadyEntryFilters');
      expect(body).toMatch(/\.from\(\s*['"]coach_entries['"]\s*\)/);
    });
  });

  describe('fetchHistorySummary consumes the helper', () => {
    it('routes both its count and latest queries through applyReadyEntryFilters', () => {
      const source = read(SNAPSHOT_INDEX_PATH);
      const body = extractFunctionBody(
        source,
        /async\s+function\s+fetchHistorySummary\s*\(/,
      );

      const helperHits = body.match(/applyReadyEntryFilters/g) ?? [];
      expect(helperHits.length).toBeGreaterThanOrEqual(2);
      expect(body).toMatch(/\.from\(\s*['"]coach_entries['"]\s*\)/);
    });
  });

  describe('no other coach_entries read leaks past the filter', () => {
    it('every `from(\'coach_entries\')` in the file is paired with the deleted_at guard (directly or via the helper)', () => {
      const source = read(SNAPSHOT_INDEX_PATH);

      // Split the source into logical "query expression" windows around each
      // `from('coach_entries')` call. We then check that within a reasonable
      // window of each call, either `.is('deleted_at', null)` or
      // `applyReadyEntryFilters(` appears. The window is large enough to span
      // the longest legitimate chain in the file (~10 method calls) but small
      // enough that we would notice a new bare query slipping in.
      const fromCallRegex = /\.from\(\s*['"]coach_entries['"]\s*\)/g;
      const matches: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = fromCallRegex.exec(source)) !== null) {
        matches.push(m.index);
      }
      expect(matches.length).toBeGreaterThan(0);

      for (const idx of matches) {
        // Look backwards 400 chars (where applyReadyEntryFilters wraps the
        // query expression) and forwards 1500 chars (where an inline .is
        // chain can land after multiple .eq/.order/.limit calls).
        const before = source.slice(Math.max(0, idx - 400), idx);
        const after = source.slice(idx, idx + 1500);
        const window = before + after;

        const hasInlineFilter = /\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)/.test(
          window,
        );
        const wrappedByHelper = /applyReadyEntryFilters\s*\(/.test(window);

        if (!hasInlineFilter && !wrappedByHelper) {
          throw new Error(
            `coach-screen-snapshot/index.ts has a coach_entries query near offset ${idx} that is neither wrapped by applyReadyEntryFilters nor guarded by .is('deleted_at', null) inline. Add the filter or wrap the query in the helper.`,
          );
        }
      }
    });
  });
});
