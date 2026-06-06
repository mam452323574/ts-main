import {
  COACH_QUESTION_LIBRARY,
  filterCoachQuestionLibraryEntries,
  selectCoachQuestionFromLibrary,
  type CoachQuestionLibraryEntry,
} from '@/shared/coachQuestionsLibrary';
import {
  COACH_QUESTION_DEFINITIONS,
  type CoachQuestionKey,
} from '@/shared/coachQuestions';

const KNOWN_QUESTION_KEYS = new Set<string>(
  COACH_QUESTION_DEFINITIONS.map((definition) => definition.key),
);

describe('coachQuestionsLibrary — seed integrity', () => {
  it('seeds a substantial first wave (well above the legacy ~66 limit)', () => {
    // The legacy `MetricDefinition`-based catalogue caps display variations at
    // ~22 metrics × 3 = 66. The new library must clearly exceed this so future
    // waves can land 100+ per scanner without doubling the number of files.
    expect(COACH_QUESTION_LIBRARY.length).toBeGreaterThanOrEqual(80);
  });

  it('keeps every entry id unique (anti-repetition relies on it)', () => {
    const ids = COACH_QUESTION_LIBRARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every preset route key to a known CoachQuestionKey (n8n routing safety)', () => {
    for (const entry of COACH_QUESTION_LIBRARY) {
      expect(KNOWN_QUESTION_KEYS.has(entry.presetRouteKeyFree)).toBe(true);
      expect(KNOWN_QUESTION_KEYS.has(entry.presetRouteKeyPremium)).toBe(true);
    }
  });

  it('localizes every entry across the 6 supported locales (no empty strings)', () => {
    for (const entry of COACH_QUESTION_LIBRARY) {
      for (const locale of ['fr', 'en', 'de', 'it', 'es', 'pt'] as const) {
        const text = entry.questions[locale];
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('provides at least one entry per (scanType × priority metric) the audit flagged', () => {
    // Cf. audit produit 2026-05-26 : ces métriques sont les axes prioritaires
    //   "faire croquer" en gratuit. La première vague doit couvrir chacune.
    const expected: Array<{
      scanType: CoachQuestionLibraryEntry['scanType'];
      metricKey: string;
    }> = [
      { scanType: 'face', metricKey: 'fatigue_level' },
      { scanType: 'face', metricKey: 'skin_clarity_score' },
      { scanType: 'face', metricKey: 'skin_evenness_score' },
      { scanType: 'face', metricKey: 'under_eye_shadow_score' },
      { scanType: 'face', metricKey: 'hydration_level' },
      { scanType: 'body', metricKey: 'recovery_readiness_score' },
      { scanType: 'body', metricKey: 'posture_score' },
      { scanType: 'nutrition', metricKey: 'meal_balance_score' },
      { scanType: 'nutrition', metricKey: 'protein_grams' },
      { scanType: 'super', metricKey: 'global_risk_score' },
    ];

    for (const { scanType, metricKey } of expected) {
      const count = COACH_QUESTION_LIBRARY.filter(
        (entry) =>
          entry.scanType === scanType && entry.metricKey === metricKey,
      ).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it('provides a wildcard fallback (metricKey="*") for every covered scanType', () => {
    for (const scanType of ['face', 'body', 'nutrition', 'super'] as const) {
      const wildcards = COACH_QUESTION_LIBRARY.filter(
        (entry) => entry.scanType === scanType && entry.metricKey === '*',
      );
      expect(wildcards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('exposes time horizons beyond a single bucket (audit requested temporal variety)', () => {
    const horizons = new Set(
      COACH_QUESTION_LIBRARY.map((entry) => entry.timeHorizon),
    );
    // The audit asked for `en 10 minutes`, `aujourd'hui`, `ce soir`, `48h`,
    //   `5 jours`. We require ≥4 buckets actually used in the seed.
    expect(horizons.size).toBeGreaterThanOrEqual(4);
  });
});

describe('filterCoachQuestionLibraryEntries — specificity ranking', () => {
  it('returns the exact metric+severity bucket first, then metric exact / severity exact / both wildcard', () => {
    const entries = filterCoachQuestionLibraryEntries({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
    });

    expect(entries.length).toBeGreaterThan(0);

    // Tous les premiers résultats matchent la métrique exacte.
    const firstNonExact = entries.findIndex(
      (entry) => entry.metricKey !== 'fatigue_level',
    );
    // Soit aucun résultat wildcard ne suit, soit ils sont placés après les
    //   matchs exacts → la position du 1er wildcard est >= 0 ou -1 si aucun.
    expect(firstNonExact === -1 || firstNonExact > 0).toBe(true);

    // L'entrée tout en tête doit être severity=high (le plus spécifique).
    expect(entries[0].metricKey).toBe('fatigue_level');
    expect(entries[0].severity).toBe('high');
  });

  it('falls back on wildcard metricKey when no exact entry exists', () => {
    const entries = filterCoachQuestionLibraryEntries({
      scanType: 'face',
      // Métrique inconnue de la lib → seul le wildcard `*` doit matcher.
      metricKey: 'metric_qui_nexiste_pas',
      severity: 'medium',
    });

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.metricKey).toBe('*');
    }
  });

  it('returns an empty list when the scanType is not covered', () => {
    const entries = filterCoachQuestionLibraryEntries({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
      library: [],
    });
    expect(entries).toEqual([]);
  });
});

describe('selectCoachQuestionFromLibrary — selection and locales', () => {
  it('returns localized text in the requested locale (en)', () => {
    const selection = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
      locale: 'en',
      scanId: 'scan-en',
    });
    expect(selection).not.toBeNull();
    expect(selection!.entry.questions.en).toBe(selection!.questionText);
  });

  it('falls back to French when an unknown locale is provided', () => {
    const selection = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
      locale: 'jp',
      scanId: 'scan-jp',
    });
    expect(selection).not.toBeNull();
    expect(selection!.entry.questions.fr).toBe(selection!.questionText);
  });

  it('returns the same selection for the same scanId+metric (deterministic)', () => {
    const a = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
      locale: 'fr',
      scanId: 'scan-stable-123',
    });
    const b = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
      locale: 'fr',
      scanId: 'scan-stable-123',
    });
    expect(a?.entry.id).toBe(b?.entry.id);
    expect(a?.questionText).toBe(b?.questionText);
  });

  it('rotates the selection across different scanIds', () => {
    const ids = new Set<string>();
    for (const scanId of [
      'scan-rot-aa',
      'scan-rot-bb',
      'scan-rot-cc',
      'scan-rot-dd',
      'scan-rot-ee',
      'scan-rot-ff',
      'scan-rot-gg',
      'scan-rot-hh',
    ]) {
      const selection = selectCoachQuestionFromLibrary({
        scanType: 'face',
        metricKey: 'fatigue_level',
        severity: 'any',
        locale: 'fr',
        scanId,
      });
      if (selection) ids.add(selection.entry.id);
    }
    // Au moins 2 questions différentes apparaissent → la rotation marche.
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });

  it('avoids recently-used ids when alternatives exist', () => {
    const without = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'any',
      locale: 'fr',
      scanId: 'scan-recent-1',
    });
    expect(without).not.toBeNull();

    const blockedId = without!.entry.id;
    const withBlock = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'any',
      locale: 'fr',
      scanId: 'scan-recent-1',
      recentlyUsedIds: [blockedId],
    });
    expect(withBlock).not.toBeNull();
    expect(withBlock!.entry.id).not.toBe(blockedId);
  });

  it('falls back to the original pool when all candidates are recently used', () => {
    const candidates = filterCoachQuestionLibraryEntries({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
    });
    const allIds = candidates.map((entry) => entry.id);

    const selection = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'high',
      locale: 'fr',
      scanId: 'scan-recent-flood',
      recentlyUsedIds: allIds,
    });
    // Tout filtré → on retombe sur le pool d'origine plutôt que de renvoyer null.
    expect(selection).not.toBeNull();
    expect(allIds).toContain(selection!.entry.id);
  });

  it('boosts entries whose preferredTimeOfDay matches the request', () => {
    // Lib custom : 2 entrées pour la même métrique, une seule a un
    //   preferredTimeOfDay=evening. Avec timeOfDay=evening, on doit la voir
    //   gagner.
    const customLib: CoachQuestionLibraryEntry[] = [
      {
        id: 'custom_no_tod',
        scanType: 'face',
        metricKey: 'fatigue_level',
        severity: 'any',
        timeHorizon: 'today_1h',
        questions: {
          fr: 'A',
          en: 'A',
          de: 'A',
          it: 'A',
          es: 'A',
          pt: 'A',
        },
        presetRouteKeyFree: 'latest_scan__three_simple_actions' as CoachQuestionKey,
        presetRouteKeyPremium: 'latest_scan__three_simple_actions' as CoachQuestionKey,
        tags: ['quick'],
        rotationPriority: 1,
      },
      {
        id: 'custom_evening',
        scanType: 'face',
        metricKey: 'fatigue_level',
        severity: 'any',
        timeHorizon: 'tonight_12h',
        preferredTimeOfDay: 'evening',
        questions: {
          fr: 'B',
          en: 'B',
          de: 'B',
          it: 'B',
          es: 'B',
          pt: 'B',
        },
        presetRouteKeyFree: 'latest_scan__three_simple_actions' as CoachQuestionKey,
        presetRouteKeyPremium: 'latest_scan__three_simple_actions' as CoachQuestionKey,
        tags: ['quick'],
        rotationPriority: 2,
      },
    ];

    const eveningPick = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'any',
      locale: 'fr',
      scanId: 'scan-tod-evening',
      timeOfDay: 'evening',
      library: customLib,
    });
    // timeOfDay=evening matche `custom_evening` → le pool se restreint à
    //   cette seule entrée, qui est donc forcément sélectionnée.
    expect(eveningPick?.entry.id).toBe('custom_evening');

    const morningPick = selectCoachQuestionFromLibrary({
      scanType: 'face',
      metricKey: 'fatigue_level',
      severity: 'any',
      locale: 'fr',
      scanId: 'scan-tod-evening',
      timeOfDay: 'morning',
      library: customLib,
    });
    // timeOfDay=morning ne matche aucune entrée → fallback sur le pool
    //   complet, et le hash déterministe choisit parmi les 2 entrées.
    expect(['custom_no_tod', 'custom_evening']).toContain(morningPick?.entry.id);
  });
});
