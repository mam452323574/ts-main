const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WORKFLOWS = [
  {
    file: 'coach.json',
    webhookName: 'Webhook',
    hmacName: 'Verify Coach Webhook HMAC',
    smokeName: 'Smoke Switch (coach)',
    normalizerName: 'Normalize Coach Input1',
    signName: 'Sign Webhook Response (coach)',
  },
  {
    file: 'coach.json',
    webhookName: 'Webhook Coach Conversation',
    hmacName: 'Verify Coach Conversation Webhook HMAC',
    smokeName: 'Smoke Switch (coach-conversation)',
    normalizerName: 'Normalize Coach Conversation Input',
    signName: 'Sign Webhook Response (coach-conversation)',
  },
  {
    file: 'coach-conversation.json',
    webhookName: 'Webhook Coach Conversation',
    hmacName: 'Verify Coach Conversation Webhook HMAC',
    smokeName: 'Smoke Switch (coach-conversation)',
    normalizerName: 'Normalize Coach Conversation Input',
    signName: 'Sign Webhook Response (coach-conversation)',
  },
];

const AsyncFunction = eval('(async function () {}).constructor');

function loadWorkflow(file) {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'n8n', 'workflows', file),
      'utf8',
    ),
  );
}

function getNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) {
    throw new Error(`Missing workflow node: ${name}`);
  }
  return node;
}

async function runHmacNode(workflow, { name, headers, body, env }) {
  const jsCode = getNode(workflow, name).parameters.jsCode;
  const item = { json: { headers, body }, headers, body };
  const $input = {
    first: () => item,
    all: () => [item],
  };
  const executor = new AsyncFunction('$input', '$env', 'require', 'console', jsCode);

  try {
    return {
      ok: true,
      out: await executor($input, env ?? {}, require, console),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

function makeSignature(secret, timestamp, body) {
  const raw = JSON.stringify(body);
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + raw)
    .digest('hex');
  return 'sha256=' + hmac;
}

describe('Coach webhook HMAC verification nodes', () => {
  for (const config of WORKFLOWS) {
    describe(`${config.file} / ${config.webhookName}`, () => {
      it('routes webhook traffic through HMAC verification and the smoke shortcut', () => {
        const wf = loadWorkflow(config.file);

        expect(getNode(wf, config.hmacName)).toBeDefined();
        expect(getNode(wf, config.smokeName)).toBeDefined();
        expect(wf.connections[config.webhookName].main[0][0].node).toBe(
          config.hmacName,
        );
        expect(wf.connections[config.hmacName].main[0][0].node).toBe(
          config.smokeName,
        );
        expect(wf.connections[config.smokeName].main[0][0].node).toBe(
          config.signName,
        );
        expect(wf.connections[config.smokeName].main[1][0].node).toBe(
          config.normalizerName,
        );
      });

      it('rejects requests with missing HMAC headers', async () => {
        const wf = loadWorkflow(config.file);
        const result = await runHmacNode(wf, {
          name: config.hmacName,
          headers: {},
          body: { hello: 'world' },
          env: { PHASE2_WEBHOOK_HMAC_SECRET: 'test-secret' },
        });

        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/x-webhook-timestamp|x-webhook-signature/);
      });

      it('rejects requests with an invalid HMAC signature', async () => {
        const wf = loadWorkflow(config.file);
        const result = await runHmacNode(wf, {
          name: config.hmacName,
          headers: {
            'x-webhook-timestamp': new Date().toISOString(),
            'x-webhook-signature': 'sha256=' + '0'.repeat(64),
          },
          body: { hello: 'world' },
          env: { PHASE2_WEBHOOK_HMAC_SECRET: 'test-secret' },
        });

        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/signature mismatch/i);
      });

      it('passes valid signatures and marks signing smoke payloads', async () => {
        const wf = loadWorkflow(config.file);
        const timestamp = new Date().toISOString();
        const body = { _smoke_test: 'check_signing_unit' };
        const secret = 'super-secret-with-enough-entropy';
        const signature = makeSignature(secret, timestamp, body);

        const result = await runHmacNode(wf, {
          name: config.hmacName,
          headers: {
            'x-webhook-timestamp': timestamp,
            'x-webhook-signature': signature,
          },
          body,
          env: { PHASE2_WEBHOOK_HMAC_SECRET: secret },
        });

        expect(result.ok).toBe(true);
        expect(result.out[0].json._is_smoke_test).toBe(true);
      });
    });
  }
});
