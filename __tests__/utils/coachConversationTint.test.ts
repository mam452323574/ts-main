import { getCoachConversationTint } from '@/utils/coachConversationTint';

const BASE_TINT = '#72AFA8'; // patient_calm haloTint (Mira).

describe('getCoachConversationTint', () => {
  it('is deterministic for a given conversation id and base tint', () => {
    const first = getCoachConversationTint('conv-abc-123', BASE_TINT);
    const second = getCoachConversationTint('conv-abc-123', BASE_TINT);
    expect(first).toBe(second);
  });

  it('produces different colours for different conversation ids', () => {
    const tintA = getCoachConversationTint('conv-aaa', BASE_TINT);
    const tintB = getCoachConversationTint('conv-bbb', BASE_TINT);
    expect(tintA).not.toBe(tintB);
  });

  it('returns the base tint unchanged when the input is not a hex string', () => {
    expect(getCoachConversationTint('conv-x', 'not-a-color')).toBe('not-a-color');
  });

  it('keeps results inside the #rrggbb format', () => {
    const tint = getCoachConversationTint('conv-format-check', BASE_TINT);
    expect(tint).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('preserves the base hue for the zero-offset bucket', () => {
    // The first slot of HUE_OFFSETS is 0 — find an id whose hash lands on it
    // by trying a few until one yields the base colour unchanged. This guards
    // against silently breaking the "identity" rotation that keeps the coach
    // recognisable for one out of every N conversations.
    let matched = false;
    for (let i = 0; i < 96; i += 1) {
      if (getCoachConversationTint(`probe-${i}`, BASE_TINT).toLowerCase() === BASE_TINT.toLowerCase()) {
        matched = true;
        break;
      }
    }
    expect(matched).toBe(true);
  });

  it('accentuates saturation for non-identity buckets', () => {
    // strict_tough's haloTint is a muted slate (~14% saturation). Once the
    // hue is rotated, the helper must bump saturation past the floor so the
    // resulting halo still pops on the inbox row instead of staying nearly
    // grey. Scan a few ids until one lands on a non-zero offset and verify
    // the returned colour is noticeably more saturated than the input.
    const mutedBase = '#8792A7'; // strict_tough
    for (let i = 0; i < 96; i += 1) {
      const tint = getCoachConversationTint(`accent-probe-${i}`, mutedBase);
      if (tint.toLowerCase() !== mutedBase.toLowerCase()) {
        expect(hexSaturation(tint)).toBeGreaterThan(hexSaturation(mutedBase) + 0.2);
        return;
      }
    }
    throw new Error('expected at least one non-identity bucket among 96 probes');
  });
});

function hexSaturation(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 0;
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}
