import {
  FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
  buildFridgeScanWebhookPayload,
  normalizeFridgeScanCompletionPayload,
  normalizeFridgeMealResult,
  normalizeFridgeScanRecordState,
} from '@/shared/fridgeScanContract';

describe('fridgeScanContract', () => {
  it('normalizes a valid meal result and fills stable optional keys', () => {
    const normalized = normalizeFridgeMealResult({
      schema_version: FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
      mode_selected: 'diet',
      proposal_status: 'complete',
      recipe_title: '  Poelee legere oeufs-epinards  ',
      short_summary:
        '  Un plat chaud, simple et rassasiant avec ce qui semble deja visible.  ',
      ingredients_detected: [
        'oeufs',
        'epinards',
        'tomates cerises',
        'oeufs',
        '  ',
      ],
      ingredients_used: ['oeufs', 'epinards', 'tomates cerises'],
      preparation_steps: [
        ' Faites tomber les epinards a la poele. ',
        'Ajoutez les oeufs et melangez doucement.',
        'Servez avec les tomates a cote.',
      ],
      why_this_fits_the_goal: [
        'Base plutot legere et simple a digerer.',
        "Les oeufs apportent un cote rassasiant sans alourdir l'assiette.",
      ],
      nutrition_estimate: {
        calories_band: 'light',
        protein_band: 'medium',
      },
    });

    expect(normalized).toEqual({
      schema_version: FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
      mode_selected: 'diet',
      proposal_status: 'complete',
      recipe_title: 'Poelee legere oeufs-epinards',
      short_summary:
        'Un plat chaud, simple et rassasiant avec ce qui semble deja visible.',
      ingredients_detected: ['oeufs', 'epinards', 'tomates cerises'],
      ingredients_used: ['oeufs', 'epinards', 'tomates cerises'],
      optional_additions: [],
      preparation_steps: [
        'Faites tomber les epinards a la poele.',
        'Ajoutez les oeufs et melangez doucement.',
        'Servez avec les tomates a cote.',
      ],
      why_this_fits_the_goal: [
        'Base plutot legere et simple a digerer.',
        "Les oeufs apportent un cote rassasiant sans alourdir l'assiette.",
      ],
      nutrition_estimate: {
        calories_band: 'light',
        protein_band: 'medium',
        note: null,
      },
      substitutions: [],
      tips: [],
      caution_note: null,
    });
  });

  it('rejects a meal result when used ingredients are outside detected ingredients', () => {
    expect(
      normalizeFridgeMealResult({
        schema_version: FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
        mode_selected: 'gourmand',
        proposal_status: 'limited',
        recipe_title: 'Tartines chaudes fromage-tomate',
        short_summary: 'Une idee tres simple mais plaisante.',
        ingredients_detected: ['pain', 'fromage'],
        ingredients_used: ['pain', 'tomate'],
        optional_additions: [],
        preparation_steps: ['Pose la tomate sur le pain.'],
        why_this_fits_the_goal: ['Le mode gourmand privilegie le cote chaud.'],
        nutrition_estimate: {
          calories_band: 'moderate',
          protein_band: 'low',
          note: 'Option simple et plaisir.',
        },
        substitutions: [],
        tips: [],
        caution_note: null,
      }),
    ).toBeNull();
  });

  it('rejects a needs_additions result without simple additions', () => {
    expect(
      normalizeFridgeMealResult({
        schema_version: FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
        mode_selected: 'muscle_gain',
        proposal_status: 'needs_additions',
        recipe_title: 'Assiette proteinee oeufs-dinde',
        short_summary:
          'Une base tres proteinee qui devient un vrai repas avec un accompagnement simple.',
        ingredients_detected: ['oeufs', 'blanc de dinde', 'tomates'],
        ingredients_used: ['oeufs', 'blanc de dinde', 'tomates'],
        optional_additions: [],
        preparation_steps: ['Poelez rapidement les oeufs.'],
        why_this_fits_the_goal: ['La base visible est deja orientee proteines.'],
        nutrition_estimate: {
          calories_band: 'moderate',
          protein_band: 'high',
          note: 'Base proteinee.',
        },
        substitutions: [],
        tips: [],
        caution_note: null,
      }),
    ).toBeNull();
  });

  it('normalizes a fridge scan record envelope with a processed meal result', () => {
    const normalized = normalizeFridgeScanRecordState({
      status: 'processed',
      meal_result: {
        schema_version: FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
        mode_selected: 'gourmand',
        proposal_status: 'limited',
        recipe_title: 'Tartines chaudes fromage-tomate',
        short_summary:
          "Peu d'elements ressortent nettement, donc je pars sur une idee tres simple mais plaisante.",
        ingredients_detected: ['pain', 'fromage', 'tomate'],
        ingredients_used: ['pain', 'fromage', 'tomate'],
        optional_additions: [],
        preparation_steps: [
          'Pose la tomate sur le pain.',
          'Ajoute le fromage par-dessus.',
          'Fais gratiner quelques minutes jusqu a ce que ce soit fondant.',
        ],
        why_this_fits_the_goal: [
          'Le mode gourmand privilegie ici le chaud et le fondant.',
        ],
        nutrition_estimate: {
          calories_band: 'moderate',
          protein_band: 'low',
          note: 'Option simple et plaisir.',
        },
        substitutions: [],
        tips: ['Ajoute un tour de poivre si tu en as deja sous la main.'],
        caution_note:
          'La photo semble partielle, donc la proposition reste volontairement tres simple.',
      },
      error_code: null,
      error_message: null,
      processed_at: '2026-04-22T10:20:00.000Z',
    });

    expect(normalized?.status).toBe('processed');
    expect(normalized?.meal_result?.mode_selected).toBe('gourmand');
    expect(normalized?.processed_at).toBe('2026-04-22T10:20:00.000Z');
  });

  it('builds the internal fridge scan webhook payload with inline image data', () => {
    expect(
      buildFridgeScanWebhookPayload({
        requestId: 'req-1',
        fridgeScanId: 'scan-1',
        callbackNonce: 'nonce-1',
        userId: 'user-1',
        locale: 'fr-FR',
        source: 'camera',
        selectedMode: 'diet',
        queuedAt: '2026-05-01T10:20:00.000Z',
        imageBase64: 'VERY_SECRET_IMAGE_BASE64',
        imagePath: 'user-1/fridge-scans/scan-1.jpg',
        clientMetadata: {
          screen: 'fridge_scan',
        },
      }),
    ).toEqual({
      payload_version: 1,
      request_id: 'req-1',
      fridge_scan_id: 'scan-1',
      callback_nonce: 'nonce-1',
      user_id: 'user-1',
      locale: 'fr-FR',
      source: 'camera',
      selected_mode: 'diet',
      queued_at: '2026-05-01T10:20:00.000Z',
      image_base64: 'VERY_SECRET_IMAGE_BASE64',
      image: {
        bucket: 'scan-images',
        path: 'user-1/fridge-scans/scan-1.jpg',
        content_type: 'image/jpeg',
      },
      client_metadata: {
        screen: 'fridge_scan',
      },
    });
  });

  it('normalizes a successful completion payload for the callback contract', () => {
    const normalized = normalizeFridgeScanCompletionPayload({
      fridge_scan_id: 'scan-1',
      request_id: 'req-1',
      callback_nonce: 'nonce-1',
      success: true,
      data: {
        schema_version: FRIDGE_MEAL_RESULT_SCHEMA_VERSION,
        mode_selected: 'muscle_gain',
        proposal_status: 'needs_additions',
        recipe_title: 'Bol proteine express',
        short_summary: 'Une base simple a completer avec un glucide.',
        ingredients_detected: ['oeufs', 'dinde', 'tomate'],
        ingredients_used: ['oeufs', 'dinde'],
        optional_additions: ['riz'],
        preparation_steps: ['Poele les oeufs.', 'Ajoute la dinde.', 'Sers avec la tomate.'],
        why_this_fits_the_goal: ['Base riche en proteines.'],
        nutrition_estimate: {
          calories_band: 'moderate',
          protein_band: 'high',
          note: null,
        },
      },
      raw_output: {
        summarized: true,
      },
    });

    expect(normalized).toMatchObject({
      fridge_scan_id: 'scan-1',
      request_id: 'req-1',
      callback_nonce: 'nonce-1',
      success: true,
    });
    expect(normalized?.data).toMatchObject({
      mode_selected: 'muscle_gain',
      optional_additions: ['riz'],
      substitutions: [],
      tips: [],
    });
  });

  it('normalizes a failed completion payload with an ErrorResult', () => {
    expect(
      normalizeFridgeScanCompletionPayload({
        fridge_scan_id: 'scan-1',
        callback_nonce: 'nonce-1',
        success: false,
        data: {
          scan_type: 'error',
          message: 'Analyse impossible. Reprenez une photo plus claire.',
        },
      }),
    ).toEqual({
      fridge_scan_id: 'scan-1',
      callback_nonce: 'nonce-1',
      success: false,
      data: {
        scan_type: 'error',
        message: 'Analyse impossible. Reprenez une photo plus claire.',
      },
    });
  });

  it('rejects completion payloads that do not fit the declared success flag', () => {
    expect(
      normalizeFridgeScanCompletionPayload({
        fridge_scan_id: 'scan-1',
        callback_nonce: 'nonce-1',
        success: true,
        data: {
          scan_type: 'error',
          message: 'Should be rejected for success=true',
        },
      }),
    ).toBeNull();
  });
});
