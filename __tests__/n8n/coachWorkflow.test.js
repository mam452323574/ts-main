const fs = require('fs');
const path = require('path');

const workflowPath = path.join(process.cwd(), 'n8n', 'workflows', 'coach.json');

function readWorkflow() {
  return JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
}

function getNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) {
    throw new Error(`Missing workflow node: ${name}`);
  }

  return node;
}

function runCodeNode(workflow, name, payload, upstreamJson = null) {
  const jsCode = getNode(workflow, name).parameters.jsCode;
  const executor = new Function('$json', '$', jsCode);
  const lookup = () => ({ item: { json: upstreamJson ?? {} } });
  return executor(payload, lookup);
}

function buildBodyAnalyseEnvelope(overrides = {}) {
  return {
    success: true,
    locale: 'fr',
    persona_key: 'analytical_precise',
    prompt_type: 'body_focus',
    scan_id: 'body_scan_1',
    captured_at: '2026-05-12T10:00:00.000Z',
    data: {
      schema_version: 4,
      scan_type: 'body',
      body_score: 82,
      body_fat_percentage: 22,
      posture_score: 7,
      strength_index: 76,
      body_symmetry: 74,
      muscle_definition_score: 35,
      midsection_definition_score: 32,
      shoulder_alignment_score: 65,
      recovery_readiness_score: 38,
      upper_body_definition_score: 55,
      lower_body_definition_score: 58,
      arm_definition_score: 45,
      v_taper_score: 50,
      body_tension_indicator_score: 82,
      perceived_fitness_level_key: 'moderately_active',
      ...overrides,
    },
  };
}

