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

    expect(normalizeNode.parameters?.jsCode).toContain('const root=$json');
    expect(normalizeNode.parameters?.jsCode).toContain('const body=root.body');
    expect(normalizeNode.parameters?.jsCode).toContain('const input=body??root');
    expect(normalizeNode.parameters?.jsCode).toContain('callback_nonce');
    expect(normalizeNode.parameters?.jsCode).toContain('image_base64');
  });

  it('converts the normalized base64 image into the binary field expected by OpenAI', () => {
    const workflow = readWorkflow();
    const convertNode = getNode(workflow, 'Convert to File');
    const llmNodes = [
      getNode(workflow, 'Analyze Diet Chef Image'),
      getNode(workflow, 'Analyze Muscle Chef Image'),
      getNode(workflow, 'Analyze Gourmand Chef Image'),
    ];

    expect(convertNode.parameters).toMatchObject({
      operation: 'toBinary',
      sourceProperty: 'image_base64',
    });
    for (const llmNode of llmNodes) {
      expect(JSON.stringify(llmNode.parameters)).toContain('imageBinary');
      expect(JSON.stringify(llmNode.parameters)).toContain('binaryImageDataKey');
      expect(JSON.stringify(llmNode.parameters)).toContain('data');
    }
  });

  it('guards OpenAI analysis behind the normalized payload branch and routes through chef-specific branches', () => {
    const workflow = readWorkflow();

    expect(workflow.connections['If normalized payload'].main[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: 'Convert to File',
          type: 'main',
          index: 0,
        }),
        expect.objectContaining({
          node: 'Snapshot callback context',
          type: 'main',
          index: 0,
        }),
      ]),
    );
    expect(workflow.connections['Convert to File'].main[0][0].node).toBe(
      'Merge LLM Input + Context',
    );
    expect(workflow.connections['Snapshot callback context'].main[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: 'Merge LLM Input + Context',
          type: 'main',
          index: 1,
        }),
        expect.objectContaining({
          node: 'Merge Diet Chef + Context',
          type: 'main',
          index: 1,
        }),
        expect.objectContaining({
          node: 'Merge Muscle Chef + Context',
          type: 'main',
          index: 1,
        }),
        expect.objectContaining({
          node: 'Merge Gourmand Chef + Context',
          type: 'main',
          index: 1,
        }),
      ]),
    );
    expect(workflow.connections['Merge LLM Input + Context'].main[0][0].node).toBe(
      'Switch chef_mode',
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
    expect(workflow.connections['Analyze Diet Chef Image'].main[0][0].node).toBe(
      'Merge Diet Chef + Context',
    );
    expect(workflow.connections['Analyze Muscle Chef Image'].main[0][0].node).toBe(
      'Merge Muscle Chef + Context',
    );
    expect(workflow.connections['Analyze Gourmand Chef Image'].main[0][0].node).toBe(
      'Merge Gourmand Chef + Context',
    );
    expect(workflow.connections['Merge Diet Chef + Context'].main[0][0].node).toBe(
      'Validate completion',
    );
    expect(workflow.connections['Merge Muscle Chef + Context'].main[0][0].node).toBe(
      'Validate completion',
    );
    expect(
      workflow.connections['Merge Gourmand Chef + Context'].main[0][0].node,
    ).toBe('Validate completion');
    expect(
      workflow.connections['OpenAI Chat Model'].ai_languageModel[0].map(
        (connection: { node: string }) => connection.node,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Analyze Diet Chef Image',
        'Analyze Muscle Chef Image',
        'Analyze Gourmand Chef Image',
      ]),
    );
    expect(workflow.nodes.map((node) => node.name)).not.toContain(
      'Merge Download + Meta1',
    );
    expect(workflow.nodes.map((node) => node.name)).not.toContain(
      'Keep fridge meta1',
    );
  });

  it('defines distinct prompts for each chef branch while keeping the same wrapper contract', () => {
    const workflow = readWorkflow();
    const dietNode = getNode(workflow, 'Analyze Diet Chef Image');
    const muscleNode = getNode(workflow, 'Analyze Muscle Chef Image');
    const gourmandNode = getNode(workflow, 'Analyze Gourmand Chef Image');

    expect(dietNode.parameters?.text).toContain('result_type');
    expect(dietNode.parameters?.text).toContain('payload');
    expect(dietNode.parameters?.text).toContain('payload.mode_selected must be exactly "diet"');
    expect(dietNode.parameters?.text).toContain('balance');
    expect(dietNode.parameters?.text).toContain('lightness');

    expect(muscleNode.parameters?.text).toContain('result_type');
    expect(muscleNode.parameters?.text).toContain('payload');
    expect(muscleNode.parameters?.text).toContain(
      'payload.mode_selected must be exactly "muscle_gain"',
    );
    expect(muscleNode.parameters?.text).toContain('protein density');
    expect(muscleNode.parameters?.text).toContain('recovery');

    expect(gourmandNode.parameters?.text).toContain('result_type');
    expect(gourmandNode.parameters?.text).toContain('payload');
    expect(gourmandNode.parameters?.text).toContain(
      'payload.mode_selected must be exactly "gourmand"',
    );
    expect(gourmandNode.parameters?.text).toContain('flavor');
    expect(gourmandNode.parameters?.text).toContain('comfort');
    expect(gourmandNode.parameters?.text).toContain('pleasure');
  });

  it('signs a compact HMAC callback for the Supabase completion function', () => {
    const workflow = readWorkflow();
    const signNode = getNode(workflow, 'Build signed callback');
    const completeNode = getNode(workflow, 'Complete fridge scan');

    expect(signNode.parameters?.jsCode).toContain('createHmac');
    expect(signNode.parameters?.jsCode).toContain('PHASE2_WEBHOOK_HMAC_SECRET');
    expect(signNode.parameters?.jsCode).toContain('slice(0,1200)');
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
