const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WORKFLOWS = [
  {
    file: 'coach.json',
    webhookName: 'Webhook',
    hmacName: 'Verify Coach Webhook HMAC',
    normalizerName: 'Normalize Coach Input1',
  },
  {
    file: 'coach-conversation.json',
    webhookName: 'Webhook Coach Conversation',
    hmacName: 'Verify Coach Conversation Webhook HMAC',
    normalizerName: 'Normalize Coach Conversation Input',
  },
];

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

function runHmacNode(workflow, { name, headers, body, env }) {
  const jsCode = getNode(workflow, name).parameters.jsCode;
  const item = { json: { headers, body }, headers, body };
  const $input = {
    first: () => item,
    all: () => [item],
  };
  const savedEnv = {
    enforce: process.env.COACH_WEBHOOK_HMAC_ENFORCE,
    secret: process.env.COACH_WEBHOOK_HMAC_SECRET,
  };
  try {
    if (env?.enforce !== undefined)
      process.env.COACH_WEBHOOK_HMAC_ENFORCE = env.enforce;
    else delete process.env.COACH_WEBHOOK_HMAC_ENFORCE;
    if (env?.secret !== undefined)
      process.env.COACH_WEBHOOK_HMAC_SECRET = env.secret;
    else delete process.env.COACH_WEBHOOK_HMAC_SECRET;

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.map(String).join(' '));
    try {
      // n8n's Code node runs in a Node.js sandbox where `require` is
      // available. The Function constructor isolates globals, so we inject
      // `require` (and `process`/`console`/`Buffer`) explicitly to mirror
      // the runtime environment.
      const fn = new Function(
        '$input',
        'require',
        'process',
        'console',
        'Buffer',
        jsCode,
      );
      const out = fn($input, require, process, console, Buffer);
      return { ok: true, out, warnings };
    } catch (error) {
      return { ok: false, error, warnings };
    } finally {
      console.warn = originalWarn;
    }
  } finally {
    if (savedEnv.enforce !== undefined)
      process.env.COACH_WEBHOOK_HMAC_ENFORCE = savedEnv.enforce;
    else delete process.env.COACH_WEBHOOK_HMAC_ENFORCE;
    if (savedEnv.secret !== undefined)
      process.env.COACH_WEBHOOK_HMAC_SECRET = savedEnv.secret;
    else delete process.env.COACH_WEBHOOK_HMAC_SECRET;
  }
}

function makeSignature(secret, timestamp, body) {
  const raw = JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex');
  return 'sha256=' + hmac;
}

describe('Coach webhook HMAC verification node (C-04 / E.3)', () => {
  for (const config of WORKFLOWS) {
    describe(config.file, () => {
      it('is wired between the webhook receiver and the normalizer', () => {
        const wf = loadWorkflow(config.file);
        expect(getNode(wf, config.hmacName)).toBeDefined();
        const fromWebhook = wf.connections[config.webhookName].main[0][0].node;
        const fromHmac = wf.connections[config.hmacName].main[0][0].node;
        expect(fromWebhook).toBe(config.hmacName);
        expect(fromHmac).toBe(config.normalizerName);
      });

      it('dual-mode (ENFORCE=false): missing headers → warning, request passes', () => {
        const wf = loadWorkflow(config.file);
        const result = runHmacNode(wf, {
          name: config.hmacName,
          headers: {},
          body: { hello: 'world' },
          env: { enforce: 'false', secret: 'test-secret' },
        });
        expect(result.ok).toBe(true);
        expect(result.warnings.join('\n')).toMatch(/coach_webhook_signature_missing/);
      });

      it('dual-mode: invalid signature → warning, request still passes', () => {
        const wf = loadWorkflow(config.file);
        const result = runHmacNode(wf, {
          name: config.hmacName,
          headers: {
            'x-webhook-timestamp': new Date().toISOString(),
            'x-webhook-signature': 'sha256=' + '0'.repeat(64),
          },
          body: { hello: 'world' },
          env: { enforce: 'false', secret: 'test-secret' },
        });
        expect(result.ok).toBe(true);
        expect(result.warnings.join('\n')).toMatch(/coach_webhook_signature_invalid/);
      });

      it('enforce mode: invalid signature → throw', () => {
        const wf = loadWorkflow(config.file);
        const result = runHmacNode(wf, {
          name: config.hmacName,
          headers: {
            'x-webhook-timestamp': new Date().toISOString(),
            'x-webhook-signature': 'sha256=' + '0'.repeat(64),
          },
          body: { hello: 'world' },
          env: { enforce: 'true', secret: 'test-secret' },
        });
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/coach_webhook_signature_invalid/);
      });

      it('enforce mode: missing headers → throw', () => {
        const wf = loadWorkflow(config.file);
        const result = runHmacNode(wf, {
          name: config.hmacName,
          headers: {},
          body: { hello: 'world' },
          env: { enforce: 'true', secret: 'test-secret' },
        });
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/coach_webhook_signature_missing/);
      });

      it('enforce mode: valid signature → pass (no throw, no warnings)', () => {
        const wf = loadWorkflow(config.file);
        const timestamp = new Date().toISOString();
        const body = { hello: 'world' };
        const secret = 'super-secret-with-enough-entropy';
        const signature = makeSignature(secret, timestamp, body);

        const result = runHmacNode(wf, {
          name: config.hmacName,
          headers: {
            'x-webhook-timestamp': timestamp,
            'x-webhook-signature': signature,
          },
          body,
          env: { enforce: 'true', secret },
        });
        expect(result.ok).toBe(true);
        expect(result.warnings).toEqual([]);
      });

      it('enforce mode: stale timestamp (> 5 min) → throw', () => {
        const wf = loadWorkflow(config.file);
        const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const body = { hello: 'world' };
        const secret = 'super-secret-with-enough-entropy';
        const signature = makeSignature(secret, stale, body);

        const result = runHmacNode(wf, {
          name: config.hmacName,
          headers: {
            'x-webhook-timestamp': stale,
            'x-webhook-signature': signature,
          },
          body,
          env: { enforce: 'true', secret },
        });
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/coach_webhook_timestamp_out_of_skew/);
      });

      it('enforce mode: missing secret env → throw', () => {
        const wf = loadWorkflow(config.file);
        const result = runHmacNode(wf, {
          name: config.hmacName,
          headers: {
            'x-webhook-timestamp': new Date().toISOString(),
            'x-webhook-signature': 'sha256=' + '0'.repeat(64),
          },
          body: { hello: 'world' },
          env: { enforce: 'true', secret: undefined },
        });
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/coach_webhook_hmac_secret_missing/);
      });
    });
  }
});
