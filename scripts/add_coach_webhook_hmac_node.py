"""Add an HMAC verification Code node between the webhook and the normalizer
in the two Coach n8n workflows. Phase E of COACH_SECURITY_AUDIT_2026_05.

The node runs in dual-mode by default (logs warnings, does not reject) so we
can roll out without an outage. Flipping the n8n env var
COACH_WEBHOOK_HMAC_ENFORCE=true switches it to strict enforcement.

The shared secret is read from the n8n env var COACH_WEBHOOK_HMAC_SECRET; the
mirroring Supabase secret is PHASE2_WEBHOOK_HMAC_SECRET (see
supabase/functions/_shared/phase2Env.ts).

Run from the repo root:
    python scripts/add_coach_webhook_hmac_node.py

Idempotent: re-running it after the node is in place leaves the file
unchanged.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

HMAC_NODE_TYPE = 'n8n-nodes-base.code'
HMAC_NODE_NAME_BY_WORKFLOW = {
    'coach.json': 'Verify Coach Webhook HMAC',
    'coach-conversation.json': 'Verify Coach Conversation Webhook HMAC',
}
HMAC_NODE_ID_BY_WORKFLOW = {
    'coach.json': '9a3b6b62-0090-4f1e-8000-00000000c090',
    'coach-conversation.json': '9a3b6b62-0091-4f1e-8000-00000000c091',
}

# JS source for the HMAC verification node. Single source of truth — applied
# to both workflows.
HMAC_NODE_JS = r"""// Verify HMAC signature on the incoming Coach webhook.
// Phase E (C-04) of COACH_SECURITY_AUDIT_2026_05.
//
// Dual-mode by default: log violations but accept the request. Flip the n8n
// env var COACH_WEBHOOK_HMAC_ENFORCE=true to switch to strict enforcement.
//
// Expected headers (set by supabase/functions/_shared/phase2Webhook.ts when
// PHASE2_WEBHOOK_AUTH_MODE includes hmac):
//   x-webhook-timestamp: ISO-8601 date
//   x-webhook-signature: "sha256=" + hex(HMAC-SHA256(`${ts}.${rawBody}`, SECRET))

const crypto = require('crypto');

const ENFORCE = (process.env.COACH_WEBHOOK_HMAC_ENFORCE || '').trim().toLowerCase() === 'true';
const SECRET = (process.env.COACH_WEBHOOK_HMAC_SECRET || '').trim();
const MAX_SKEW_SECONDS = 300;

function fail(code) {
  if (ENFORCE) {
    throw new Error(code);
  }
  console.warn('[coach-webhook-hmac] ' + code + ' (dual-mode, allowing)');
}

if (!SECRET) {
  // Missing secret means we cannot verify anything; in enforce mode this is a
  // hard failure. In dual-mode we log and let the request through so we don't
  // break the workflow during the rollout window.
  fail('coach_webhook_hmac_secret_missing');
  return $input.all();
}

const first = $input.first();
const headers = (first && first.json && first.json.headers) || (first && first.headers) || {};
const timestamp = headers['x-webhook-timestamp'] || headers['X-Webhook-Timestamp'];
const signature = headers['x-webhook-signature'] || headers['X-Webhook-Signature'];

if (!timestamp || !signature) {
  fail('coach_webhook_signature_missing');
  return $input.all();
}

const tsDate = new Date(String(timestamp));
if (Number.isNaN(tsDate.getTime())) {
  fail('coach_webhook_timestamp_invalid');
  return $input.all();
}
const skewMs = Math.abs(Date.now() - tsDate.getTime());
if (skewMs > MAX_SKEW_SECONDS * 1000) {
  fail('coach_webhook_timestamp_out_of_skew');
  return $input.all();
}

const rawBody = JSON.stringify(
  (first && first.json && first.json.body) || (first && first.body) || (first && first.json) || {},
);
const expected = 'sha256=' + crypto
  .createHmac('sha256', SECRET)
  .update(String(timestamp) + '.' + rawBody)
  .digest('hex');

