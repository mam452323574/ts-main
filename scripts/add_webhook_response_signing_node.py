#!/usr/bin/env python3
"""
add_webhook_response_signing_node.py
-------------------------------------
Injects a "Sign Webhook Response" n8n Code node just before each
`n8n-nodes-base.respondToWebhook` node in the specified workflow JSON files.

The signing node computes HMAC-SHA256 over `<timestamp>.<rawBody>` and attaches
the result as response headers that the Edge Function verifies.

Dual-mode: when COACH_WEBHOOK_HMAC_ENFORCE is false (default), a missing secret
logs a warning but does NOT block the response.  Flip to true for strict mode.

Skipped workflows:
  - fridge-scan-chef.json: already has its own "Build signed callback" node.

Usage:
  python scripts/add_webhook_response_signing_node.py
"""
import json
import os
import sys
import uuid
from pathlib import Path

# ── Configuration ────────────────────────────────────────────────────────────

WORKFLOWS_DIR = Path(__file__).resolve().parent.parent / "n8n" / "workflows"

# Map of workflow file → list of respond-node names to patch.
# If the list is empty, ALL respondToWebhook nodes in that file are patched.
TARGETS = {
    "coach.json": ["Respond to Webhook1"],
    "coach-conversation.json": ["Respond Coach Conversation"],
    "analyse_1.json": ["Respond to Webhook1"],
}

# Horizontal offset (px) for the new node relative to the respond node.
SIGN_NODE_X_OFFSET = -260

# ── JS code for the signing node ─────────────────────────────────────────────

SIGN_RESPONSE_JS = r"""// Sign Webhook Response — HMAC-SHA256
// Dual-mode: logs warning when secret is missing unless COACH_WEBHOOK_HMAC_ENFORCE=true.
// Adds x-webhook-response-timestamp and x-webhook-response-signature headers
// that the Supabase Edge Function verifies via verifyPhase2WebhookResponseSignature.

const crypto = require('crypto');

const ENFORCE = (process.env.COACH_WEBHOOK_HMAC_ENFORCE || '').trim().toLowerCase() === 'true';
const SECRET = (process.env.COACH_WEBHOOK_HMAC_SECRET || process.env.SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET || '').trim();

if (!SECRET) {
  if (ENFORCE) {
    throw new Error('sign_webhook_response_secret_missing');
  }
  console.warn('[sign-webhook-response] HMAC secret not configured (dual-mode, skipping signature)');
  return $input.all();
}

const rawBody = JSON.stringify($input.first().json);
const timestamp = new Date().toISOString();
const payload = timestamp + '.' + rawBody;
const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

return [{
  json: $input.first().json,
  binary: $input.first().binary,
  headers: {
    'x-webhook-response-timestamp': timestamp,
    'x-webhook-response-signature': sig,
    'Content-Type': 'application/json; charset=utf-8',
  },
}];
"""


def make_sign_node(respond_node, workflow_name):
    """Create a new Code node positioned to the left of the respond node."""
    respond_pos = respond_node.get("position", [0, 0])
    return {
        "parameters": {
            "jsCode": SIGN_RESPONSE_JS,
        },
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [
            respond_pos[0] + SIGN_NODE_X_OFFSET,
            respond_pos[1],
        ],
        "id": str(uuid.uuid4()),
        "name": f"Sign Webhook Response ({workflow_name})",
    }


def find_node_by_name(nodes, name):
    """Return (index, node) for a node with the given name."""
    for i, node in enumerate(nodes):
        if node.get("name") == name:
            return i, node
    return None, None


def find_predecessors(connections, target_node_name):
    """Return list of (source_node_name, output_index) that feed into target."""
    predecessors = []
    for source_name, outputs in connections.items():
        main_outputs = outputs.get("main", [])
        for output_idx, output_connections in enumerate(main_outputs):
            for conn in output_connections:
                if conn.get("node") == target_node_name:
                    predecessors.append((source_name, output_idx))
    return predecessors


def patch_workflow(filepath, respond_node_names):
    """Inject sign node before each specified respond node."""
    with open(filepath, "r", encoding="utf-8") as f:
        workflow = json.load(f)

    nodes = workflow.get("nodes", [])
    connections = workflow.get("connections", {})
    workflow_label = Path(filepath).stem
    patched_count = 0

    for respond_name in respond_node_names:
        _, respond_node = find_node_by_name(nodes, respond_name)
        if respond_node is None:
            print(f"  [WARN] Node '{respond_name}' not found in {filepath.name}, skipping.")
            continue

        # Check if already patched (a sign node already feeds into this respond)
        predecessors = find_predecessors(connections, respond_name)
        already_patched = any(
            "Sign Webhook Response" in src_name for src_name, _ in predecessors
        )
        if already_patched:
            print(f"  [OK] '{respond_name}' already patched, skipping.")
            continue

        # Create the sign node
        sign_node = make_sign_node(respond_node, workflow_label)
        sign_node_name = sign_node["name"]
        nodes.append(sign_node)

        # Rewire: every predecessor that pointed to respond_name now points to sign_node_name
        for source_name, output_idx in predecessors:
            main_outputs = connections[source_name]["main"]
            new_connections = []
            for conn in main_outputs[output_idx]:
                if conn.get("node") == respond_name:
                    new_connections.append({
                        "node": sign_node_name,
                        "type": "main",
                        "index": 0,
                    })
                else:
                    new_connections.append(conn)
            main_outputs[output_idx] = new_connections

        # Add new connection: sign_node → respond_node
        connections[sign_node_name] = {
            "main": [
                [
                    {
                        "node": respond_name,
                        "type": "main",
                        "index": 0,
                    }
                ]
            ]
        }

        patched_count += 1
        print(f"  [DONE] Injected '{sign_node_name}' before '{respond_name}'")

    if patched_count > 0:
        workflow["nodes"] = nodes
        workflow["connections"] = connections
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(workflow, f, indent=2, ensure_ascii=False)
        print(f"  [SAVED] {filepath.name} ({patched_count} node(s) injected)")
    else:
        print(f"  -- No changes needed for {filepath.name}")

    return patched_count


def main():
    total = 0
    for filename, respond_names in TARGETS.items():
        filepath = WORKFLOWS_DIR / filename
        if not filepath.exists():
            print(f"[WARN] {filepath} does not exist, skipping.")
            continue
        print(f"\n--- Processing {filename}...")
        total += patch_workflow(filepath, respond_names)

    print(f"\n{'='*60}")
    print(f"Done. {total} signing node(s) injected across {len(TARGETS)} workflow(s).")
    if total > 0:
        print(
            "\nNext steps:\n"
            "  1. Import the updated workflow JSON files into n8n.\n"
            "  2. Set COACH_WEBHOOK_HMAC_SECRET (or SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET)\n"
            "     in n8n environment.\n"
            "  3. Monitor logs for '[sign-webhook-response]' warnings.\n"
            "  4. When ready, set COACH_WEBHOOK_HMAC_ENFORCE=true.\n"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
