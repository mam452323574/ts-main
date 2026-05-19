// S-08 — Tests pour le seuil auto-hide hardcode et la validation defensive
// de shouldAutoHideForReports.

import {
  SOCIAL_AUTO_HIDE_THRESHOLD,
  shouldAutoHideForReports,
} from './phase2Moderation.ts';

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test('S-08: SOCIAL_AUTO_HIDE_THRESHOLD is 3', () => {
  assertEquals(SOCIAL_AUTO_HIDE_THRESHOLD, 3, 'Threshold should be hardcoded to 3');
});

Deno.test('S-08: shouldAutoHideForReports has a single argument (no exposed threshold)', () => {
  // Regression test : si quelqu'un re-introduit un parametre threshold,
  // shouldAutoHideForReports.length sera > 1 et ce test echoue.
  assertEquals(
    shouldAutoHideForReports.length,
    1,
    'shouldAutoHideForReports should expose only the count parameter, not a tunable threshold',
  );
});

Deno.test('S-08: returns false below threshold', () => {
  assertEquals(shouldAutoHideForReports(0), false, '0 reports → not auto-hidden');
  assertEquals(shouldAutoHideForReports(1), false, '1 report → not auto-hidden');
  assertEquals(shouldAutoHideForReports(2), false, '2 reports → not auto-hidden');
});

Deno.test('S-08: returns true at or above threshold', () => {
  assertEquals(shouldAutoHideForReports(3), true, '3 reports → auto-hidden');
  assertEquals(shouldAutoHideForReports(10), true, '10 reports → auto-hidden');
  assertEquals(shouldAutoHideForReports(1000), true, '1000 reports → auto-hidden');
});

Deno.test('S-08: defensive: rejects negative count', () => {
  assertEquals(shouldAutoHideForReports(-1), false, 'Negative count should not auto-hide');
  assertEquals(shouldAutoHideForReports(-1000), false, 'Large negative should not auto-hide');
});

Deno.test('S-08: defensive: rejects non-finite count', () => {
  // Number.isFinite filtre NaN, +Infinity, -Infinity ; on retombe sur false
  // dans ces cas-la (defaut safe).
  assertEquals(shouldAutoHideForReports(NaN), false, 'NaN should not auto-hide');
  assertEquals(shouldAutoHideForReports(Infinity), false, '+Infinity should not auto-hide (suspect input)');
  assertEquals(shouldAutoHideForReports(-Infinity), false, '-Infinity should not auto-hide');
});
