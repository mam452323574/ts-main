const fs = require('fs');
const path = require('path');

const workflowPath = path.join(
  __dirname,
  '..',
  '..',
  'n8n',
  'workflows',
  'fridge-scan-chef.json',
);

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

function getNode(name) {
  const node = workflow.nodes.find((entry) => entry.name === name);
  if (!node) {
    throw new Error(`Missing workflow node: ${name}`);
  }
  return node;
}

function findIncomingMainConnections(targetName) {
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

function runCodeNode(name, payload) {
  const jsCode = getNode(name).parameters.jsCode;
  const executor = new Function('$json', jsCode);
  return executor(payload);
}

function buildRecipe(overrides = {}) {
  return {
    schema_version: 1,
    mode_selected: 'gourmand',
    proposal_status: 'complete',
    recipe_title: 'Poelee verte',
    short_summary: 'Un melange rapide de legumes poeles.',
    ingredients_detected: ['brocoli', 'tomate', 'champignon'],
    ingredients_used: ['brocoli', 'champignon'],
    optional_additions: [],
    preparation_steps: ['Coupez les legumes.', 'Poelez doucement.', 'Servez chaud.'],
    why_this_fits_the_goal: ['Savoureux', 'Simple a preparer'],
    nutrition_estimate: {
      calories_band: 'light',
      protein_band: 'low',
      note: 'Plat leger.',
    },
    substitutions: [],
    tips: ['Ajoutez des herbes fraiches.'],
    caution_note: null,
    ...overrides,
  };
}

describe('fridge-scan chef workflow export', () => {
  test('keeps the chat model bounded while response validation remains code-owned', () => {
    const modelParameters = getNode('OpenAI Chat Model').parameters;
    const validationCode = getNode('Validate completion').parameters.jsCode;

    expect(modelParameters.model.value).toBe('gpt-4o-mini');
    expect(modelParameters.options).toMatchObject({
      maxTokens: 1200,
      temperature: 0.3,
    });
    expect(modelParameters.options).not.toHaveProperty('textFormat');
    expect(validationCode).toContain('result_type');
    expect(validationCode).toContain('payload');
  });

  test('normalizes inbound chef payloads without embedding prompts in the callback context', () => {
    const fr = runCodeNode('Normalize inbound fridge scan', {
      body: {
        fridge_scan_id: 'scan-fr',
        callback_nonce: 'nonce-fr',
        image_base64: 'ZmFrZQ==',
        selected_mode: 'gourmand',
        locale: 'fr',
      },
    })[0].json;

    const sporty = runCodeNode('Normalize inbound fridge scan', {
      body: {
        fridge_scan_id: 'scan-en',
        callback_nonce: 'nonce-en',
        image_base64: 'ZmFrZQ==',
        selected_mode: 'sportif',
        locale: 'en-US',
      },
    })[0].json;

    expect(fr.language).toBe('fr');
    expect(fr.selected_mode).toBe('gourmand');
    expect(fr.normalized_ok).toBe(true);
    expect(fr).not.toHaveProperty('chef_system_prompt');
    expect(fr).not.toHaveProperty('chef_user_prompt');

    expect(sporty.language).toBe('en');
    expect(sporty.locale).toBe('en-US');
    expect(sporty.selected_mode).toBe('muscle_gain');
    expect(sporty.normalized_ok).toBe(true);
  });

  test('rewires the LLM branch through a switch and branch-specific merges while keeping callback context minimal', () => {
    const preLlmMerge = getNode('Merge LLM Input + Context');
    const switchInputs = findIncomingMainConnections('Switch chef_mode');
    const preLlmMergeInputs =
      findIncomingMainConnections('Merge LLM Input + Context');
    const validateInputs = findIncomingMainConnections('Validate completion');

    expect(preLlmMerge.type).toBe('n8n-nodes-base.merge');
    expect(preLlmMerge.parameters.mode).toBe('combine');
    expect(preLlmMerge.parameters.combineBy).toBe('combineByPosition');

    expect(switchInputs.map((connection) => connection.sourceName)).toContain(
      'Merge LLM Input + Context',
    );
    expect(switchInputs.map((connection) => connection.sourceName)).not.toContain(
      'Convert to File',
    );

    expect(
      preLlmMergeInputs.map(
        (connection) => `${connection.sourceName}:${connection.index}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Convert to File:0',
        'Snapshot callback context:1',
      ]),
    );
    expect(workflow.connections['Switch chef_mode'].main[0][0].node).toBe(
      'Analyze Diet Chef Image',
    );
    expect(workflow.connections['Switch chef_mode'].main[1][0].node).toBe(
      'Analyze Muscle Chef Image',
    );
    expect(workflow.connections['Switch chef_mode'].main[2][0].node).toBe(
      'Analyze Gourmand Chef Image',
    );
    expect(validateInputs.map((connection) => connection.sourceName)).toEqual(
      expect.arrayContaining([
        'Merge Diet Chef + Context',
        'Merge Muscle Chef + Context',
        'Merge Gourmand Chef + Context',
      ]),
    );

    const snapshot = runCodeNode('Snapshot callback context', {
      fridge_scan_id: 'scan-topology',
      request_id: 'req-topology',
      callback_nonce: 'nonce-topology',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
    })[0].json;

    expect(snapshot).not.toHaveProperty('chef_system_prompt');
    expect(snapshot).not.toHaveProperty('chef_user_prompt');
    expect(snapshot.callback_context).toEqual({
      fridge_scan_id: 'scan-topology',
      request_id: 'req-topology',
      callback_nonce: 'nonce-topology',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
    });
  });

  test('defines distinct chef prompts with the same wrapper contract', () => {
    const dietNode = getNode('Analyze Diet Chef Image');
    const muscleNode = getNode('Analyze Muscle Chef Image');
    const gourmandNode = getNode('Analyze Gourmand Chef Image');

    const dietPrompt = dietNode.parameters.text;
    const musclePrompt = muscleNode.parameters.text;
    const gourmandPrompt = gourmandNode.parameters.text;

    expect(dietPrompt).toContain('Requested language code for ALL textual values');
    expect(dietPrompt).toContain('result_type');
    expect(dietPrompt).toContain('payload');
    expect(dietPrompt).toContain('payload.mode_selected must be exactly "diet"');
    expect(dietPrompt).toContain('balance');
    expect(dietPrompt).toContain('lightness');

    expect(musclePrompt).toContain('Requested language code for ALL textual values');
    expect(musclePrompt).toContain('payload.mode_selected must be exactly "muscle_gain"');
    expect(musclePrompt).toContain('protein density');
    expect(musclePrompt).toContain('performance');
    expect(musclePrompt).toContain('recovery');

    expect(gourmandPrompt).toContain('Requested language code for ALL textual values');
    expect(gourmandPrompt).toContain('payload.mode_selected must be exactly "gourmand"');
    expect(gourmandPrompt).toContain('flavor');
    expect(gourmandPrompt).toContain('comfort');
    expect(gourmandPrompt).toContain('pleasure');

    expect(
      workflow.connections['OpenAI Chat Model'].ai_languageModel[0].map(
        (connection) => connection.node,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Analyze Diet Chef Image',
        'Analyze Muscle Chef Image',
        'Analyze Gourmand Chef Image',
      ]),
    );
  });

  test('accepts wrapped recipe output and preserves the callback contract', () => {
    const result = runCodeNode('Validate completion', {
      text: JSON.stringify({
        result_type: 'recipe',
        payload: buildRecipe(),
      }),
      fridge_scan_id: 'scan-1',
      callback_nonce: 'nonce-1',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
    })[0].json;

    expect(result.success).toBe(true);
    expect(result.data.recipe_title).toBe('Poelee verte');
    expect(result.data.mode_selected).toBe('gourmand');
    expect(result.data).not.toHaveProperty('result_type');
    expect(result.data).not.toHaveProperty('payload');
  });

  test('unwraps n8n message wrappers that contain the actual wrapped recipe JSON', () => {
    const result = runCodeNode('Validate completion', {
      text: JSON.stringify({
        message: JSON.stringify({
          result_type: 'recipe',
          payload: buildRecipe({ recipe_title: 'Wrapped through message' }),
        }),
      }),
      fridge_scan_id: 'scan-double-wrap',
      callback_nonce: 'nonce-double-wrap',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
    })[0].json;

    expect(result.success).toBe(true);
    expect(result.data.recipe_title).toBe('Wrapped through message');
  });

  test('keeps backward compatibility with legacy direct recipe objects', () => {
    const result = runCodeNode('Validate completion', {
      text: JSON.stringify(buildRecipe({ recipe_title: 'Legacy recipe' })),
      fridge_scan_id: 'scan-legacy',
      callback_nonce: 'nonce-legacy',
      selected_mode: 'gourmand',
      language: 'en',
      locale: 'en',
    })[0].json;

    expect(result.success).toBe(true);
    expect(result.data.recipe_title).toBe('Legacy recipe');
  });

  test('classifies message-only model output explicitly', () => {
    const result = runCodeNode('Validate completion', {
      text: JSON.stringify({
        message:
          'Cette image presente une belle variete de legumes frais.',
      }),
      fridge_scan_id: 'scan-message',
      callback_nonce: 'nonce-message',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
    })[0].json;

    expect(result.success).toBe(false);
    expect(result.data.scan_type).toBe('error');
    expect(result.debug_reason).toBe('message_only_output_not_allowed');
  });

  test('passes through wrapped localized error payloads', () => {
    const result = runCodeNode('Validate completion', {
      text: JSON.stringify({
        result_type: 'error',
        payload: {
          scan_type: 'error',
          message: 'Analyse impossible. Veuillez reessayer.',
        },
      }),
      fridge_scan_id: 'scan-error',
      callback_nonce: 'nonce-error',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
    })[0].json;

    expect(result.success).toBe(false);
    expect(result.data).toEqual({
      scan_type: 'error',
      message: 'Analyse impossible. Veuillez reessayer.',
    });
    expect(result.debug_reason).toBe('model_returned_error');
  });
});
