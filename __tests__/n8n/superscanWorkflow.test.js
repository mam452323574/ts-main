const fs = require('fs');
const path = require('path');

const workflowPath = path.join(
  process.cwd(),
  'n8n',
  'workflows',
  'SUPERSCAN.json',
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

describe('SUPERSCAN n8n workflow export', () => {
  it('routes the webhook through HMAC verification, smoke shortcut, image analysis, signing, and respond', () => {
    const workflow = readWorkflow();

    expect(getNode(workflow, 'Webhook').parameters).toMatchObject({
      httpMethod: 'POST',
      path: 'SUPERSCAN',
      responseMode: 'responseNode',
    });
    expect(workflow.connections.Webhook.main[0][0].node).toBe(
      'Verify Coach Webhook HMAC (SUPERSCAN)',
    );
    expect(
      workflow.connections['Verify Coach Webhook HMAC (SUPERSCAN)'].main[0][0].node,
    ).toBe('Smoke Switch (SUPERSCAN)');
    expect(workflow.connections['Smoke Switch (SUPERSCAN)'].main[0][0].node).toBe(
      'Sign Webhook Response (SUPERSCAN)',
    );
    expect(workflow.connections['Smoke Switch (SUPERSCAN)'].main[1][0].node).toBe(
      'Code in JavaScript3',
    );
    expect(workflow.connections['Code in JavaScript3'].main[0][0].node).toBe(
      'Analyze an image1',
    );
    expect(workflow.connections['Analyze an image1'].main[0][0].node).toBe(
      'Code in JavaScript2',
    );
    expect(workflow.connections['Code in JavaScript2'].main[0][0].node).toBe(
      'Sign Webhook Response (SUPERSCAN)',
    );
    expect(
      workflow.connections['Sign Webhook Response (SUPERSCAN)'].main[0][0].node,
    ).toBe('Respond to Webhook1');
  });

  it('defines signed JSON response headers for Supabase response verification', () => {
    const workflow = readWorkflow();
    const verifyNode = getNode(workflow, 'Verify Coach Webhook HMAC (SUPERSCAN)');
    const signNode = getNode(workflow, 'Sign Webhook Response (SUPERSCAN)');
    const respondNode = getNode(workflow, 'Respond to Webhook1');

    expect(verifyNode.parameters.jsCode).toContain('PHASE2_WEBHOOK_HMAC_SECRET');
    expect(verifyNode.parameters.jsCode).toContain('_is_smoke_test');
    expect(signNode.parameters.jsCode).toContain('x-webhook-response-timestamp');
    expect(signNode.parameters.jsCode).toContain('x-webhook-response-signature');
    expect(respondNode.parameters).toMatchObject({
      responseBody: '={{ $json.body }}',
      options: {
        responseHeaders: {
          entries: expect.arrayContaining([
            expect.objectContaining({ name: 'x-webhook-response-timestamp' }),
            expect.objectContaining({ name: 'x-webhook-response-signature' }),
          ]),
        },
      },
    });
  });
});
