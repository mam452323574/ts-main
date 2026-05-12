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
  test('uses a wrapped schema with payload anyOf instead of top-level oneOf', () => {
    const schema =
      getNode('OpenAI Chat Model').parameters.options.textFormat.textOptions[0]
        .schema;

    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining(['result_type', 'payload']),
    );
    expect(schema).not.toHaveProperty('oneOf');
    expect(schema.properties.payload.anyOf).toHaveLength(2);
  });

  test('builds multilingual prompts that describe the wrapper and forbid message-only output', () => {
    const fr = runCodeNode('Normalize inbound fridge scan', {
      body: {
        fridge_scan_id: 'scan-fr',
        callback_nonce: 'nonce-fr',
        image_base64: 'ZmFrZQ==',
        selected_mode: 'gourmand',
        locale: 'fr',
      },
    })[0].json;

    const en = runCodeNode('Normalize inbound fridge scan', {
      body: {
        fridge_scan_id: 'scan-en',
        callback_nonce: 'nonce-en',
        image_base64: 'ZmFrZQ==',
        selected_mode: 'gourmand',
        locale: 'en',
      },
    })[0].json;

    expect(fr.chef_system_prompt).toContain('result_type');
    expect(fr.chef_system_prompt).toContain('payload');
    expect(fr.chef_system_prompt).toContain('{"message":"..."}');
    expect(fr.chef_user_prompt).toContain('JSON final enveloppe');

    expect(en.chef_system_prompt).toContain('result_type');
    expect(en.chef_system_prompt).toContain('payload');
    expect(en.chef_system_prompt).toContain('{"message":"..."}');
    expect(en.chef_user_prompt).toContain('final wrapped JSON');
  });

  test('rewires the LLM branch through a pre-LLM merge and preserves prompts in the context snapshot', () => {
    const preLlmMerge = getNode('Merge LLM Input + Context');
    const basicLlmInputs = findIncomingMainConnections('Basic LLM Chain');
    const preLlmMergeInputs =
      findIncomingMainConnections('Merge LLM Input + Context');

    expect(preLlmMerge.type).toBe('n8n-nodes-base.merge');
    expect(preLlmMerge.parameters.mode).toBe('combine');
    expect(preLlmMerge.parameters.combineBy).toBe('combineByPosition');

    expect(basicLlmInputs.map((connection) => connection.sourceName)).toContain(
      'Merge LLM Input + Context',
    );
    expect(
      basicLlmInputs.map((connection) => connection.sourceName),
    ).not.toContain('Convert to File');

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

    const snapshot = runCodeNode('Snapshot callback context', {
      fridge_scan_id: 'scan-topology',
      request_id: 'req-topology',
      callback_nonce: 'nonce-topology',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
      chef_system_prompt: 'SYSTEM_PROMPT',
      chef_user_prompt: 'USER_PROMPT',
    })[0].json;

    expect(snapshot.chef_system_prompt).toBe('SYSTEM_PROMPT');
    expect(snapshot.chef_user_prompt).toBe('USER_PROMPT');
    expect(snapshot.callback_context).toEqual({
      fridge_scan_id: 'scan-topology',
      request_id: 'req-topology',
      callback_nonce: 'nonce-topology',
      selected_mode: 'gourmand',
      language: 'fr',
      locale: 'fr',
    });
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
