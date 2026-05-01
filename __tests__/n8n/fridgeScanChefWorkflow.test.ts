import fs from 'fs';
import path from 'path';

const workflowPath = path.join(
  process.cwd(),
  'n8n',
  'workflows',
  'fridge-scan-chef.json',
);

function readWorkflow() {
  return JSON.parse(fs.readFileSync(workflowPath, 'utf8')) as {
    nodes: Array<{
      name: string;
      type: string;
      parameters?: Record<string, any>;
    }>;
    connections: Record<string, any>;
  };
}

function getNode(workflow: ReturnType<typeof readWorkflow>, name: string) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) {
    throw new Error(`Missing node ${name}`);
  }

  return node;
}

describe('fridge scan n8n workflow', () => {
  it('responds to the app before running the slow Chef pipeline', () => {
    const workflow = readWorkflow();

    expect(getNode(workflow, 'Webhook').parameters).toMatchObject({
      responseMode: 'responseNode',
      path: 'frigo',
    });
    expect(workflow.connections.Webhook.main[0][0].node).toBe(
      'Normalize inbound fridge scan',
    );
    expect(
      workflow.connections['Normalize inbound fridge scan'].main[0][0].node,
    ).toBe('Respond to App');
    expect(workflow.connections['Respond to App'].main[0][0].node).toBe(
      'If normalized payload',
    );
  });

  it('normalizes both n8n webhook body and root payload shapes', () => {
    const workflow = readWorkflow();
    const normalizeNode = getNode(workflow, 'Normalize inbound fridge scan');

    expect(normalizeNode.parameters?.jsCode).toContain('const root = $json');
    expect(normalizeNode.parameters?.jsCode).toContain('const body = root.body');
    expect(normalizeNode.parameters?.jsCode).toContain('const input = body ?? root');
    expect(normalizeNode.parameters?.jsCode).toContain('callback_nonce');
    expect(normalizeNode.parameters?.jsCode).toContain('image_path');
  });

  it('downloads and normalizes the image into the binary data field expected by OpenAI', () => {
    const workflow = readWorkflow();
    const downloadNode = getNode(workflow, 'Download image');
    const normalizeDownloadNode = getNode(workflow, 'Normalize download result');
    const detectNode = getNode(workflow, 'Detect ingredients');

    expect(downloadNode.parameters?.options).toMatchObject({
      response: {
        response: {
          responseFormat: 'file',
          outputPropertyName: 'data',
          neverError: true,
        },
      },
    });
    expect(normalizeDownloadNode.parameters?.jsCode).toContain(
      '$input.item.binary ?? {}',
    );
    expect(normalizeDownloadNode.parameters?.jsCode).toContain(
      'binary.data ??',
    );
    expect(normalizeDownloadNode.parameters?.jsCode).toContain(
      'binary_field_name',
    );
    expect(detectNode.parameters).toMatchObject({
      inputType: 'base64',
      binaryPropertyName: 'data',
    });
  });

  it('guards OpenAI analysis behind a binary download check without the legacy merge', () => {
    const workflow = readWorkflow();

    expect(workflow.connections['Normalize download result'].main[0][0].node).toBe(
      'If image downloaded',
    );
    expect(workflow.connections['If image downloaded'].main[0][0]).toEqual(
      expect.objectContaining({
        node: 'Detect ingredients',
        type: 'main',
        index: 0,
      }),
    );
    expect(workflow.connections['If image downloaded'].main[1][0]).toEqual(
      expect.objectContaining({
        node: 'Build fallback completion',
        type: 'main',
        index: 0,
      }),
    );
    expect(workflow.nodes.map((node) => node.name)).not.toContain(
      'Merge Download + Meta1',
    );
    expect(workflow.nodes.map((node) => node.name)).not.toContain(
      'Keep fridge meta1',
    );
  });

  it('signs a compact HMAC callback for the Supabase completion function', () => {
    const workflow = readWorkflow();
    const signNode = getNode(workflow, 'Build signed callback');
    const completeNode = getNode(workflow, 'Complete fridge scan');

    expect(signNode.parameters?.jsCode).toContain('createHmac');
    expect(signNode.parameters?.jsCode).toContain('PHASE2_WEBHOOK_HMAC_SECRET');
    expect(signNode.parameters?.jsCode).toContain('slice(0, 1200)');
    expect(completeNode.parameters?.url).toContain('/functions/v1/fridge-scan-complete');
    expect(JSON.stringify(completeNode.parameters)).toContain('x-webhook-timestamp');
    expect(JSON.stringify(completeNode.parameters)).toContain('x-webhook-signature');
  });

  it('does not contain deployed webhook URLs or literal JWT-style secrets', () => {
    const rawWorkflow = fs.readFileSync(workflowPath, 'utf8');

    expect(rawWorkflow).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i);
    expect(rawWorkflow).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(rawWorkflow).not.toContain('FRIDGE_SCAN_WEBHOOK_SECRET');
  });
});
