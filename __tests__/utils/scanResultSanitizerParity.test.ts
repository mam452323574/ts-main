// P0 parity test (audit final 2026-05-27).
//
// The scan-result sanitizer is mirrored across two files: the client-side mirror
// in `utils/scanResultSanitizer.ts` (consumed by `services/api.ts`) and the
// authoritative server-side gate in
// `supabase/functions/_shared/scanResultSanitizer.ts` (consumed by the
// Edge Function that returns scan results).
//
// Any divergence between the two — a new field locked on the server but not on
// the client, or vice-versa — leaks premium content to free accounts (or hides
// fields that should be open). This file locks that contract in CI so the next
// drift fails loudly instead of silently.
//
// The server module is pure TypeScript (no `npm:` Deno imports), which lets us
// import it directly in Jest like any other shared module — see the existing
// `__tests__/supabase/scanResultSanitizer.test.ts` for precedent.

import {
  PREMIUM_LOCKED_FIELDS,
  PREMIUM_LOCKED_SUPER_SCAN_FIELDS,
} from '@/constants/premiumFields';
import {
  sanitizeScanAnalysisResultForTier as sanitizeClient,
} from '@/utils/scanResultSanitizer';
import {
  PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE,
  sanitizeScanAnalysisResultForTier as sanitizeServer,
} from '@/supabase/functions/_shared/scanResultSanitizer';

const FREE_OPEN_NUMERIC_FACE = [
  'fatigue_level',
  'skin_clarity_score',
  'skin_evenness_score',
  'under_eye_shadow_score',
] as const;

const FREE_OPEN_NUMERIC_BODY = ['recovery_readiness_score'] as const;
const FREE_OPEN_NUMERIC_NUTRITION = ['meal_balance_score'] as const;

function toSet(list: readonly string[]): Set<string> {
  return new Set(list);
}

