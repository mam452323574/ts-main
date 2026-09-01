const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(
  process.cwd(),
  'n8n',
  'workflows',
  'scan-provider-canary.json',
);

function readWorkflow() {
  return JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
}

function getNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Missing workflow node: ${name}`);
  return node;
}

describe('scan provider daily canary workflow', () => {
  it('runs daily at 06:00 in Europe/Paris', () => {
    const workflow = readWorkflow();
    const schedule = getNode(workflow, 'Daily 06:00 Europe Paris');

    expect(workflow.settings.timezone).toBe('Europe/Paris');
    expect(schedule.type).toBe('n8n-nodes-base.scheduleTrigger');
    expect(schedule.parameters.rule.interval).toEqual([{
      field: 'cronExpression',
      expression: '0 6 * * *',
    }]);
    expect(getNode(workflow, 'Manual Canary Trigger').type).toBe(
      'n8n-nodes-base.executeWorkflowTrigger',
    );
    expect(workflow.connections['Manual Canary Trigger']).toEqual(
      workflow.connections['Daily 06:00 Europe Paris'],
    );
  });

  it('checks DeepSeek and Gemini with one output token each', () => {
    const workflow = readWorkflow();
    const deepSeek = getNode(workflow, 'Canary DeepSeek');
    const gemini = getNode(workflow, 'Canary Gemini');

    expect(deepSeek.parameters.body).toContain('deepseek-v4-flash');
    expect(deepSeek.parameters.body).toContain('max_tokens: 1');
    expect(deepSeek.parameters.nodeCredentialType).toBe('deepSeekApi');
    expect(deepSeek.credentials.deepSeekApi.name).toBe('DeepSeek account');

    expect(gemini.parameters.url).toContain('gemini-2.5-flash:generateContent');
    expect(gemini.parameters.body).toContain('maxOutputTokens: 1');
    expect(gemini.parameters.nodeCredentialType).toBe('googlePalmApi');
    expect(gemini.credentials.googlePalmApi.name).toBe(
      'Google Gemini(PaLM) Api account',
    );

    for (const node of [deepSeek, gemini]) {
      expect(node.parameters.options).toMatchObject({
        timeout: 15_000,
        response: {
          response: {
            fullResponse: true,
            neverError: true,
            responseFormat: 'json',
          },
        },
      });
      expect(node.continueOnFail).toBe(true);
    }
  });

  it('keeps observability in logs and contains no notification node', () => {
    const workflow = readWorkflow();
    const nodeTypes = workflow.nodes.map((node) => node.type);
    const logNodes = [
      getNode(workflow, 'Log DeepSeek Canary'),
      getNode(workflow, 'Log Gemini Canary'),
    ];

    expect(nodeTypes.some((type) => /email|slack|notification/i.test(type))).toBe(false);
    for (const node of logNodes) {
      expect(node.type).toBe('n8n-nodes-base.code');
      expect(node.parameters.jsCode).toContain('[scan-provider-canary]');
      expect(node.parameters.jsCode).not.toContain('body:');
      expect(node.parameters.jsCode).not.toContain('apiKey');
    }
  });
});
