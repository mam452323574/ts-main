import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp';
export const DEEPSEEK_VISION_WEBHOOK_PATH = 'analyse_deepseek';
export const DEEPSEEK_VISION_WORKFLOW_NAME = 'analyse_deepseek';
export const DEEPSEEK_VISION_REQUEST_TIMEOUT_MS = 60_000;

const ANALYSIS_NODE_NAMES = new Set([
  'Analyze Face Image',
  'Analyze Body Image',
  'Analyze Nutrition Image',
  'Analyze Image Auto Detect Fallback',
]);

const GEMINI_BINARY_PREPARATION_NODE_NAMES = new Set([
  'Convert to File',
  'Snapshot Analyse Context',
  'Merge Image + Analyse Context',
]);

const DEFAULT_TEMPLATE_PATH = path.join(
  process.cwd(),
  'n8n',
  'workflows',
  'analyse_1.json',
);
const DEFAULT_OUTPUT_PATH = path.join(
  process.cwd(),
  'n8n',
  'workflows',
  'analyse_deepseek.json',
);

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    if (argument === '--check') {
      flags.add(argument);
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }

  return { flags, values };
}

function buildPromptExpression(promptValue) {
  const prompt = String(promptValue ?? '').replace(/^=/, '');
  const languageMarker = '{{$json.language_code}}';
  return prompt
    .split(languageMarker)
    .map((part) => JSON.stringify(part))
    .join(' + String($json.language_code || "en") + ');
}

export function buildDeepSeekVisionRequestExpression(promptValue) {
  const promptExpression = buildPromptExpression(promptValue);
  return `={{ JSON.stringify({ model: ${JSON.stringify(DEEPSEEK_VISION_MODEL)}, messages: [{ role: "user", content: [{ type: "text", text: ${promptExpression} }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + $json.body.imageBase64, detail: "original" } }] }], response_format: { type: "json_object" }, max_tokens: 8192, temperature: 0.1 }) }}`;
}

function buildDeepSeekCredential(credentialId, credentialName) {
  return {
    ...(credentialId ? { id: credentialId } : {}),
    name: credentialName,
  };
}

function convertAnalysisNode(node, credentialId, credentialName) {
  if (!ANALYSIS_NODE_NAMES.has(node.name)) {
    return node;
  }

  return {
    ...node,
    parameters: {
      method: 'POST',
      url: 'https://api.deepseek.com/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'deepSeekApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: buildDeepSeekVisionRequestExpression(node.parameters?.text),
      options: {
        timeout: DEEPSEEK_VISION_REQUEST_TIMEOUT_MS,
      },
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    credentials: {
      deepSeekApi: buildDeepSeekCredential(credentialId, credentialName),
    },
  };
}

function renameWorkflowNodeReferences(workflow, fromSuffix, toSuffix) {
  const nameMap = new Map();
  for (const node of workflow.nodes) {
    const nextName = node.name.replace(fromSuffix, toSuffix);
    nameMap.set(node.name, nextName);
    node.name = nextName;
  }

  workflow.connections = Object.fromEntries(
    Object.entries(workflow.connections).map(([sourceName, buckets]) => [
      nameMap.get(sourceName) ?? sourceName,
      Object.fromEntries(
        Object.entries(buckets).map(([connectionType, branches]) => [
          connectionType,
          branches.map((branch) =>
            branch.map((connection) => ({
              ...connection,
              node: nameMap.get(connection.node) ?? connection.node,
            })),
          ),
        ]),
      ),
    ]),
  );
}

function rewireDeepSeekInputPath(workflow) {
  workflow.nodes = workflow.nodes.filter(
    (node) => !GEMINI_BINARY_PREPARATION_NODE_NAMES.has(node.name),
  );
  for (const nodeName of GEMINI_BINARY_PREPARATION_NODE_NAMES) {
    delete workflow.connections[nodeName];
  }
  workflow.connections['Normalize Analyse Input'] = {
    main: [[{
      node: 'Determine Scan Route',
      type: 'main',
      index: 0,
    }]],
  };
}

export function buildDeepSeekVisionWorkflow(template, options = {}) {
  const workflow = structuredClone(template);
  const credentialId = options.credentialId ?? null;
  const credentialName = options.credentialName ?? 'DeepSeek account';
  const webhookPath = options.webhookPath ?? DEEPSEEK_VISION_WEBHOOK_PATH;
  const workflowName = options.workflowName ?? DEEPSEEK_VISION_WORKFLOW_NAME;

  workflow.name = workflowName;
  workflow.active = options.active === true;
  workflow.nodes = workflow.nodes.map((node) =>
    convertAnalysisNode(node, credentialId, credentialName));
  rewireDeepSeekInputPath(workflow);

  const webhookNode = workflow.nodes.find((node) => node.name === 'Webhook');
  if (!webhookNode) {
    throw new Error('The analyse workflow template is missing its Webhook node');
  }
  webhookNode.parameters.path = webhookPath;
  webhookNode.webhookId = '7989cb75-8749-4bb4-839a-fc91732b9899';

  renameWorkflowNodeReferences(
    workflow,
    '(analyse_1)',
    '(analyse_deepseek)',
  );

  workflow.settings = {
    ...workflow.settings,
    timezone: 'Europe/Paris',
  };
  delete workflow.id;
  delete workflow.versionId;
  delete workflow.meta;

  return workflow;
}

function serializeWorkflow(workflow) {
  return `${JSON.stringify(workflow, null, 2)}\n`;
}

export function buildWorkflowFile(options = {}) {
  const templatePath = options.templatePath ?? DEFAULT_TEMPLATE_PATH;
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const workflow = buildDeepSeekVisionWorkflow(template, options);
  const serialized = serializeWorkflow(workflow);

  if (options.check === true) {
    const current = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, 'utf8')
      : null;
    if (current !== serialized) {
      throw new Error(
        `${path.relative(process.cwd(), outputPath)} is stale; run node scripts/build-scan-deepseek-workflow.mjs`,
      );
    }
    return workflow;
  }

  fs.writeFileSync(outputPath, serialized, 'utf8');
  return workflow;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { flags, values } = parseArguments(process.argv.slice(2));
  const workflow = buildWorkflowFile({
    active: values.get('--active') === 'true',
    check: flags.has('--check'),
    credentialId:
      values.get('--credential-id') ??
      process.env.N8N_DEEPSEEK_CREDENTIAL_ID ??
      null,
    credentialName:
      values.get('--credential-name') ??
      process.env.N8N_DEEPSEEK_CREDENTIAL_NAME ??
      'DeepSeek account',
    outputPath: values.get('--output')
      ? path.resolve(values.get('--output'))
      : DEFAULT_OUTPUT_PATH,
    templatePath: values.get('--template')
      ? path.resolve(values.get('--template'))
      : DEFAULT_TEMPLATE_PATH,
    webhookPath:
      values.get('--webhook-path') ?? DEEPSEEK_VISION_WEBHOOK_PATH,
    workflowName:
      values.get('--workflow-name') ?? DEEPSEEK_VISION_WORKFLOW_NAME,
  });
  console.log(
    `${flags.has('--check') ? 'Verified' : 'Generated'} ${workflow.name} with ${DEEPSEEK_VISION_MODEL}`,
  );
}