const expectedBuf = Buffer.from(expected, 'utf8');
const providedBuf = Buffer.from(String(signature), 'utf8');
const valid =
  expectedBuf.length === providedBuf.length &&
  crypto.timingSafeEqual(expectedBuf, providedBuf);

if (!valid) {
  fail('coach_webhook_signature_invalid');
  return $input.all();
}

return $input.all();
"""


def webhook_node_name(data: dict[str, Any]) -> str | None:
    for node in data.get('nodes', []):
        if isinstance(node.get('type'), str) and 'webhook' in node['type'].lower():
            return node.get('name')
    return None


def normalizer_node_name(data: dict[str, Any], webhook_name: str) -> str | None:
    connections = data.get('connections', {}).get(webhook_name, {})
    main = connections.get('main', [])
    if not main or not main[0]:
        return None
    return main[0][0].get('node')


def patch_workflow(path: Path) -> bool:
    workflow_filename = path.name
    hmac_node_name = HMAC_NODE_NAME_BY_WORKFLOW[workflow_filename]
    hmac_node_id = HMAC_NODE_ID_BY_WORKFLOW[workflow_filename]

    data = json.loads(path.read_text(encoding='utf-8'))

    # Idempotence: if the HMAC node already exists, no-op.
    if any(node.get('name') == hmac_node_name for node in data.get('nodes', [])):
        return False

    webhook_name = webhook_node_name(data)
    if not webhook_name:
        print(f'ERROR: {path.name}: webhook node not found', file=sys.stderr)
        return False

    normalizer_name = normalizer_node_name(data, webhook_name)
    if not normalizer_name:
        print(
            f'ERROR: {path.name}: normalizer node not found after webhook',
            file=sys.stderr,
        )
        return False

    # 1. Compute the position so the new node sits between the webhook and the
    #    normalizer. We place it at the midpoint horizontally, same y as the
    #    webhook.
    webhook_node = next(n for n in data['nodes'] if n.get('name') == webhook_name)
    normalizer_node = next(n for n in data['nodes'] if n.get('name') == normalizer_name)
    web_pos = webhook_node.get('position') or [0, 0]
    nor_pos = normalizer_node.get('position') or [240, 0]
    mid_x = (web_pos[0] + nor_pos[0]) / 2
    mid_y = web_pos[1]

    hmac_node = {
        'parameters': {
            'jsCode': HMAC_NODE_JS,
        },
        'type': HMAC_NODE_TYPE,
        'typeVersion': 2,
        'position': [mid_x, mid_y],
        'id': hmac_node_id,
        'name': hmac_node_name,
    }
    # Insert the node right after the webhook in the array (cosmetic).
    nodes = data['nodes']
    webhook_index = next(i for i, n in enumerate(nodes) if n.get('name') == webhook_name)
    nodes.insert(webhook_index + 1, hmac_node)

    # 2. Re-wire connections: Webhook -> HMAC -> Normalizer.
    connections = data.setdefault('connections', {})
    connections[webhook_name] = {
        'main': [
            [{'node': hmac_node_name, 'type': 'main', 'index': 0}],
        ],
    }
    connections[hmac_node_name] = {
        'main': [
            [{'node': normalizer_name, 'type': 'main', 'index': 0}],
        ],
    }

    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    return True


def main() -> int:
    workflows = [
        REPO_ROOT / 'n8n' / 'workflows' / 'coach.json',
        REPO_ROOT / 'n8n' / 'workflows' / 'coach-conversation.json',
    ]
    for path in workflows:
        if not path.exists():
            print(f'WARN: {path} does not exist, skipping', file=sys.stderr)
            continue
        changed = patch_workflow(path)
        rel = path.relative_to(REPO_ROOT)
        print(f'{rel}: {"updated (added HMAC node)" if changed else "no change (already present)"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
