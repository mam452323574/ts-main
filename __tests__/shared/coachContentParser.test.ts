import {
  deriveCoachStructuredContentFromBody,
  deriveCoachConfidence,
  mergeCoachStructuredContentWithBodyFallback,
  parseCoachStructuredContent,
  synthesizeCoachBody,
} from '@/shared/coachContentParser';

describe('coachContentParser', () => {
  it('returns null content when input is not a record', () => {
    expect(parseCoachStructuredContent(null).content).toBeNull();
    expect(parseCoachStructuredContent('').content).toBeNull();
    expect(parseCoachStructuredContent([]).content).toBeNull();
  });

  it('returns null content when no section is meaningful', () => {
    const result = parseCoachStructuredContent({
      title: 'Just a title',
    });

    expect(result.content).toBeNull();
    expect(result.version).toBe(1);
  });

  it('accepts a fully formed v2 payload', () => {
    const result = parseCoachStructuredContent({
      title: 'Ton dernier bilan',
      summary: "Voici ce qui ressort de ton dernier scan visage.",
      context_notes: ['fatigue plus marquée', 'hydratation correcte'],
      priorities: ['rattraper du sommeil'],
      action_steps: ['boire un grand verre', 'dormir 30 min de plus'],
      warnings: [],
      encouragement: 'Continue comme ça, ça va le faire.',
      primary_metric_delta: {
        metric_key: 'fatigue_level',
        human_label: 'signes de fatigue',
        direction: 'up',
        magnitude: 'moderate',
        interpretation: 'negative',
      },
      data_gaps: [],
      confidence: 'medium',
    });

    expect(result.version).toBe(2);
    expect(result.content).not.toBeNull();
    expect(result.content?.context_notes).toHaveLength(2);
    expect(result.content?.primary_metric_delta?.direction).toBe('up');
    expect(result.synthesizedBody).toContain('• fatigue plus marquée');
    expect(result.synthesizedBody).toContain('✓ dormir 30 min de plus');
  });

  it('keeps nutrition artifacts from a Coach v2 webhook payload', () => {
    const result = parseCoachStructuredContent({
      title: 'Ton fuel du jour',
      summary:
        'On y va ! Voici le combo simple et efficace pour tenir 3 jours sans stress.',
      action_steps: [
        'Va au marché ce soir à 17h pour acheter ta liste starter pack.',
        'Demain midi, prépare ton bowl en 12 min chrono.',
        "Bois un grand verre d'eau avant chaque repas.",
      ],
      encouragement:
        'Tu construis ta progression, repas par repas. La série continue !',
      confidence: 'high',
      meal_template: {
        name: 'Bowl Boost Protéines',
        when: 'midi',
        prep_min: 12,
        ingredients: [
          { item: 'Poulet', portion: '150 g' },
          { item: 'Quinoa cuit', portion: '1 tasse' },
          { item: 'Avocat', portion: '1/2' },
          { item: 'Poivron rouge', portion: '1' },
          { item: 'Yaourt grec', portion: '2 càs' },
        ],
        why:
          'Protéines + bonnes graisses + glucides à IG bas = énergie durable et satiété.',
      },
      meal_swaps: [
        {
          from: 'Soda',
          to: 'Eau pétillante + citron',
          why: "Même punch, zéro sucre, plus d'hydratation.",
        },
        {
          from: 'Pain blanc',
          to: 'Quinoa',
          why: 'Index glycémique bas, tient mieux sur la durée.',
        },
      ],
      quick_recipe: {
        name: 'Bowl express',
        total_min: null,
        steps: [
          'Cuire le quinoa selon le paquet (10 min).',
          'Couper le poulet en dés et le poêler avec curcuma.',
          "Couper l'avocat et le poivron en lamelles.",
          'Dresser le bol avec yaourt grec et citron.',
        ],
      },
      habit_tracker: [
        {
          label: 'Bowl protéiné midi',
          target_days: 6,
          window: 'midi',
        },
      ],
      shopping_list: [],
      reminders: [],
      next_scan_suggestion: null,
    });

    expect(result.version).toBe(2);
    expect(result.content?.meal_template?.name).toBe('Bowl Boost Protéines');
    expect(result.content?.meal_template?.ingredients).toHaveLength(5);
    expect(result.content?.meal_swaps).toHaveLength(2);
    expect(result.content?.quick_recipe?.name).toBe('Bowl express');
    expect(result.content?.habit_tracker?.[0]).toEqual({
      label: 'Bowl protéiné midi',
      target_days: 6,
      window: 'midi',
    });
    expect(result.content?.shopping_list).toEqual([]);
    expect(result.content?.next_scan_suggestion).toBeNull();
    expect(result.synthesizedBody).toContain('Prochain repas');
    expect(result.synthesizedBody).toContain('Recette flash');
    expect(result.synthesizedBody).toContain('Habitudes à tenir');
  });

  it('truncates sections that exceed limits and filters empty items', () => {
    const result = parseCoachStructuredContent({
      title: 'A'.repeat(120),
      summary: 'S'.repeat(400),
      context_notes: Array.from({ length: 8 }).map((_, i) => `note ${i}`),
      priorities: [' ', '', null, 'real priority'],
      action_steps: null,
      warnings: [123 as unknown as string, 'real warning'],
      data_gaps: [],
      confidence: 'invalid-confidence',
    });

    expect(result.content).not.toBeNull();
    expect(result.content?.title.length).toBeLessThanOrEqual(80);
    expect(result.content?.summary.length).toBeLessThanOrEqual(280);
    expect(result.content?.context_notes).toHaveLength(3);
    expect(result.content?.priorities).toEqual(['real priority']);
    expect(result.content?.action_steps).toEqual([]);
    expect(result.content?.warnings).toEqual(['real warning']);
    expect(result.content?.confidence).toBeNull();
  });

  it('drops incomplete primary_metric_delta values', () => {
    const result = parseCoachStructuredContent({
      title: 'Title',
      summary: 'Summary',
      context_notes: ['ok'],
      primary_metric_delta: {
        metric_key: 'face_score',
        human_label: 'état général',
        direction: 'sideways',
        magnitude: 'moderate',
        interpretation: 'positive',
      },
    });

    expect(result.content?.primary_metric_delta).toBeNull();
  });

  it('uses fallback title when raw title is missing', () => {
    const result = parseCoachStructuredContent(
      {
        summary: 'Ton dernier scan montre une amélioration.',
        context_notes: ['plus en forme'],
      },
      { fallbackTitle: 'Bilan' },
    );

    expect(result.content?.title).toBe('Bilan');
  });

  it('deriveCoachConfidence respects explicit value', () => {
    expect(deriveCoachConfidence('high')).toBe('high');
    expect(deriveCoachConfidence('unknown', 5)).toBe('high');
  });

  it('deriveCoachConfidence infers from scan count', () => {
    expect(deriveCoachConfidence(null, 0)).toBeNull();
    expect(deriveCoachConfidence(null, 1)).toBe('low');
    expect(deriveCoachConfidence(null, 2)).toBe('medium');
    expect(deriveCoachConfidence(null, 4)).toBe('high');
  });

  it('derives action steps and a weekly schedule from a free-text French body', () => {
    const result = deriveCoachStructuredContentFromBody(
      [
        'Prenons un moment. Voici un cadre tranquille pour la semaine.',
        '✓ Respire 4-6 chaque matin.',
        '✓ Planifie tes repas autour de proteines et legumes.',
        '✓ Choisis un mouvement doux les jours ou tu en as besoin.',
        'Agenda de la semaine :',
        'Lundi 08:00 - Respiration 4-6 + etirements doux (10 min) 12:30 - Dejeuner equilibre (30 min) 18:00 - Marche lente (20 min)',
        'Mardi 08:00 - Respiration 4-6 12:30 - Salade composee + proteines (30 min)',
      ].join('\n'),
      { locale: 'fr' },
    );

    expect(result).not.toBeNull();
    expect(result?.summary).toBe('Prenons un moment. Voici un cadre tranquille pour la semaine.');
    expect(result?.action_steps).toEqual([
      'Respire 4-6 chaque matin.',
      'Planifie tes repas autour de proteines et legumes.',
      'Choisis un mouvement doux les jours ou tu en as besoin.',
    ]);
    expect(result?.daily_schedule).toHaveLength(2);
    expect(result?.daily_schedule?.[0]).toEqual({
      day: 'Lundi',
      slots: [
        {
          time: '08:00',
          duration_min: 10,
          action: 'Respiration 4-6 + etirements doux (10 min)',
          tag: null,
        },
        {
          time: '12:30',
          duration_min: 30,
          action: 'Dejeuner equilibre (30 min)',
          tag: null,
        },
        {
          time: '18:00',
          duration_min: 20,
          action: 'Marche lente (20 min)',
          tag: null,
        },
      ],
    });
  });

  it('derives a micro routine from a free-text body', () => {
    const result = deriveCoachStructuredContentFromBody(
      'Prenons un moment.\nRoutine - Pauses eau (toute la journee) - 3 min 1. 7h30 - verre d eau + 3 respirations 2. 11h - verre d eau en silence 3. 16h - tisane chaude 4. 19h - verre d eau en pleine conscience',
      { locale: 'fr' },
    );

    expect(result?.micro_routine).toEqual([
      {
        name: 'Pauses eau',
        when: 'toute la journee',
        total_min: 3,
        steps: [
          '7h30 - verre d eau + 3 respirations',
          '11h - verre d eau en silence',
          '16h - tisane chaude',
          '19h - verre d eau en pleine conscience',
        ],
      },
    ]);
  });

  it('stops a derived micro routine before a trailing habits section', () => {
    const result = deriveCoachStructuredContentFromBody(
      [
        'On y va doucement. 48h pour souffler, rien de plus.',
        'Routine — Reset doux 48h (J1 et J2) · 15 min 1. J1 — dîner léger ce soir 2. J1 — coucher plus tôt si tu peux 3. J2 — un verre d’eau au réveil 4. J2 — marche de 10 min dehors Habitudes a tenir : ☐ Coucher avant 23h · 3j/7 (soir) ☐ Boire 2L d’eau par jour · 3j/7 (journée) ☐ Marche 10 min par jour · 3j/7 (libre)',
      ].join('\n'),
      { locale: 'fr' },
    );

    expect(result?.micro_routine).toEqual([
      {
        name: 'Reset doux 48h',
        when: 'J1 et J2',
        total_min: 15,
        steps: [
          'J1 — dîner léger ce soir',
          'J1 — coucher plus tôt si tu peux',
          'J2 — un verre d’eau au réveil',
          'J2 — marche de 10 min dehors',
        ],
      },
    ]);
  });

  it('fills only missing fields when merging body fallback into existing structured content', () => {
    const merged = mergeCoachStructuredContentWithBodyFallback(
      {
        title: 'Plan existant',
        summary: 'Summary already present.',
        context_notes: [],
        priorities: [],
        action_steps: ['Keep the existing action step.'],
        warnings: [],
        encouragement: null,
        primary_metric_delta: null,
        data_gaps: [],
        confidence: 'high',
        daily_schedule: [
          {
            day: 'Monday',
            slots: [
              {
                time: '08:00',
                duration_min: null,
                action: 'Existing slot',
                tag: null,
              },
            ],
          },
        ],
        micro_routine: [],
        meal_template: null,
        meal_swaps: [],
        shopping_list: [],
        quick_recipe: null,
        knowledge_card: null,
        habit_tracker: [],
        reminders: [],
        next_scan_suggestion: null,
        signal_watch: [],
        streak_celebration: null,
        profile_updates: null,
      },
      [
        'Let us pause for a week.',
        '✓ Add one calm breathing break.',
        'Weekly schedule:',
        'Monday 08:00 - Calm breathing (10 min)',
        'Routine - Evening reset (soir) - 5 min 1. Stretch 2. Read 3. Breathe',
      ].join('\n'),
      {
        fallbackTitle: 'Plan existant',
        locale: 'en',
      },
    );

    expect(merged?.summary).toBe('Summary already present.');
    expect(merged?.action_steps).toEqual(['Keep the existing action step.']);
    expect(merged?.daily_schedule).toEqual([
      {
        day: 'Monday',
        slots: [
          {
            time: '08:00',
            duration_min: null,
            action: 'Existing slot',
            tag: null,
          },
        ],
      },
    ]);
    expect(merged?.micro_routine).toEqual([
      {
        name: 'Evening reset',
        when: 'soir',
        total_min: 5,
        steps: ['Stretch', 'Read', 'Breathe'],
      },
    ]);
  });

  it('synthesizeCoachBody produces a readable body', () => {
    const body = synthesizeCoachBody({
      title: 'T',
      summary: 'Phrase d’ouverture.',
      context_notes: ['note A'],
      priorities: ['priority A'],
      action_steps: ['action A'],
      warnings: [],
      encouragement: 'Tu gères.',
      primary_metric_delta: null,
      data_gaps: [],
      confidence: null,
    });

    expect(body).toContain('Phrase d’ouverture.');
    expect(body).toContain('• note A');
    expect(body).toContain('→ priority A');
    expect(body).toContain('✓ action A');
    expect(body.endsWith('Tu gères.')).toBe(true);
  });
});
