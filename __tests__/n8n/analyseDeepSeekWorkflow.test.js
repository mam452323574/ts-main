const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(
  process.cwd(),
  'n8n',
  'workflows',
  'analyse_deepseek.json',
);

function readWorkflow() {
  return JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
}

function getNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Missing workflow node: ${name}`);
  return node;
}

describe('analyse_deepseek n8n workflow export', () => {
  it('is reproducible from the hardened analyse_1 template', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/build-scan-deepseek-workflow.mjs', '--check'],
        { cwd: process.cwd(), stdio: 'pipe' },
      )
    ).not.toThrow();
  });

  it('ships inactive with its own webhook and the existing HMAC chain', () => {
    const workflow = readWorkflow();

    expect(workflow.name).toBe('analyse_deepseek');
    expect(workflow.active).toBe(false);
    expect(workflow.id).toBeUndefined();
    expect(workflow.settings.timezone).toBe('Europe/Paris');
    expect(getNode(workflow, 'Webhook').parameters).toMatchObject({
      httpMethod: 'POST',
      path: 'analyse_deepseek',
      responseMode: 'responseNode',
    });
    expect(workflow.connections.Webhook.main[0][0].node).toBe(
      'Verify Coach Webhook HMAC (analyse_deepseek)',
    );
    expect(
      workflow.connections['Verify Coach Webhook HMAC (analyse_deepseek)']
        .main[0][0].node,
    ).toBe('Smoke Switch (analyse_deepseek)');
    expect(
      workflow.connections['Sign Webhook Response (analyse_deepseek)']
        .main[0][0].node,
    ).toBe('Respond to Webhook1');
  });

  it('keeps the image base64 in JSON until the DeepSeek HTTP request', () => {
    const workflow = readWorkflow();
    const removedNodeNames = [
      'Convert to File',
      'Snapshot Analyse Context',
      'Merge Image + Analyse Context',
    ];

    for (const nodeName of removedNodeNames) {
      expect(workflow.nodes.some((node) => node.name === nodeName)).toBe(false);
      expect(workflow.connections).not.toHaveProperty(nodeName);
    }
    expect(
      workflow.connections['Normalize Analyse Input'].main[0],
    ).toEqual([{
      node: 'Determine Scan Route',
      type: 'main',
      index: 0,
    }]);
  });

  it('uses DeepSeek Vision with JSON output on every standard scan branch', () => {
    const workflow = readWorkflow();
    const rawWorkflow = fs.readFileSync(workflowPath, 'utf8');
    const analysisNodes = [
      'Analyze Face Image',
      'Analyze Body Image',
      'Analyze Nutrition Image',
      'Analyze Image Auto Detect Fallback',
    ].map((name) => getNode(workflow, name));

    expect(rawWorkflow).not.toContain('gpt-4o-mini');
    expect(rawWorkflow).not.toContain('@n8n/n8n-nodes-langchain.openAi');
    expect(rawWorkflow).not.toContain('@n8n/n8n-nodes-langchain.googleGemini');

    for (const node of analysisNodes) {
      expect(node.type).toBe('n8n-nodes-base.httpRequest');
      expect(node.typeVersion).toBe(4.2);
      expect(node.parameters).toMatchObject({
        method: 'POST',
        url: 'https://api.deepseek.com/chat/completions',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'deepSeekApi',
        contentType: 'raw',
        rawContentType: 'application/json',
        options: { timeout: 60_000 },
      });
      expect(node.parameters.body).toContain(
        'deepseek-v4-flash-vision-exp',
      );
      expect(node.parameters.body).toContain(
        '"data:image/jpeg;base64," + $json.body.imageBase64',
      );
      expect(node.parameters.body).toContain(
        'response_format: { type: "json_object" }',
      );
      expect(node.parameters.body).toContain('max_tokens: 8192');
      expect(node.credentials).toEqual({
        deepSeekApi: { name: 'DeepSeek account' },
      });
    }
  });

  it('preserves the specialized prompts and shared final normalizer', () => {
    const workflow = readWorkflow();
    const faceRequest = getNode(workflow, 'Analyze Face Image').parameters.body;
    const bodyRequest = getNode(workflow, 'Analyze Body Image').parameters.body;
    const nutritionRequest = getNode(
      workflow,
      'Analyze Nutrition Image',
    ).parameters.body;

    expect(faceRequest).toContain('analyzable human face');
    expect(bodyRequest).toContain('Do not sexualize the person.');
    expect(nutritionRequest).toContain('Calories and macros are visual approximations.');
    for (const request of [faceRequest, bodyRequest, nutritionRequest]) {
      expect(request).toContain('String($json.language_code || "en")');
      expect(request).toContain('Return exactly one valid JSON object.');
    }

    for (const nodeName of [
      'Analyze Face Image',
      'Analyze Body Image',
      'Analyze Nutrition Image',
      'Analyze Image Auto Detect Fallback',
    ]) {
      expect(workflow.connections[nodeName].main[0][0].node).toBe(
        'Code in JavaScript',
      );
    }
  });
});