describe('scan result sanitizer parity (client ↔ server)', () => {
  describe('locked field lists are strictly identical', () => {
    it('face: client PREMIUM_LOCKED_FIELDS.face === server PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.face', () => {
      const clientSet = toSet(PREMIUM_LOCKED_FIELDS.face);
      const serverSet = toSet(PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.face);

      expect(clientSet).toEqual(serverSet);
      expect(clientSet.size).toBe(PREMIUM_LOCKED_FIELDS.face.length);
      expect(serverSet.size).toBe(
        PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.face.length,
      );
    });

    it('body: client PREMIUM_LOCKED_FIELDS.body === server PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.body', () => {
      const clientSet = toSet(PREMIUM_LOCKED_FIELDS.body);
      const serverSet = toSet(PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.body);

      expect(clientSet).toEqual(serverSet);
      expect(clientSet.size).toBe(PREMIUM_LOCKED_FIELDS.body.length);
      expect(serverSet.size).toBe(
        PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.body.length,
      );
    });

    it('nutrition: client PREMIUM_LOCKED_FIELDS.nutrition === server PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.nutrition', () => {
      const clientSet = toSet(PREMIUM_LOCKED_FIELDS.nutrition);
      const serverSet = toSet(PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.nutrition);

      expect(clientSet).toEqual(serverSet);
      expect(clientSet.size).toBe(PREMIUM_LOCKED_FIELDS.nutrition.length);
      expect(serverSet.size).toBe(
        PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.nutrition.length,
      );
    });

    it('super: client PREMIUM_LOCKED_SUPER_SCAN_FIELDS === server PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.super', () => {
      const clientSet = toSet(PREMIUM_LOCKED_SUPER_SCAN_FIELDS);
      const serverSet = toSet(PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.super);

      expect(clientSet).toEqual(serverSet);
      expect(clientSet.size).toBe(PREMIUM_LOCKED_SUPER_SCAN_FIELDS.length);
      expect(serverSet.size).toBe(
        PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.super.length,
      );
    });

    it('does not leak free-open numeric metrics into any locked list (face)', () => {
      const allFaceLocked = new Set<string>([
        ...PREMIUM_LOCKED_FIELDS.face,
        ...PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.face,
      ]);
      for (const key of FREE_OPEN_NUMERIC_FACE) {
        expect(allFaceLocked.has(key)).toBe(false);
      }
    });

    it('does not leak free-open numeric metrics into any locked list (body)', () => {
      const allBodyLocked = new Set<string>([
        ...PREMIUM_LOCKED_FIELDS.body,
        ...PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.body,
      ]);
      for (const key of FREE_OPEN_NUMERIC_BODY) {
        expect(allBodyLocked.has(key)).toBe(false);
      }
    });

    it('does not leak free-open numeric metrics into any locked list (nutrition)', () => {
      const allNutritionLocked = new Set<string>([
        ...PREMIUM_LOCKED_FIELDS.nutrition,
        ...PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE.nutrition,
      ]);
      for (const key of FREE_OPEN_NUMERIC_NUTRITION) {
        expect(allNutritionLocked.has(key)).toBe(false);
      }
    });
  });

  describe('client and server sanitizers behave identically on canonical free payloads', () => {
    it('strips the same premium-locked fields from a full face payload', () => {
      const payload = {
        scan_type: 'face',
        face_score: 82,
        // open in free (2026-05-27 rééquilibrage)
        fatigue_level: 28,
        skin_clarity_score: 74,
        skin_evenness_score: 71,
        under_eye_shadow_score: 62,
        hydration_level: 68,
        skin_radiance_score: 70,
        symmetry_percentage: 88,
        // locked in free
        photogenic_score: 86,
        skin_quality_score: 80,
        energy_score: 73,
        collagen_level: 64,
        under_eye_volume_score: 55,
        eye_openness_score: 71,
        complexion_redness_score: 22,
        pore_visibility_score: 19,
        lip_dryness_score: 12,
        forehead_smoothness_score: 73,
        t_zone_oiliness_score: 24,
        perceived_stress_level: 30,
        perceived_sleep_quality: 'fair',
      };

      const clientResult = sanitizeClient(payload, 'free');
      const serverResult = sanitizeServer(payload, 'free');

      expect(clientResult).toEqual(serverResult);
      expect(clientResult).toEqual({
        scan_type: 'face',
        face_score: 82,
        fatigue_level: 28,
        skin_clarity_score: 74,
        skin_evenness_score: 71,
        under_eye_shadow_score: 62,
        hydration_level: 68,
        skin_radiance_score: 70,
        symmetry_percentage: 88,
      });
    });

    it('strips the same premium-locked fields from a full body payload', () => {
      const payload = {
        scan_type: 'body',
        body_score: 77,
        // open in free
        posture_score: 78,
        recovery_readiness_score: 68,
        // locked in free
        strength_index: 64,
        metabolic_age: 31,
        body_fat_percentage: 17,
        body_symmetry: 0.91,
        muscle_definition_score: 72,
        midsection_definition_score: 68,
        shoulder_alignment_score: 81,
        upper_body_definition_score: 70,
        lower_body_definition_score: 65,
        arm_definition_score: 69,
        v_taper_score: 0.42,
        body_tension_indicator_score: 28,
      };

      const clientResult = sanitizeClient(payload, 'free');
      const serverResult = sanitizeServer(payload, 'free');

      expect(clientResult).toEqual(serverResult);
      expect(clientResult).toEqual({
        scan_type: 'body',
        body_score: 77,
        posture_score: 78,
        recovery_readiness_score: 68,
      });
    });

    it('strips the same premium-locked fields from a full nutrition payload', () => {
      const payload = {
        scan_type: 'nutrition',
        plate_health_score: 71,
        // open in free
        meal_balance_score: 71,
        protein_grams: 24,
        carbs_grams: 48,
        fat_grams: 17,
        // locked in free
        satiety_index: 72,
        glycemic_index_label: 'medium',
        glycemic_index_key: 'gi_med',
        main_vitamins: ['B12', 'C'],
        main_vitamin_keys: ['b12', 'c'],
        micronutrients: { iron: 4 },
        nutrition_points: 28,
        recommendations: ['add fibers'],
        dietary_details: { allergens: [] },
        plate_analysis: { ratio: 0.5 },
        estimated_composition: { protein: 24 },
        fiber_grams_estimate: 9,
        sugar_grams_estimate: 14,
        processing_level_score: 35,
        hydration_contribution_score: 41,
        sodium_level_score: 28,
        inflammation_index_score: 18,
        color_diversity_score: 64,
        vegetable_portion_ratio: 0.42,
        protein_visibility_score: 71,
        whole_grain_indicator_score: 12,
        meal_freshness_score: 78,
      };

      const clientResult = sanitizeClient(payload, 'free');
      const serverResult = sanitizeServer(payload, 'free');

      expect(clientResult).toEqual(serverResult);
      expect(clientResult).toEqual({
        scan_type: 'nutrition',
        plate_health_score: 71,
        meal_balance_score: 71,
        protein_grams: 24,
        carbs_grams: 48,
        fat_grams: 17,
      });
    });

    it('strips the same premium-locked fields from a full super payload', () => {
      const payload = {
        scan_type: 'super',
        global_risk_score: 18,
        // locked in free
        condition_probability: 0.12,
        condition_explanation: 'localized advice',
        condition_advice: 'see a clinician',
        fat_distribution_primary_metrics: { waist_hip: 0.86 },
        fat_distribution_priority_zones: ['midsection'],
        fat_distribution_area_details: { midsection: 0.5 },
      };

      const clientResult = sanitizeClient(payload, 'free');
      const serverResult = sanitizeServer(payload, 'free');

      expect(clientResult).toEqual(serverResult);
      expect(clientResult).toEqual({
        scan_type: 'super',
        global_risk_score: 18,
      });
    });

    it('preserves every free-open numeric metric (face) on both sides', () => {
      const payload: Record<string, unknown> = { scan_type: 'face' };
      for (const key of FREE_OPEN_NUMERIC_FACE) {
        payload[key] = 70;
      }

      const clientResult = sanitizeClient(payload, 'free') as Record<
        string,
        unknown
      >;
      const serverResult = sanitizeServer(payload, 'free') as Record<
        string,
        unknown
      >;

      for (const key of FREE_OPEN_NUMERIC_FACE) {
        expect(clientResult[key]).toBe(70);
        expect(serverResult[key]).toBe(70);
      }
    });

    it('preserves recovery_readiness_score (body) on both sides', () => {
      const payload = { scan_type: 'body', recovery_readiness_score: 65 };

      expect(
        (sanitizeClient(payload, 'free') as Record<string, unknown>)
          .recovery_readiness_score,
      ).toBe(65);
      expect(
        (sanitizeServer(payload, 'free') as Record<string, unknown>)
          .recovery_readiness_score,
      ).toBe(65);
    });

    it('preserves meal_balance_score (nutrition) on both sides', () => {
      const payload = { scan_type: 'nutrition', meal_balance_score: 71 };

      expect(
        (sanitizeClient(payload, 'free') as Record<string, unknown>)
          .meal_balance_score,
      ).toBe(71);
      expect(
        (sanitizeServer(payload, 'free') as Record<string, unknown>)
          .meal_balance_score,
      ).toBe(71);
    });
  });

  describe('premium and admin tiers are passed through unchanged on both sides', () => {
    const payload = {
      scan_type: 'face',
      face_score: 82,
      photogenic_score: 86,
      skin_quality_score: 80,
    };

    it.each(['premium', 'admin'] as const)(
      'returns the input unchanged for %s tier (client and server agree on reference identity)',
      (tier) => {
        const clientResult = sanitizeClient(payload, tier);
        const serverResult = sanitizeServer(payload, tier);

        expect(clientResult).toBe(payload);
        expect(serverResult).toBe(payload);
      },
    );
  });

  describe('legacy face health scan_type ("health") is gated identically', () => {
    it('strips the same fields when scan_type is "health" instead of "face"', () => {
      const payload = {
        scan_type: 'health',
        face_score: 82,
        fatigue_level: 28,
        photogenic_score: 86,
      };

      const clientResult = sanitizeClient(payload, 'free');
      const serverResult = sanitizeServer(payload, 'free');

      expect(clientResult).toEqual(serverResult);
      expect(clientResult).toEqual({
        scan_type: 'health',
        face_score: 82,
        fatigue_level: 28,
      });
    });
  });
});
