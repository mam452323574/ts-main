const fs = require('fs');
const path = require('path');

const workflowPath = path.join(
  process.cwd(),
  'n8n',
  'workflows',
  'analyse_1.json',
);

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

function findIncomingMainConnections(workflow, targetName) {
  return Object.entries(workflow.connections).flatMap(([sourceName, buckets]) =>
    (buckets.main || []).flatMap((branch = []) =>
      branch
        .filter((connection) => connection.node === targetName)
        .map((connection) => ({
          ...connection,
          sourceName,
        })),
    ),
  );
}

function runCodeNode(workflow, name, payload) {
  const jsCode = getNode(workflow, name).parameters.jsCode;
  const executor = new Function('$json', jsCode);
  return executor(payload);
}

describe('analyse_1 n8n workflow export', () => {
  it('routes the webhook through normalize, binary conversion plus context snapshot, merge, determine, switch, normalize output, and respond', () => {
    const workflow = readWorkflow();
    const mergeNode = getNode(workflow, 'Merge Image + Analyse Context');

    expect(getNode(workflow, 'Webhook').parameters).toMatchObject({
      httpMethod: 'POST',
      path: 'analyse_1',
      responseMode: 'responseNode',
    });
    expect(workflow.connections.Webhook.main[0][0].node).toBe(
      'Normalize Analyse Input',
    );
    expect(
      workflow.connections['Normalize Analyse Input'].main[0][0].node,
    ).toBe('Convert to File');
    expect(
      workflow.connections['Normalize Analyse Input'].main[0][1].node,
    ).toBe('Snapshot Analyse Context');
    expect(workflow.connections['Convert to File'].main[0][0].node).toBe(
      'Merge Image + Analyse Context',
    );
    expect(
      workflow.connections['Snapshot Analyse Context'].main[0][0],
    ).toMatchObject({
      node: 'Merge Image + Analyse Context',
      index: 1,
    });
    expect(mergeNode.type).toBe('n8n-nodes-base.merge');
    expect(mergeNode.parameters).toMatchObject({
      mode: 'combine',
      combineBy: 'combineByPosition',
    });
    expect(
      workflow.connections['Merge Image + Analyse Context'].main[0][0].node,
    ).toBe(
      'Determine Scan Route',
    );
    expect(workflow.connections['Determine Scan Route'].main[0][0].node).toBe(
      'Switch scan_route',
    );
    expect(workflow.connections['Code in JavaScript'].main[0][0].node).toBe(
      'Respond to Webhook1',
    );
  });

  it('uses a switch node with explicit face/body/nutrition rules and a fallback output', () => {
    const workflow = readWorkflow();
    const switchNode = getNode(workflow, 'Switch scan_route');

    expect(switchNode.type).toBe('n8n-nodes-base.switch');
    expect(switchNode.parameters.options).toMatchObject({
      ignoreCase: true,
      fallbackOutput: 'extra',
    });
    expect(
      switchNode.parameters.rules.values.map((rule) => rule.outputKey),
    ).toEqual(['face', 'body', 'nutrition']);
    expect(
      switchNode.parameters.rules.values.map(
        (rule) => rule.conditions.conditions[0].leftValue,
      ),
    ).toEqual([
      '={{ $json.scan_route }}',
      '={{ $json.scan_route }}',
      '={{ $json.scan_route }}',
    ]);
    expect(
      switchNode.parameters.rules.values.map(
        (rule) => rule.conditions.conditions[0].rightValue,
      ),
    ).toEqual(['face', 'body', 'nutrition']);

    expect(workflow.connections['Switch scan_route'].main[0][0].node).toBe(
      'Analyze Face Image',
    );
    expect(workflow.connections['Switch scan_route'].main[1][0].node).toBe(
      'Analyze Body Image',
    );
    expect(workflow.connections['Switch scan_route'].main[2][0].node).toBe(
      'Analyze Nutrition Image',
    );
    expect(workflow.connections['Switch scan_route'].main[3][0].node).toBe(
      'Analyze Image Auto Detect Fallback',
    );
  });

  it('keeps all specialized LLM branches converging into the shared final normalizer', () => {
    const workflow = readWorkflow();
    const incoming = findIncomingMainConnections(workflow, 'Code in JavaScript');

    expect(incoming.map((connection) => connection.sourceName)).toEqual(
      expect.arrayContaining([
        'Analyze Face Image',
        'Analyze Body Image',
        'Analyze Nutrition Image',
        'Analyze Image Auto Detect Fallback',
      ]),
    );
    expect(incoming).toHaveLength(4);
  });

  it('uses specialized prompts with the shared safety block and strict JSON output rules', () => {
    const workflow = readWorkflow();
    const facePrompt = getNode(workflow, 'Analyze Face Image').parameters.text;
    const bodyPrompt = getNode(workflow, 'Analyze Body Image').parameters.text;
    const nutritionPrompt = getNode(
      workflow,
      'Analyze Nutrition Image',
    ).parameters.text;
    const fallbackPrompt = getNode(
      workflow,
      'Analyze Image Auto Detect Fallback',
    ).parameters.text;

    for (const prompt of [
      facePrompt,
      bodyPrompt,
      nutritionPrompt,
      fallbackPrompt,
    ]) {
      expect(prompt).toContain('{{$json.language_code}}');
      expect(prompt).toContain(
        'produce your best visual estimate from the image',
      );
      expect(prompt).toContain(
        'Only use null as a last resort when there is genuinely no visual cue at all for that field.',
      );
      expect(prompt).toContain(
        'The downstream coaching system tolerates approximation. It does NOT tolerate empty responses.',
      );
      expect(prompt).toContain(
        'visual heuristics for wellness coaching purposes, not medical assessments',
      );
      expect(prompt).toContain('Return exactly one valid JSON object.');
      expect(prompt).toContain('Return no markdown');
      expect(prompt).toContain('analysis_meta is internal scan quality metadata');
    }

    expect(facePrompt).toContain(
      'If the image does not clearly show an analyzable human face',
    );
    expect(facePrompt).toContain('Never return BODY or NUTRITION');
    expect(facePrompt).toContain(
      'message must be a short localized error message.',
    );
    expect(facePrompt).not.toContain('cycle_phase_hint_key');

    expect(bodyPrompt).toContain('Never return FACE or NUTRITION');
    expect(bodyPrompt).toContain('Do not sexualize the person.');
    expect(bodyPrompt).toContain('Do not comment on attractiveness.');
    expect(bodyPrompt).toContain(
      'body_score is a neutral overall estimate of visible form, silhouette, and posture, not an attractiveness score.',
    );

    expect(nutritionPrompt).toContain('Never return FACE or BODY');
    expect(nutritionPrompt).toContain(
      'Calories and macros are visual approximations.',
    );
    expect(nutritionPrompt).toContain(
      'short_verdict: maximum 5 localized words.',
    );

    expect(fallbackPrompt).toContain(
      'Supported schemas: face, body, nutrition, error.',
    );
    expect(fallbackPrompt).toContain(
      'If the image is ambiguous, return ERROR.',
    );
    expect(fallbackPrompt).toContain(
      'If both face and body are visible, choose the most tightly framed main subject.',
    );
    expect(fallbackPrompt).toContain(
      'If the subject is a meal, choose NUTRITION.',
    );
    expect(fallbackPrompt).toContain(
      'Never return health, super_health, or super_scan.',
    );
  });

  describe('Normalize Analyse Input code node', () => {
    it('normalizes language and explicit aliases from body fields', () => {
      const workflow = readWorkflow();
      const result = runCodeNode(workflow, 'Normalize Analyse Input', {
        body: {
          imageBase64: 'ZmFrZQ==',
          language: 'es-MX',
          expected_scan_type: 'visage',
        },
      })[0].json;

      expect(result.language_code).toBe('es');
      expect(result.requested_scan_type).toBe('face');
      expect(result.scan_route).toBe('face');
      expect(result.body.imageBase64).toBe('ZmFrZQ==');
    });

    it('accepts legacy body.scanType values and preserves auto fallback for unsupported types', () => {
      const workflow = readWorkflow();
      const legacy = runCodeNode(workflow, 'Normalize Analyse Input', {
        body: {
          scanType: 'health',
        },
      })[0].json;
      const unsupported = runCodeNode(workflow, 'Normalize Analyse Input', {
        body: {
          locale: 'de-DE',
          type: 'super_health_v2',
        },
      })[0].json;

      expect(legacy.requested_scan_type).toBe('face');
      expect(legacy.scan_route).toBe('face');

      expect(unsupported.language_code).toBe('de');
      expect(unsupported.requested_scan_type).toBeNull();
      expect(unsupported.scan_route).toBe('auto_detect_fallback');
    });

    it('supports root-level payloads and scan aliases when body is absent', () => {
      const workflow = readWorkflow();
      const result = runCodeNode(workflow, 'Normalize Analyse Input', {
        locale: 'it-IT',
        analysis_type: 'food',
      })[0].json;

      expect(result.language_code).toBe('it');
      expect(result.requested_scan_type).toBe('nutrition');
      expect(result.scan_route).toBe('nutrition');
    });
  });

  describe('Snapshot Analyse Context code node', () => {
    it('preserves the explicit route for legacy health scans without carrying imageBase64', () => {
      const workflow = readWorkflow();
      const normalized = runCodeNode(workflow, 'Normalize Analyse Input', {
        scanId: 'scan-123',
        userId: 'user-456',
        body: {
          imageBase64: 'ZmFrZQ==',
          scanType: 'health',
          language: 'fr-FR',
        },
      })[0].json;
      const snapshot = runCodeNode(
        workflow,
        'Snapshot Analyse Context',
        normalized,
      )[0].json;

      expect(snapshot.scanId).toBe('scan-123');
      expect(snapshot.userId).toBe('user-456');
      expect(snapshot.language_code).toBe('fr');
      expect(snapshot.requested_scan_type).toBe('face');
      expect(snapshot.scan_route).toBe('face');
      expect(snapshot.body.scanType).toBe('health');
      expect(snapshot.body).not.toHaveProperty('imageBase64');
    });
  });

  describe('Code in JavaScript shared normalizer', () => {
    it('normalizes noisy face JSON and returns a strict success/data envelope', () => {
      const workflow = readWorkflow();
      const result = runCodeNode(workflow, 'Code in JavaScript', {
        language_code: 'en',
        scan_route: 'auto_detect_fallback',
        text: '```json\\n{\"scan_type\":\"face\",\"face_score\":101,\"perceived_age\":29,\"skin_quality_score\":88,\"symmetry_percentage\":93,\"fatigue_level\":12,\"glow_index\":11,\"face_shape\":\"Oval\",\"collagen_level\":64,\"hydration_level\":73,\"photogenic_score\":12}\\n```',
      })[0].json;

      expect(Object.keys(result).sort()).toEqual(['data', 'success']);
      expect(result).toEqual({
        success: true,
        data: {
          schema_version: 4,
          scan_type: 'face',
          face_score: 100,
          perceived_age: 29,
          skin_quality_score: 88,
          symmetry_percentage: 93,
          fatigue_level: 12,
          glow_index: 10,
          face_shape: 'Oval',
          collagen_level: 64,
          hydration_level: 73,
          photogenic_score: 10,
          skin_clarity_score: null,
          under_eye_shadow_score: null,
          under_eye_volume_score: null,
          eye_openness_score: null,
          complexion_redness_score: null,
          pore_visibility_score: null,
          skin_evenness_score: null,
          skin_radiance_score: null,
          lip_dryness_score: null,
          forehead_smoothness_score: null,
          t_zone_oiliness_score: null,
          perceived_sex_key: null,
          perceived_age_range_key: null,
          perceived_stress_level: null,
          perceived_sleep_quality: null,
          analysis_meta: {
            confidence_score: null,
            image_quality_score: null,
            metric_coverage_score: null,
            limitation_flags: [],
          },
        },
      });
    });

    it('accepts wrapped nutrition payloads and rebuilds missing fields with nulls', () => {
      const workflow = readWorkflow();
      const result = runCodeNode(workflow, 'Code in JavaScript', {
        language_code: 'en',
        scan_route: 'auto_detect_fallback',
        message: {
          content: JSON.stringify({
            data: {
              scan_type: 'nutrition',
              plate_health_score: '82',
              calories_estimate: 650,
              protein_grams: 32,
              carbs_grams: 45,
              fat_grams: 22,
              glycemic_index_label: 'Low',
              satiety_index: 9,
              ingredient_quality: 'Natural',
              main_vitamins: 'Vitamin C',
              short_verdict: 'Balanced',
            },
          }),
        },
      })[0].json;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        schema_version: 4,
        scan_type: 'nutrition',
        plate_health_score: 82,
        calories_estimate: 650,
        protein_grams: 32,
        carbs_grams: 45,
        fat_grams: 22,
        glycemic_index_label: 'Low',
        satiety_index: 9,
        ingredient_quality: 'Natural',
        main_vitamins: 'Vitamin C',
        short_verdict: 'Balanced',
        fiber_grams_estimate: null,
        sugar_grams_estimate: null,
        processing_level_score: null,
        hydration_contribution_score: null,
        sodium_level_score: null,
        meal_balance_score: null,
        inflammation_index_score: null,
        meal_type_key: null,
        portion_size_key: null,
        color_diversity_score: null,
        vegetable_portion_ratio: null,
        protein_visibility_score: null,
        whole_grain_indicator_score: null,
        meal_freshness_score: null,
        cuisine_type_key: null,
        meat_type_key: null,
        cooking_method_key: null,
        meal_dietary_pattern_key: null,
        allergen_visibility_keys: [],
        analysis_meta: {
          confidence_score: null,
          image_quality_score: null,
          metric_coverage_score: null,
          limitation_flags: [],
        },
      });
    });

    it('clamps and filters analysis_meta from provider payloads', () => {
      const workflow = readWorkflow();
      const result = runCodeNode(workflow, 'Code in JavaScript', {
        language_code: 'en',
        scan_route: 'auto_detect_fallback',
        text: JSON.stringify({
          scan_type: 'body',
          body_score: 81,
          body_fat_percentage: 19,
          muscle_mass_label: 'Balanced',
          body_type: 'Athletic',
          posture_score: 12,
          waist_estimation_cm: 82,
          strength_index: 74,
          body_symmetry: 77,
          bmi_estimate: 23,
          metabolic_age: 31,
          analysisMeta: {
            confidenceScore: 101,
            image_quality_score: -5,
            metricCoverageScore: 68,
            limitationFlags: ['blur', 'invalid_flag', 'blur'],
          },
        }),
      })[0].json;

      expect(result).toEqual({
        success: true,
        data: {
          schema_version: 4,
          scan_type: 'body',
          body_score: 81,
          body_fat_percentage: 19,
          muscle_mass_label: 'Balanced',
          body_type: 'Athletic',
          posture_score: 10,
          waist_estimation_cm: 82,
          strength_index: 74,
          body_symmetry: 77,
          bmi_estimate: 23,
          metabolic_age: 31,
          muscle_definition_score: null,
          midsection_definition_score: null,
          shoulder_alignment_score: null,
          recovery_readiness_score: null,
          upper_body_definition_score: null,
          lower_body_definition_score: null,
          arm_definition_score: null,
          v_taper_score: null,
          body_tension_indicator_score: null,
          perceived_sex_key: null,
          perceived_age_range_key: null,
          estimated_height_range_key: null,
          estimated_weight_range_key: null,
          body_frame_key: null,
          perceived_fitness_level_key: null,
          analysis_meta: {
            confidence_score: 100,
            image_quality_score: 0,
            metric_coverage_score: 68,
            limitation_flags: ['blur'],
          },
        },
      });
    });

    it('returns a localized error when an explicit route produces another scan type', () => {
      const workflow = readWorkflow();
      const result = runCodeNode(workflow, 'Code in JavaScript', {
        language_code: 'fr',
        requested_scan_type: 'face',
        scan_route: 'face',
        text: JSON.stringify({
          scan_type: 'body',
          body_score: 80,
          body_fat_percentage: 20,
          muscle_mass_label: 'Moyenne',
          body_type: 'Mesomorphe',
          posture_score: 6,
          waist_estimation_cm: 82,
          strength_index: 72,
          body_symmetry: 71,
          bmi_estimate: 24,
          metabolic_age: 31,
        }),
      })[0].json;

      expect(result).toEqual({
        success: false,
        data: {
          scan_type: 'error',
          message:
            'Le type de scan retourne ne correspond pas a la demande.',
        },
      });
    });

    it('rejects invalid payloads and never leaks extra top-level keys', () => {
      const workflow = readWorkflow();
      const missingType = runCodeNode(workflow, 'Code in JavaScript', {
        language_code: 'fr',
        text: JSON.stringify({ body_score: 80 }),
      })[0].json;
      const unknownType = runCodeNode(workflow, 'Code in JavaScript', {
        language_code: 'en',
        text: JSON.stringify({ scan_type: 'super_health_v2' }),
      })[0].json;

      for (const result of [missingType, unknownType]) {
        expect(Object.keys(result).sort()).toEqual(['data', 'success']);
        expect(Object.keys(result.data).sort()).toEqual(['message', 'scan_type']);
        expect(result.success).toBe(false);
        expect(result.data.scan_type).toBe('error');
      }

      expect(missingType.data.message).toBe('Reponse du scan invalide.');
      expect(unknownType.data.message).toBe('Invalid scan response.');
    });
  });
});