describe('coach n8n workflow export', () => {
  it('marks the workflow as a template that still needs a manual DeepSeek credential rebind', () => {
    const workflow = readWorkflow();
    const deepSeekNodes = workflow.nodes.filter(
      (node) => node.type === '@n8n/n8n-nodes-langchain.lmChatDeepSeek',
    );

    expect(workflow.name).toContain('rebind');
    expect(workflow.meta?.templateCredsSetupCompleted).toBe(false);
    expect(deepSeekNodes).toHaveLength(6);
    deepSeekNodes.forEach((node) => {
      expect(node.credentials?.deepSeekApi?.id).toBe(
        'REPLACE_WITH_YOUR_DEEPSEEK_CREDENTIAL_ID',
      );
      expect(node.credentials?.deepSeekApi?.name).toContain(
        'REBIND_REQUIRED',
      );
    });
  });

  it('keeps the Coach webhook contract on POST /webhook/coach', () => {
    const workflow = readWorkflow();
    const webhookNode = getNode(workflow, 'Webhook');

    expect(webhookNode.parameters).toMatchObject({
      httpMethod: 'POST',
      path: 'coach',
    });
  });

  it('adapts a raw analyse_1 body envelope into latest_scan payload context', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(
      workflow,
      'Normalize Coach Input1',
      buildBodyAnalyseEnvelope(),
    )[0].json;

    expect(result.payload.latest_scan).toMatchObject({
      scan_id: 'body_scan_1',
      scan_type: 'body',
      normalized_scan_type: 'body',
      captured_at: '2026-05-12T10:00:00.000Z',
      key_metrics: expect.objectContaining({
        scan_type: 'body',
        muscle_definition_score: 35,
        perceived_fitness_level_key: 'moderately_active',
      }),
      analysis_result_normalized: expect.objectContaining({
        scan_type: 'body',
        body_tension_indicator_score: 82,
      }),
    });
    expect(result.scan_context.primary_scan).toBe(result.payload.latest_scan);
    expect(result.scan_context.latest_by_type.body).toBe(
      result.payload.latest_scan,
    );
    expect(result.prompt_type).toBe('body_focus');
  });

  it('uses advanced body metrics as coach metric triggers', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(
      workflow,
      'Normalize Coach Input1',
      buildBodyAnalyseEnvelope(),
    )[0].json;

    expect(result.metric_triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'midsection_definition_score',
          tier: 'low',
          priority_weight: 'high',
        }),
        expect.objectContaining({
          metric: 'recovery_readiness_score',
          tier: 'low',
          priority_weight: 'high',
        }),
        expect.objectContaining({
          metric: 'body_tension_indicator_score',
          tier: 'high',
          priority_weight: 'high',
        }),
      ]),
    );
  });

  it('prioritizes the exact selected scan and exposes scan_intent in normalized context', () => {
    const workflow = readWorkflow();
    const scanIntent = {
      has_actionable_issue: true,
      priority_metric: 'posture_score',
      priority_label: 'Posture',
      severity: 'medium',
      question_text: 'Que dois-je travailler après ce scan ?',
      user_facing_summary:
        'Ta posture semble être le point le plus intéressant à améliorer après ce scan.',
    };
    const result = runCodeNode(workflow, 'Normalize Coach Input1', {
      payload: {
        prompt_type: 'latest_scan_issue_resolution',
        selected_scan_id: 'scan-body',
        scan_intent: scanIntent,
        scan_count_7d: 2,
        latest_scan: {
          scan_id: 'scan-food',
          scan_type: 'nutrition',
          metrics: { plate_health_score: 91 },
        },
        selected_scan: {
          scan_id: 'scan-body',
          scan_type: 'body',
          metrics: { posture_score: 7 },
        },
        recent_scans: [
          {
            scan_id: 'scan-food',
            scan_type: 'nutrition',
            metrics: { plate_health_score: 91 },
          },
          {
            scan_id: 'scan-body',
            scan_type: 'body',
            metrics: { posture_score: 7 },
          },
        ],
      },
    })[0].json;

    expect(result.scan_context.primary_scan.scan_id).toBe('scan-body');
    expect(result.selected_scan_id).toBe('scan-body');
    expect(result.scan_intent).toEqual(scanIntent);
    expect(result.coach_context_text).toContain('SELECTED_SCAN_ID: scan-body');
    expect(result.coach_context_text).toContain('priority_metric=posture_score');
  });

  it('treats posture_score as a 0-10 metric, not a 0-100 metric', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(
      workflow,
      'Normalize Coach Input1',
      buildBodyAnalyseEnvelope({
        body_score: 80,
        posture_score: 7,
        strength_index: null,
        body_symmetry: null,
        body_fat_percentage: null,
        muscle_definition_score: null,
        midsection_definition_score: null,
        shoulder_alignment_score: null,
        recovery_readiness_score: null,
        upper_body_definition_score: null,
        lower_body_definition_score: null,
        arm_definition_score: null,
        v_taper_score: null,
        body_tension_indicator_score: null,
      }),
    )[0].json;

    expect(result.metric_triggers).toContainEqual(
      expect.objectContaining({
        metric: 'posture_score',
        value: 7,
        tier: 'high',
        priority_weight: 'low',
      }),
    );
  });

  it('does not turn textual ingredient_quality into a metric trigger', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Normalize Coach Input1', {
      success: true,
      locale: 'fr',
      prompt_type: 'nutrition_focus',
      data: {
        schema_version: 4,
        scan_type: 'nutrition',
        plate_health_score: 82,
        satiety_index: 7,
        ingredient_quality: 'Natural',
        hydration_contribution_score: 8,
        sodium_level_score: 3,
        color_diversity_score: 8,
      },
    })[0].json;

    expect(result.metric_triggers.map((trigger) => trigger.metric)).not.toContain(
      'ingredient_quality',
    );
    expect(result.metric_triggers).toContainEqual(
      expect.objectContaining({
        metric: 'satiety_index',
        tier: 'high',
        priority_weight: 'low',
      }),
    );
  });

  it('documents face as the normalized latest_by_type key with health only as legacy compatibility', () => {
    const workflow = readWorkflow();
    const routeCode = getNode(workflow, 'Determine Coach Route').parameters.jsCode;

    expect(routeCode).toContain('scan_type = face');
    expect(routeCode).toContain('latest_by_type.face');
    expect(routeCode).toContain('anciens payloads');
    expect(routeCode).not.toMatch(/N.utilise pas latest_by_type\.face/);
  });

  it('expands the visible coach matrix to 20 routes per persona', () => {
    const workflow = readWorkflow();
    const coachNodes = workflow.nodes.filter((node) => /^Coach /.test(node.name));
    const byPersona = {};
    const byRoute = {};

    for (const node of coachNodes) {
      const match = node.name.match(/^Coach (.+) \/ (.+)$/);
      if (!match) continue;
      const [, persona, route] = match;
      byPersona[persona] = (byPersona[persona] ?? 0) + 1;
      byRoute[route] = (byRoute[route] ?? 0) + 1;
    }

    expect(coachNodes).toHaveLength(120);
    expect(byPersona).toEqual({
      Gentle: 20,
      Strict: 20,
      Motivational: 20,
      Calm: 20,
      Analytical: 20,
      Playful: 20,
    });
    expect(byRoute).toMatchObject({
      free_question: 6,
      nutrition_meal: 6,
      nutrition_swaps: 6,
      nutrition_shopping: 6,
      risk_watch_calm: 6,
      risk_watch_escalation: 6,
      risk_watch_logging: 6,
      trend_review_summary: 6,
      trend_review_blocked: 6,
      trend_review_continue: 6,
      recovery_reset_48h: 6,
      recovery_restart: 6,
    });
  });

  it('salvages inline actions and a weekly agenda from a long free-text body', () => {
    const workflow = readWorkflow();
    const longTail = Array.from({ length: 20 }, () => 'On garde ce cadre simple et repetable.')
      .join(' ');
    const result = runCodeNode(workflow, 'Code in JavaScript2', {
      locale: 'fr',
      language: 'fr',
      coach_route: 'weekly_plan',
      persona_key: 'patient_calm',
      title: 'Cadre tranquille',
      summary: 'Prenons un moment. Voici un cadre tranquille pour la semaine.',
      context_notes: [],
      priorities: [],
      action_steps: [],
      warnings: [],
      encouragement: null,
      primary_metric_delta: null,
      data_gaps: [],
      confidence: 'high',
      body: [
        'Prenons un moment. Voici un cadre tranquille pour la semaine.',
        '✓ Respire 4-6 chaque matin.',
        '✓ Planifie tes repas autour de proteines et legumes.',
        '✓ Choisis un mouvement doux les jours ou tu en as besoin.',
        'Agenda de la semaine :',
        'Lundi 08:00 - Respiration 4-6 + etirements doux (10 min) 12:30 - Dejeuner equilibre (30 min) 18:00 - Marche lente (20 min)',
        'Mardi 08:00 - Respiration 4-6 17:30 - Etirements doux (15 min)',
        longTail,
      ].join('\n'),
    })[0].json;

    expect(result.response_version).toBe(2);
    expect(result.content.action_steps).toEqual([
      'Respire 4-6 chaque matin.',
      'Planifie tes repas autour de proteines et legumes.',
      'Choisis un mouvement doux les jours ou tu en as besoin.',
    ]);
    expect(result.content.daily_schedule[0]).toEqual({
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
    expect(result.body.length).toBeGreaterThan(1200);
  });

  it('salvages a free-text routine into micro_routine content', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Code in JavaScript2', {
      locale: 'fr',
      language: 'fr',
      coach_route: 'hydration_focus',
      persona_key: 'patient_calm',
      title: 'Pauses eau',
      summary: 'Prenons un moment.',
      context_notes: [],
      priorities: [],
      action_steps: [],
      warnings: [],
      encouragement: null,
      primary_metric_delta: null,
      data_gaps: [],
      confidence: 'high',
      body: [
        'Prenons un moment.',
        'Routine - Pauses eau (toute la journee) - 3 min 1. 7h30 - verre d eau + 3 respirations 2. 11h - verre d eau en silence 3. 16h - tisane chaude 4. 19h - verre d eau en pleine conscience',
      ].join('\n'),
    })[0].json;

    expect(result.response_version).toBe(2);
    expect(result.content.micro_routine).toEqual([
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

  it('keeps specialized fallback titles for split routes in the final normalizer', () => {
    const workflow = readWorkflow();
    const payload = {
      language: 'en',
      locale: 'en',
      coach_route: 'nutrition_shopping',
      title: '',
      body: '',
      content: {},
      message: { content: '{}' },
    };
    const result = runCodeNode(
      workflow,
      'Code in JavaScript2',
      payload,
      payload,
    )[0].json;

    expect(result.title).toBe('Your nutrition focus');
    expect(result.content.title).toBe('Your nutrition focus');
  });

  it('keeps a localized fallback title for free_question in the final normalizer', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(
      workflow,
      'Code in JavaScript2',
      {
        language: 'en',
        locale: 'en',
        coach_route: 'free_question',
        title: '',
        body: '',
        content: {},
        message: { content: '{}' },
      },
      { coach_route: 'free_question' },
    )[0].json;

    expect(result.response_version).toBe(2);
    expect(result.title).toBe('Your coach question');
    expect(result.content.title).toBe('Your coach question');
  });

  it('injects the preset coach question into the shared prompt builder', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'latest_scan',
        question_key: 'latest_scan__three_simple_actions',
        question_text:
          "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
        question_hints: {
          intent_key: 'latest_scan_three_actions',
          time_scope: 'today',
          preferred_artifacts: ['action_steps', 'reminders'],
          discouraged_artifacts: ['daily_schedule'],
          ui_tags: ['quick', 'evening'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'face',
        },
      },
    })[0].json;

    expect(result.coach_question_key).toBe(
      'latest_scan__three_simple_actions',
    );
    expect(result.coach_question_text).toBe(
      "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
    );
    expect(result.coach_question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'latest_scan_three_actions',
        preferred_artifacts: ['action_steps', 'reminders'],
      }),
    );
    expect(result.coach_prompt_user_text).toContain(
      'Question utilisateur prioritaire :',
    );
    expect(result.coach_prompt_user_text).toContain(
      "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
    );
    expect(result.coach_prompt_user_text).toContain('QUESTION_HINTS :');
    expect(result.coach_prompt_user_text).toContain(
      'preferred_artifacts: action_steps, reminders',
    );
    expect(result.coach_prompt_system_text).toContain(
      'Le message utilisateur contient la question prioritaire',
    );
  });

  it('injects a free-text coach question into the shared prompt builder', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'body_focus',
        question_key: null,
        question_text:
          'Sur quoi je dois me concentrer avant ma seance ce soir ?',
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'body',
        },
      },
    })[0].json;

    expect(result.coach_question_key).toBeNull();
    expect(result.coach_question_text).toBe(
      'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    );
    expect(result.coach_prompt_user_text).toContain(
      'Sur quoi je dois me concentrer avant ma seance ce soir ?',
    );
  });

  it('routes free_question explicitly without classifying the user question', () => {
    const workflow = readWorkflow();
    const userQuestion =
      'Je veux manger mieux dehors et reprendre le sport apres mon scan, je fais quoi aujourd hui ?';
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'free_question',
        question_key: 'nutrition_focus__minimal_three_day_shopping',
        question_text: userQuestion,
        question_hints: {
          intent_key: 'nutrition_shopping_list',
          time_scope: 'week',
          preferred_artifacts: ['shopping_list', 'quick_recipe'],
          ui_tags: ['shopping'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'nutrition',
        },
      },
    })[0].json;

    expect(result.coach_route).toBe('free_question');
    expect(result.coach_question_key).toBeNull();
    expect(result.coach_question_text).toBe(userQuestion);
    expect(result.coach_question_hints).toBeNull();
    expect(result.coach_prompt_system_text).toContain(
      'Prompt specialise - free_question',
    );
    expect(result.coach_prompt_user_text).toContain(userQuestion);
    expect(result.coach_prompt_user_text).toContain(
      'Pour free_question, la question utilisateur reste prioritaire',
    );
    expect(result.coach_prompt_user_text).not.toContain(
      'content.shopping_list puis content.quick_recipe',
    );
  });

  it.each([
    ['motivation', 'Je manque de motivation, aide-moi a repartir simplement.'],
    ['nutrition', 'Que manger ce soir pour recuperer sans repas lourd ?'],
    ['sport', 'Quelle seance courte faire si je suis fatigue ?'],
    ['scan-related', 'Que disent mes derniers scans sur ma priorite du jour ?'],
  ])('keeps %s natural-language questions on the free_question route', (_, question) => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'free_question',
        question_key: null,
        question_text: question,
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'body',
        },
      },
    })[0].json;

    expect(result.coach_route).toBe('free_question');
    expect(result.coach_question_text).toBe(question);
    expect(result.coach_prompt_system_text).toContain(
      'Prompt specialise - free_question',
    );
  });

  it('injects scan_intent into the prompt and keeps low-confidence wording cautious', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'latest_scan_issue_resolution',
        selected_scan_id: 'scan-face',
        question_text:
          'Comment améliorer mon hydratation à partir de mon dernier scan ?',
        scan_intent: {
          has_actionable_issue: true,
          priority_metric: 'hydration_level',
          priority_label: 'Hydratation',
          severity: 'low',
          question_text:
            'Comment améliorer mon hydratation à partir de mon dernier scan ?',
          user_facing_summary:
            'Ton hydratation semble être le point le plus intéressant à améliorer après ce scan.',
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_id: 'scan-face',
          scan_type: 'face',
          metrics: {
            hydration_level: 62,
          },
        },
        coach_relevant_flags: ['low_confidence_scan'],
      },
    })[0].json;

    expect(result.coach_route).toBe('latest_scan');
    expect(result.scan_intent).toEqual(
      expect.objectContaining({
        priority_metric: 'hydration_level',
        priority_label: 'Hydratation',
        severity: 'low',
      }),
    );
    expect(result.coach_prompt_user_text).toContain(
      'SCAN_INTENT.priority_metric=hydration_level',
    );
    expect(result.coach_prompt_user_text).toContain(
      'SCAN_INTENT.user_facing_summary=Ton hydratation semble être le point le plus intéressant à améliorer après ce scan.',
    );
    expect(result.coach_prompt_user_text).toContain('Directive prudence scan');
    expect(result.coach_prompt_user_text).toContain(
      'ne la remplace pas par un autre déclencheur sans contradiction factuelle',
    );
    expect(result.coach_prompt_system_text).toContain(
      'scan_intent.priority_metric',
    );
    expect(result.coach_prompt_system_text).not.toContain('coach IA');
    expect(result.coach_prompt_system_text).not.toContain('diagnostic');
  });

  it('falls back to the route default question when question fields are absent', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'risk_watch',
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'super',
        },
      },
    })[0].json;

    expect(result.coach_route).toBe('risk_watch_calm');
    expect(result.coach_question_text).toBe(
      'Quels signaux suivre calmement cette semaine sans tomber dans le stress ?',
    );
    expect(result.coach_prompt_user_text).toContain(
      'Quels signaux suivre calmement cette semaine sans tomber dans le stress ?',
    );
  });

  it('canonicalizes legacy trend_comparison question keys and dispatches the canonical split route', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'trend_comparison',
        question_key: 'trend_comparison__week_progress_review',
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'face',
        },
      },
    })[0].json;

    expect(result.coach_route).toBe('trend_review_summary');
    expect(result.coach_question_key).toBe('trend_review__week_progress_review');
    expect(result.coach_question_text).toBe(
      "Dis-moi ce qui s'ameliore, ce qui bloque et quoi continuer cette semaine.",
    );
    expect(result.coach_question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'trend_week_review',
        preferred_artifacts: expect.arrayContaining([
          'context_notes',
          'action_steps',
        ]),
      }),
    );
  });

  it('specializes nutrition prompts differently for shopping lists versus meal presets', () => {
    const workflow = readWorkflow();
    const breakfastResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'nutrition_focus',
        question_key: 'nutrition_focus__breakfast_no_crash',
        question_text: "Quel petit-dejeuner m'aidera a tenir sans fringale ?",
        question_hints: {
          intent_key: 'nutrition_breakfast_steady',
          time_scope: 'today',
          preferred_artifacts: ['meal_template', 'quick_recipe'],
          discouraged_artifacts: ['shopping_list'],
          meal_slot: 'breakfast',
          ui_tags: ['meal', 'morning'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'nutrition',
        },
      },
    })[0].json;
    const shoppingResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'nutrition_focus',
        question_key: null,
        question_text: 'Fais-moi une liste de courses simple pour 3 jours.',
        question_hints: {
          intent_key: 'nutrition_shopping_list',
          time_scope: 'week',
          preferred_artifacts: ['shopping_list', 'quick_recipe'],
          discouraged_artifacts: ['daily_schedule'],
          ui_tags: ['shopping', 'quick'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'nutrition',
        },
      },
    })[0].json;

    expect(breakfastResult.coach_route).toBe('nutrition_meal');
    expect(shoppingResult.coach_route).toBe('nutrition_shopping');
    expect(breakfastResult.coach_prompt_user_text).toContain(
      'content.meal_template puis content.quick_recipe',
    );
    expect(shoppingResult.coach_prompt_user_text).toContain(
      'content.shopping_list puis content.quick_recipe',
    );
    expect(shoppingResult.coach_prompt_user_text).not.toContain(
      'content.meal_template puis content.quick_recipe, adaptes au creneau breakfast.',
    );
    expect(shoppingResult.coach_question_hints).toEqual(
      expect.objectContaining({
        intent_key: 'nutrition_shopping_list',
      }),
    );
  });

  it('reconstructs the canonical nutrition question from explicit hints when text is absent', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'nutrition_focus',
        question_hints: {
          intent_key: 'nutrition_shopping_list',
          time_scope: 'week',
          preferred_artifacts: ['shopping_list', 'quick_recipe'],
          ui_tags: ['shopping'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'nutrition',
        },
      },
    })[0].json;

    expect(result.coach_route).toBe('nutrition_shopping');
    expect(result.coach_question_key).toBe(
      'nutrition_focus__minimal_three_day_shopping',
    );
    expect(result.coach_question_text).toBe(
      'Quelle liste de courses minimale acheter pour 3 jours de repas utiles ?',
    );
  });

  it('dispatches risk_watch into calm, escalation, and logging routes from hints', () => {
    const workflow = readWorkflow();
    const calmResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'risk_watch',
        question_hints: {
          intent_key: 'risk_watch_priority_today',
          time_scope: 'today',
          preferred_artifacts: ['signal_watch', 'priorities', 'action_steps'],
          ui_tags: ['tracking', 'today'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'super' },
      },
    })[0].json;
    const escalationResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'risk_watch',
        question_hints: {
          intent_key: 'risk_escalation',
          time_scope: 'week',
          preferred_artifacts: ['signal_watch', 'warnings', 'knowledge_card'],
          ui_tags: ['escalation'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'super' },
      },
    })[0].json;
    const loggingResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'risk_watch',
        question_hints: {
          intent_key: 'risk_watch_logging',
          time_scope: 'week',
          preferred_artifacts: ['signal_watch', 'habit_tracker', 'data_gaps'],
          ui_tags: ['tracking'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'super' },
      },
    })[0].json;

    expect(calmResult.coach_route).toBe('risk_watch_calm');
    expect(calmResult.coach_question_key).toBe(
      'risk_watch__what_to_monitor_today',
    );
    expect(calmResult.coach_question_text).toBe(
      "Aujourd'hui, qu'est-ce que je dois surveiller sans me disperser ?",
    );
    expect(escalationResult.coach_route).toBe('risk_watch_escalation');
    expect(escalationResult.coach_question_key).toBe(
      'risk_watch__when_to_seek_pro_help',
    );
    expect(escalationResult.coach_question_text).toBe(
      'A partir de quand un signal merite un vrai avis pro ?',
    );
    expect(loggingResult.coach_route).toBe('risk_watch_logging');
    expect(loggingResult.coach_question_key).toBe(
      'risk_watch__how_to_log_signals',
    );
    expect(loggingResult.coach_question_text).toBe(
      'Comment noter proprement mes signaux pour voir une vraie evolution ?',
    );
  });

  it('dispatches trend_review into summary, blocked, and continue routes from hints', () => {
    const workflow = readWorkflow();
    const summaryResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'trend_review',
        question_hints: {
          intent_key: 'trend_improving',
          time_scope: 'week',
          preferred_artifacts: ['context_notes', 'primary_metric_delta', 'action_steps'],
          ui_tags: ['trend'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'face' },
      },
    })[0].json;
    const blockedResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'trend_review',
        question_hints: {
          intent_key: 'trend_biggest_regression',
          time_scope: 'week',
          preferred_artifacts: ['context_notes', 'warnings', 'action_steps'],
          ui_tags: ['trend', 'blocked'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'body' },
      },
    })[0].json;
    const continueResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'trend_review',
        question_hints: {
          intent_key: 'trend_next_adjustment',
          time_scope: 'week',
          preferred_artifacts: ['priorities', 'action_steps', 'context_notes'],
          ui_tags: ['trend', 'planning'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'nutrition' },
      },
    })[0].json;

    expect(summaryResult.coach_route).toBe('trend_review_summary');
    expect(summaryResult.coach_question_key).toBe(
      'trend_review__what_is_improving',
    );
    expect(summaryResult.coach_question_text).toBe(
      "Qu'est-ce qui s'ameliore vraiment en ce moment ?",
    );
    expect(blockedResult.coach_route).toBe('trend_review_blocked');
    expect(blockedResult.coach_question_key).toBe(
      'trend_review__biggest_regression_to_watch',
    );
    expect(blockedResult.coach_question_text).toBe(
      'Quelle regression ou derive doit etre surveillee en premier ?',
    );
    expect(continueResult.coach_route).toBe('trend_review_continue');
    expect(continueResult.coach_question_key).toBe(
      'trend_review__next_adjustment_this_week',
    );
    expect(continueResult.coach_question_text).toBe(
      'Quel ajustement concret ferait le plus de difference cette semaine ?',
    );
  });

  it('dispatches recovery_plan into reset_48h and restart routes from hints', () => {
    const workflow = readWorkflow();
    const resetResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'recovery_plan',
        question_hints: {
          intent_key: 'recovery_two_day_rhythm',
          time_scope: 'forty_eight_hours',
          preferred_artifacts: ['daily_schedule', 'habit_tracker', 'reminders'],
          ui_tags: ['recovery', 'planning'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'body' },
      },
    })[0].json;
    const restartResult = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'recovery_plan',
        question_hints: {
          intent_key: 'recovery_today_after_bad_night',
          time_scope: 'today',
          preferred_artifacts: ['priorities', 'action_steps', 'micro_routine'],
          ui_tags: ['recovery', 'quick'],
        },
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'face' },
      },
    })[0].json;

    expect(resetResult.coach_route).toBe('recovery_reset_48h');
    expect(resetResult.coach_question_key).toBe(
      'recovery_plan__two_day_recovery_rhythm',
    );
    expect(resetResult.coach_question_text).toBe(
      'Comment organiser mes prochaines 48h pour retrouver un rythme propre ?',
    );
    expect(restartResult.coach_route).toBe('recovery_restart');
    expect(restartResult.coach_question_key).toBe(
      'recovery_plan__today_after_bad_night',
    );
    expect(restartResult.coach_question_text).toBe(
      "Quel plan minimum suivre aujourd'hui apres une mauvaise nuit ?",
    );
  });

  it('canonicalizes preset text-only inputs back to their stable question key', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'trend_review',
        question_text:
          "Dis-moi ce qui s'ameliore, ce qui bloque et quoi continuer cette semaine.",
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'face',
        },
      },
    })[0].json;

    expect(result.coach_route).toBe('trend_review_summary');
    expect(result.coach_question_key).toBe(
      'trend_review__week_progress_review',
    );
  });

  it('keeps all coach model token budgets high enough without forcing n8n JSON parsing', () => {
    const workflow = readWorkflow();
    const deepSeekNodes = workflow.nodes.filter(
      (node) => node.type === '@n8n/n8n-nodes-langchain.lmChatDeepSeek',
    );
    const strictModelNode = getNode(workflow, 'DeepSeek Strict');

    expect(deepSeekNodes).toHaveLength(6);
    deepSeekNodes.forEach((node) => {
      expect(node.parameters.options).not.toHaveProperty('responseFormat');
    });
    expect(strictModelNode.parameters.options).toMatchObject({
      maxTokens: 2400,
      temperature: 0.1,
      topP: 0.8,
    });
  });

  it('asks for compact content-first JSON without literal string newlines', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'latest_scan',
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_type: 'face',
        },
      },
    })[0].json;

    expect(result.coach_prompt_contract_block).toContain(
      'body : null de preference',
    );
    expect(result.coach_prompt_contract_block).not.toContain(
      'body : chaîne <= 1200',
    );
    expect(result.coach_prompt_contract_block).toContain(
      'Aucun saut de ligne litteral dans une valeur string JSON',
    );
    expect(result.coach_prompt_contract_block).toContain(
      'encode-le uniquement avec \\n',
    );
  });

  it('keeps weekly_plan prompt context compact and removes the literal JSON example block', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      locale: 'fr',
      language: 'fr',
      persona_key: 'strict_tough',
      payload: {
        prompt_type: 'weekly_plan',
      },
      scan_context: {
        has_any_scan: true,
        primary_scan: {
          scan_id: 'face-1',
          scan_type: 'face',
          key_metrics: {
            hydration_level: 42,
            glow_index: 4.8,
          },
        },
        recent_scans: [
          {
            scan_id: 'face-1',
            scan_type: 'face',
            key_metrics: { hydration_level: 42, glow_index: 4.8 },
          },
          {
            scan_id: 'meal-1',
            scan_type: 'nutrition',
            key_metrics: { plate_health_score: 59, protein_grams: 18 },
          },
        ],
        prior_scans: [{ scan_id: 'old-1', scan_type: 'face' }],
      },
      comparison_to_previous: { available: false },
      trend_summary: { available: true },
    })[0].json;

    expect(result.coach_prompt_blocks.weekly_plan).toContain(
      '12 slots max sur toute la semaine',
    );
    expect(result.coach_prompt_blocks.weekly_plan).not.toContain(
      '2 à 4 slots',
    );
    expect(result.coach_prompt_blocks.weekly_plan).not.toContain(
      '2 a 4 slots',
    );
    expect(result.coach_prompt_blocks.weekly_plan).not.toContain(
      'Exemple JSON minimal attendu',
    );
    expect(result.coach_prompt_user_text).toContain(
      'Entrée normalisée compacte (weekly_plan)',
    );
    expect(result.coach_prompt_user_text).not.toContain(
      'Entrée normalisée complète',
    );
    expect(result.coach_prompt_user_text).not.toContain(
      '"coach_prompt_system_text"',
    );
    expect(result.coach_prompt_user_text).toContain('"primary_scan"');
    expect(result.coach_prompt_user_text).toContain('"recent_scan_count"');
  });

  it('synthesizes body text from content-only compact LLM payloads', () => {
    const workflow = readWorkflow();
    const compactPayload = {
      language: 'fr',
      locale: 'fr',
      coach_route: 'latest_scan',
      persona_key: 'strict_tough',
      response_version: 2,
      title: 'Plan du jour',
      body: null,
      disclaimer: null,
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      content: {
        title: 'Plan du jour',
        summary: 'Direct au but. Hydratation basse.',
        context_notes: ['Hydratation basse sur le scan.'],
        priorities: ['Hydratation'],
        action_steps: ['Bois 1 verre a 11h.', 'Bois 1 verre a 16h.'],
        warnings: [],
        encouragement: null,
        primary_metric_delta: null,
        data_gaps: [],
        confidence: 'medium',
      },
    };

    const result = runCodeNode(
      workflow,
      'Code in JavaScript2',
      compactPayload,
      compactPayload,
    )[0].json;

    expect(result.response_version).toBe(2);
    expect(result.title).toBe('Plan du jour');
    expect(result.body).toContain('Direct au but. Hydratation basse.');
    expect(result.body).toContain('Bois 1 verre a 11h.');
    expect(result.disclaimer).toBeTruthy();
    expect(result.content.action_steps).toEqual([
      'Bois 1 verre a 11h.',
      'Bois 1 verre a 16h.',
    ]);
    expect(result.source).toBe('n8n');
  });

  it('salvages fenced JSON returned in message.content', () => {
    const workflow = readWorkflow();
    const payload = {
      language: 'fr',
      locale: 'fr',
      coach_route: 'latest_scan',
      persona_key: 'strict_tough',
      message: {
        content: '```json\\n{\"title\":\"Plan direct\",\"content\":{\"summary\":\"Hydratation basse.\",\"priorities\":[\"Boire plus tot dans la journee\"],\"action_steps\":[\"Bois un verre d eau avant midi.\"]}}\\n```',
      },
    };

    const result = runCodeNode(
      workflow,
      'Code in JavaScript2',
      payload,
      payload,
    )[0].json;

    expect(result.title).toBe('Plan direct');
    expect(result.body).toContain('Hydratation basse.');
    expect(result.content.priorities).toEqual([
      'Boire plus tot dans la journee',
    ]);
    expect(result.content.action_steps).toEqual([
      'Bois un verre d eau avant midi.',
    ]);
  });

  it('falls back to a valid v2 payload when LLM JSON is truncated', () => {
    const workflow = readWorkflow();
    const upstreamContext = {
      locale: 'fr',
      language: 'fr',
      coach_route: 'weekly_plan',
      persona_key: 'analytical_precise',
      scan_context: {
        has_any_scan: true,
        recent_scans: [{ scan_type: 'face' }],
        prior_scans: [],
      },
    };
    const truncatedJson =
      '{"response_version":2,"title":"Plan hebdo","body":null,"content":{"title":"Plan hebdo","summary":"Hydratation","daily_schedule":[{"day":"Jeudi","slots":[{"time":"07:30","duration_min":5,"action":"Etirements + 1 verre d eau","';

    const result = runCodeNode(
      workflow,
      'Code in JavaScript2',
      { message: { content: truncatedJson } },
      upstreamContext,
    )[0].json;

    expect(result.response_version).toBe(2);
    expect(result.title).toBe('Ton plan de la semaine');
    expect(result.source).toBe('n8n');
    // After the fallback cleanup, the user-facing body is a useful generic
    // priority instead of an apologetic data-disclaimer.
    expect(result.body).toContain('Voici ta priorite du jour');
    expect(result.disclaimer).toBeTruthy();
    expect(result.content.title).toBe('Ton plan de la semaine');
    expect(result.content.daily_schedule).toEqual([]);
    expect(result.content.confidence).toBeTruthy();
  });

  it('uses the shared dynamic system prompt across coach persona nodes', () => {
    const workflow = readWorkflow();
    const coachNode = getNode(workflow, 'Coach Gentle / latest_scan');

    expect(coachNode.parameters.messages.messageValues[0].message).toBe(
      '={{ $json.coach_prompt_system_text }}',
    );
  });

  it('injects the 5 universal anti-divergence principles in every coach prompt (common block)', () => {
    const workflow = readWorkflow();
    const routes = [
      'free_question',
      'latest_scan',
      'weekly_plan',
      'nutrition_focus',
      'body_focus',
      'face_focus',
      'hydration_focus',
      'sleep_coach',
      'risk_watch',
      'recovery_plan',
      'trend_review',
    ];
    const personas = [
      'gentle_supportive',
      'strict_tough',
      'motivational_energetic',
      'patient_calm',
      'analytical_precise',
      'playful_light',
    ];

    for (const promptType of routes) {
      for (const personaKey of personas) {
        const result = runCodeNode(workflow, 'Determine Coach Route', {
          payload: {
            prompt_type: promptType,
            question_text:
              promptType === 'free_question'
                ? 'Quelle est la capitale de l Italie ?'
                : null,
          },
          persona_key: personaKey,
          language: 'fr',
          scan_context: {
            has_any_scan: true,
            primary_scan: { scan_type: 'body' },
          },
        })[0].json;
        const system = result.coach_prompt_system_text;
        expect(system).toContain('PRIORITÉ ABSOLUE');
        expect(system).toContain('RÉPONDS D ABORD à la question');
        expect(system).toContain('ANTI-RÉFLEXE');
        expect(system).toContain('"bois de l eau"');
        expect(system).toContain('DÉTECTION D INTENTION');
        expect(system).toContain('UNE SEULE LISTE NUMÉROTÉE');
        expect(system).toContain('EXEMPLES À NE PAS REPRODUIRE');
        expect(system).toContain(
          'PERSONA + CONTRAT définissent la FORME',
        );
      }
    }
  });

  it('enforces action_steps/priorities mutual-exclusion in the JSON contract', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'latest_scan',
        question_text: null,
      },
      persona_key: 'analytical_precise',
      language: 'fr',
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'body' },
      },
    })[0].json;
    expect(result.coach_prompt_system_text).toContain(
      'anti-double-numérotation visuelle',
    );
    expect(result.coach_prompt_system_text).toContain(
      'mutuellement exclusifs au sens visuel',
    );
    expect(result.coach_prompt_system_text).toContain(
      'Une seule liste numérotée visible par carte',
    );
  });

  it('contains the exact bug-example anti-pattern so the LLM rejects the drink-water reflex', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'recovery_plan',
        question_text: 'donne un plan sur 2 jours de récup',
      },
      persona_key: 'gentle_supportive',
      language: 'fr',
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'body' },
      },
    })[0].json;
    expect(result.coach_prompt_system_text).toContain(
      'donne un plan sur 2 jours de récup',
    );
    expect(result.coach_prompt_system_text).toContain('bois un verre d eau');
    expect(result.coach_prompt_system_text).toContain('content.daily_schedule');
  });

  it('hardens the free_question route with explicit anti-divergence directives', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'free_question',
        question_text: 'Donne-moi ta meilleure blague.',
      },
      persona_key: 'playful_light',
      language: 'fr',
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'body' },
      },
    })[0].json;

    expect(result.coach_route).toBe('free_question');
    expect(result.coach_prompt_system_text).toContain(
      'C est une question libre. Tu DOIS répondre à la question posée',
    );
    expect(result.coach_prompt_system_text).toContain(
      'Hors santé (culture générale, blague, vie quotidienne, météo, code',
    );
    expect(result.coach_prompt_system_text).toContain(
      'Interdit de suggérer "bois de l eau"',
    );
    expect(result.coach_prompt_system_text).toContain(
      'Interdit de basculer la réponse sur le dernier scan si l utilisateur ne pose pas de question dessus',
    );
  });

  it('does not force a generic next-step or hydration default for free_question', () => {
    const workflow = readWorkflow();
    const result = runCodeNode(workflow, 'Determine Coach Route', {
      payload: {
        prompt_type: 'free_question',
        question_text: 'Quelle est la capitale de l Italie ?',
      },
      persona_key: 'gentle_supportive',
      language: 'fr',
      scan_context: {
        has_any_scan: true,
        primary_scan: { scan_type: 'body' },
      },
    })[0].json;

    expect(result.coach_prompt_system_text).not.toMatch(
      /Always one concrete next step/i,
    );
    expect(result.coach_prompt_system_text).toContain('ANTI-RÉFLEXE');
  });
});

