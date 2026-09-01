import fs from 'node:fs';
import path from 'node:path';
import { buildDeepSeekVisionWorkflow } from './build-scan-deepseek-workflow.mjs';

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }
  return values;
}

function requireValue(values, argument, envName) {
  const value = values.get(argument) ?? process.env[envName];
  if (!value) {
    throw new Error(`${argument} (or ${envName}) is required`);
  }
  return value;
}

function readWorkflow(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8'));
}

function bindCredential(workflow, credentialType, credentialId) {
  const clone = structuredClone(workflow);
  let boundCount = 0;

  for (const node of clone.nodes) {
    const credential = node.credentials?.[credentialType];
    if (!credential) continue;
    credential.id = credentialId;
    boundCount += 1;
  }

  if (boundCount === 0) {
    throw new Error(
      `${workflow.name} has no ${credentialType} credential references`,
    );
  }

  return { workflow: clone, boundCount };
}

function writeWorkflow(outputDir, fileName, workflow) {
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
  return outputPath;
}

const values = parseArguments(process.argv.slice(2));
const outputDir = path.resolve(
  requireValue(values, '--output-dir', 'SCAN_PROVIDER_DEPLOY_OUTPUT_DIR'),
);
const deepSeekCredentialId = requireValue(
  values,
  '--deepseek-credential-id',
  'N8N_DEEPSEEK_CREDENTIAL_ID',
);
const geminiCredentialId = requireValue(
  values,
  '--gemini-credential-id',
  'N8N_GEMINI_CREDENTIAL_ID',
);
const deepSeekWorkflowId = values.get('--deepseek-workflow-id') ?? null;
const canaryWorkflowId = values.get('--canary-workflow-id') ?? null;

fs.mkdirSync(outputDir, { recursive: true });

const fallbackTemplate = readWorkflow('n8n/workflows/analyse_1.json');
const canaryTemplate = readWorkflow('n8n/workflows/scan-provider-canary.json');
const deepSeekWorkflow = buildDeepSeekVisionWorkflow(fallbackTemplate, {
  active: false,
  credentialId: deepSeekCredentialId,
});
if (deepSeekWorkflowId) {
  deepSeekWorkflow.id = deepSeekWorkflowId;
}
const fallback = bindCredential(
  fallbackTemplate,
  'googlePalmApi',
  geminiCredentialId,
);
const canaryWithDeepSeek = bindCredential(
  canaryTemplate,
  'deepSeekApi',
  deepSeekCredentialId,
);
const canary = bindCredential(
  canaryWithDeepSeek.workflow,
  'googlePalmApi',
  geminiCredentialId,
);
if (canaryWorkflowId) {
  canary.workflow.id = canaryWorkflowId;
}

writeWorkflow(outputDir, 'analyse_deepseek.deploy.json', deepSeekWorkflow);
writeWorkflow(outputDir, 'analyse_1.deploy.json', fallback.workflow);
writeWorkflow(outputDir, 'scan-provider-canary.deploy.json', canary.workflow);

console.log(JSON.stringify({
  output_dir: outputDir,
  workflows: [
    { name: deepSeekWorkflow.name, deepseek_credentials_bound: 4 },
    { name: fallback.workflow.name, gemini_credentials_bound: fallback.boundCount },
    {
      name: canary.workflow.name,
      deepseek_credentials_bound: canaryWithDeepSeek.boundCount,
      gemini_credentials_bound: canary.boundCount,
    },
  ],
}));
