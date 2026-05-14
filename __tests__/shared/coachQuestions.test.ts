import {
  buildDefaultCoachQuestionSelection,
  COACH_QUESTION_DEFINITIONS,
  COACH_QUESTION_LOCALES,
  COACH_WORKFLOW_ROUTES,
  getCoachWorkflowRouteForIntentKey,
  getDefaultCoachWorkflowRoute,
  normalizeCoachQuestionKey,
  rankCoachQuestionsForPromptType,
  resolveCoachWorkflowRoute,
  resolveCoachQuestionHints,
} from '@/shared/coachQuestions';
import { COACH_PROMPT_TYPES } from '@/shared/coachPromptTypes';

describe('coach question catalog', () => {
  it('contains the expected 49 preset questions', () => {
    expect(COACH_QUESTION_DEFINITIONS).toHaveLength(49);
  });

  it('keeps the expected coverage per mode', () => {
    const countsByPromptType = COACH_QUESTION_DEFINITIONS.reduce<
      Record<string, number>
    >((acc, question) => {
      acc[question.promptType] = (acc[question.promptType] ?? 0) + 1;
      return acc;
    }, {});

    expect(countsByPromptType).toEqual({
      latest_scan: 4,
      weekly_plan: 4,
      nutrition_focus: 5,
      body_focus: 5,
      face_focus: 5,
      hydration_focus: 5,
      sleep_coach: 5,
      risk_watch: 5,
      trend_review: 6,
      recovery_plan: 5,
    });
  });

  it('uses unique stable keys', () => {
    const keys = COACH_QUESTION_DEFINITIONS.map((question) => question.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('attaches every question to a supported prompt type', () => {
    const supportedPromptTypes = new Set(COACH_PROMPT_TYPES);

    for (const question of COACH_QUESTION_DEFINITIONS) {
      expect(supportedPromptTypes.has(question.promptType)).toBe(true);
    }
  });

  it('provides localized text for every supported locale', () => {
    for (const question of COACH_QUESTION_DEFINITIONS) {
      for (const locale of COACH_QUESTION_LOCALES) {
        expect(question.translations[locale]).toEqual(expect.any(String));
        expect(question.translations[locale].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('attaches complete intent metadata to every question', () => {
    for (const question of COACH_QUESTION_DEFINITIONS) {
      expect(question.intent_key).toEqual(expect.any(String));
      expect(question.time_scope).toEqual(expect.any(String));
      expect(question.preferred_artifacts.length).toBeGreaterThan(0);
      expect(Array.isArray(question.ui_tags)).toBe(true);
    }
  });

  it('maps every question intent to one of the 19 workflow routes', () => {
    const supportedRoutes = new Set(COACH_WORKFLOW_ROUTES);

    for (const question of COACH_QUESTION_DEFINITIONS) {
      const routeFromIntent = getCoachWorkflowRouteForIntentKey(
        question.intent_key,
      );
      const routeFromResolver = resolveCoachWorkflowRoute({
        promptType: question.promptType,
        questionKey: question.key,
        locale: 'fr',
      });

      expect(supportedRoutes.has(routeFromIntent)).toBe(true);
      expect(routeFromResolver).toBe(routeFromIntent);
    }
  });

  it('ranks nutrition presets differently across the day', () => {
    expect(
      buildDefaultCoachQuestionSelection('nutrition_focus', 'fr', {
        timeOfDay: 'morning',
      }).questionKey,
    ).toBe('nutrition_focus__breakfast_no_crash');
    expect(
      buildDefaultCoachQuestionSelection('nutrition_focus', 'fr', {
        timeOfDay: 'midday',
      }).questionKey,
    ).toBe('nutrition_focus__simple_lunch_balance');
    expect(
      buildDefaultCoachQuestionSelection('nutrition_focus', 'fr', {
        timeOfDay: 'evening',
      }).questionKey,
    ).toBe('nutrition_focus__light_recovery_dinner');
  });

  it('prioritizes the calm tracking preset when super-scan context is present', () => {
    const rankedQuestions = rankCoachQuestionsForPromptType('risk_watch', {
      primaryScanType: 'super',
      hasSuperScan: true,
      historyDepth: 6,
    });

    expect(rankedQuestions[0]?.key).toBe('risk_watch__calm_signals_week');
  });

  it('keeps stable defaults when no ranking context is provided', () => {
    expect(buildDefaultCoachQuestionSelection('body_focus', 'fr').questionKey).toBe(
      'body_focus__weekly_mini_plan',
    );
    expect(buildDefaultCoachQuestionSelection('hydration_focus', 'fr').questionKey).toBe(
      'hydration_focus__easy_daily_hydration',
    );
    expect(buildDefaultCoachQuestionSelection('risk_watch', 'fr').questionKey).toBe(
      'risk_watch__calm_signals_week',
    );
    expect(buildDefaultCoachQuestionSelection('trend_review', 'fr').questionKey).toBe(
      'trend_review__week_progress_review',
    );
    expect(buildDefaultCoachQuestionSelection('recovery_plan', 'fr').questionKey).toBe(
      'recovery_plan__reset_after_bad_week',
    );
    expect(getDefaultCoachWorkflowRoute('nutrition_focus')).toBe(
      'nutrition_meal',
    );
    expect(getDefaultCoachWorkflowRoute('risk_watch')).toBe('risk_watch_calm');
    expect(getDefaultCoachWorkflowRoute('trend_review')).toBe(
      'trend_review_summary',
    );
    expect(getDefaultCoachWorkflowRoute('recovery_plan')).toBe(
      'recovery_reset_48h',
    );
  });

  it('classifies free text into intent-aware question hints across route-specific modes', () => {
    expect(
      resolveCoachQuestionHints({
        promptType: 'latest_scan',
        questionText: 'Si j ai seulement 10 min maintenant, quoi faire ?',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'latest_scan_ten_minute_reset',
        preferred_artifacts: expect.arrayContaining(['micro_routine']),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'weekly_plan',
        questionText: 'Organise mes repas et mes workouts sans vider mon energie.',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'weekly_plan_energy_balance',
        preferred_artifacts: expect.arrayContaining([
          'daily_schedule',
          'meal_template',
        ]),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'nutrition_focus',
        questionText: 'Fais-moi une liste de courses simple pour 3 jours.',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'nutrition_shopping_list',
        preferred_artifacts: expect.arrayContaining([
          'shopping_list',
          'quick_recipe',
        ]),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'body_focus',
        questionText: 'J ai peu d energie, donne-moi une courte seance.',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'body_low_energy_session',
        preferred_artifacts: expect.arrayContaining(['micro_routine']),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'hydration_focus',
        questionText: 'Comment me rehydrater ce soir sans faire n importe quoi ?',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'hydration_evening_recovery',
        preferred_artifacts: expect.arrayContaining(['action_steps']),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'sleep_coach',
        questionText: 'Que couper des cet apres-midi pour proteger mon sommeil ?',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'sleep_afternoon_cutoff',
        preferred_artifacts: expect.arrayContaining(['warnings']),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'risk_watch',
        questionText: 'Comment noter proprement mes signaux cette semaine ?',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'risk_watch_logging',
        preferred_artifacts: expect.arrayContaining(['signal_watch']),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'trend_review',
        questionText:
          "Dis-moi ce qui s'ameliore, ce qui bloque et quoi continuer cette semaine.",
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'trend_week_review',
        preferred_artifacts: expect.arrayContaining(['context_notes']),
      }),
    );

    expect(
      resolveCoachQuestionHints({
        promptType: 'recovery_plan',
        questionText: 'Comment organiser mes prochaines 48h pour retrouver un rythme propre ?',
        locale: 'fr',
      }),
    ).toEqual(
      expect.objectContaining({
        intent_key: 'recovery_two_day_rhythm',
        preferred_artifacts: expect.arrayContaining(['daily_schedule']),
      }),
    );
  });

  it('normalizes legacy trend question aliases back to canonical keys', () => {
    expect(
      normalizeCoachQuestionKey('trend_comparison__what_is_improving'),
    ).toBe('trend_review__what_is_improving');
    expect(
      normalizeCoachQuestionKey('trend_comparison__week_progress_review'),
    ).toBe('trend_review__week_progress_review');
  });
});