describe('coach-conversation n8n workflow export', () => {
  const conversationWorkflowPath = path.join(
    process.cwd(),
    'n8n',
    'workflows',
    'coach-conversation.json',
  );
  const conversationWorkflow = JSON.parse(
    fs.readFileSync(conversationWorkflowPath, 'utf8'),
  );
  const normalizeNode = conversationWorkflow.nodes.find(
    (n) => n.name === 'Normalize Coach Conversation Input',
  );

  function runConversationNormalize(payload) {
    const fn = new Function('items', normalizeNode.parameters.jsCode);
    return fn([{ json: payload }]);
  }

  const personas = [
    'gentle_supportive',
    'strict_tough',
    'motivational_energetic',
    'patient_calm',
    'analytical_precise',
    'playful_light',
  ];

  it.each(personas)(
    'injects the 5 anti-divergence principles in the %s conversation system prompt',
    (personaKey) => {
      const result = runConversationNormalize({
        conversation_id: 'c-test',
        user_id: 'u-test',
        persona_key: personaKey,
        locale: 'fr',
        messages: [{ role: 'user', content: 'Hello coach' }],
      })[0].json;
      const system = result.coach_conversation_system_prompt;
      expect(system).toContain('PRIORITÉ ABSOLUE');
      expect(system).toContain('RÉPONDS D ABORD à la question');
      expect(system).toContain('ANTI-RÉFLEXE');
      expect(system).toContain('"bois de l eau"');
      expect(system).toContain('DÉTECTION D INTENTION');
      expect(system).toContain('UNE SEULE LISTE NUMÉROTÉE');
      expect(system).toContain('EXEMPLES À NE PAS REPRODUIRE');
      expect(system).toContain('RAPPEL FINAL');
      expect(system).toContain('Pas d action-réflexe générique');
    },
  );

  it('triggers structured-output guidance when the user asks for a "plan" or a multi-day breakdown', () => {
    const result = (function run() {
      const fn = new Function('items', normalizeNode.parameters.jsCode);
      return fn([{
        json: {
          conversation_id: 'c-test',
          user_id: 'u-test',
          persona_key: 'gentle_supportive',
          locale: 'fr',
          messages: [{ role: 'user', content: 'donne un plan sur 2 jours de récup' }],
        },
      }]);
    })()[0].json;
    const system = result.coach_conversation_system_prompt;
    expect(system).toContain('plan');
    expect(system).toContain('Jour 1');
    expect(system).toContain('donne un plan sur 2 jours de récup');
    expect(system).toContain('bois un verre d eau');
  });

  it('forbids two consecutive numbered lists (one-numbered-list rule)', () => {
    const result = (function run() {
      const fn = new Function('items', normalizeNode.parameters.jsCode);
      return fn([{
        json: {
          conversation_id: 'c-test',
          user_id: 'u-test',
          persona_key: 'analytical_precise',
          locale: 'fr',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      }]);
    })()[0].json;
    const system = result.coach_conversation_system_prompt;
    expect(system).toContain('UNE SEULE LISTE NUMÉROTÉE');
    expect(system).toContain('JAMAIS deux blocs numérotés');
  });

  it('removes the legacy "Always one concrete next step" instruction', () => {
    const result = runConversationNormalize({
      conversation_id: 'c-test',
      user_id: 'u-test',
      persona_key: 'gentle_supportive',
      locale: 'fr',
      messages: [{ role: 'user', content: 'Hello coach' }],
    })[0].json;
    expect(result.coach_conversation_system_prompt).not.toMatch(
      /Always one concrete next step/i,
    );
  });

  it('marks the scan digest as informational context, not a topic to comment on', () => {
    const result = runConversationNormalize({
      conversation_id: 'c-test',
      user_id: 'u-test',
      persona_key: 'analytical_precise',
      locale: 'fr',
      messages: [{ role: 'user', content: 'Quelle est la capitale du Japon ?' }],
      user_context: {
        recent_scan_digest: [{ scan_type: 'body', captured_at: '2026-05-15' }],
      },
    })[0].json;
    expect(result.coach_conversation_system_prompt).toContain(
      'Digest scans récents (informatif',
    );
    expect(result.coach_conversation_system_prompt).toContain(
      'NE PAS commenter sauf si la question le demande',
    );
  });
});
