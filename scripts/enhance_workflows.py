#!/usr/bin/env python3
"""
enhance_workflows.py
--------------------
Injects/Updates:
1. Inbound signature verification with try-catch Node crypto/Web Crypto fallback.
2. Smoke shortcuts (standard n8n IF node checking _is_smoke_test).
3. Outbound response signing with try-catch Node crypto/Web Crypto fallback.
across:
- n8n/workflows/analyse_1.json
- n8n/workflows/coach.json
- n8n/workflows/coach-conversation.json
- n8n/workflows/fridge-scan-chef.json
"""
import json
import uuid
from pathlib import Path

# --- Code templates ---

VERIFY_HMAC_JS = r"""const TOLERANCE_MS = 5 * 60 * 1000;
const SIGNATURE_PREFIX = 'sha256=';

const first = $input.first();
const headers = (first && first.json && first.json.headers) || (first && first.headers) || {};
const bodyObj = (first && first.json && first.json.body) || (first && first.body) || (first && first.json) || {};
const rawBody = JSON.stringify(bodyObj);

const timestamp = headers['x-webhook-timestamp'] || headers['X-Webhook-Timestamp'];
const signature = headers['x-webhook-signature'] || headers['X-Webhook-Signature'];
const secret = ($env.PHASE2_WEBHOOK_HMAC_SECRET || $env.COACH_WEBHOOK_HMAC_SECRET || '').trim();

if (!secret) {
  throw new Error('PHASE2_WEBHOOK_HMAC_SECRET missing on n8n side');
}
if (!timestamp || !signature) {
  throw new Error('Webhook missing x-webhook-timestamp or x-webhook-signature');
}

// Anti-replay : timestamp dans une fenêtre de 5 min
const tsDate = new Date(String(timestamp));
if (Number.isNaN(tsDate.getTime())) {
  throw new Error('Invalid x-webhook-timestamp format');
}
const drift = Math.abs(Date.now() - tsDate.getTime());
if (drift > TOLERANCE_MS) {
  throw new Error(`Webhook timestamp drift ${drift}ms exceeds tolerance`);
}

// Recalcul de la signature
const textEncoder = new TextEncoder();
function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function verifyHmac(payload, secret, providedSig) {
  let expectedHex;
  try {
    const crypto = require('crypto');
    expectedHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  } catch (nodeError) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) {
      throw new Error('Neither Node crypto nor Web Crypto is available. ' + nodeError.message);
    }
    const signingKey = await subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBuffer = await subtle.sign('HMAC', signingKey, textEncoder.encode(payload));
    expectedHex = arrayBufferToHex(signatureBuffer);
  }

  const expected = SIGNATURE_PREFIX + expectedHex;
  
  // Constant-time comparison
  let mismatch = expected.length ^ providedSig.length;
  const maxLength = Math.max(expected.length, providedSig.length);
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (expected.charCodeAt(index) || 0) ^ (providedSig.charCodeAt(index) || 0);
  }
  if (mismatch !== 0) {
    throw new Error('Webhook signature mismatch');
  }
}

await verifyHmac(String(timestamp) + '.' + rawBody, secret, String(signature));

const isSmoke = typeof bodyObj._smoke_test === 'string' && bodyObj._smoke_test.startsWith('check_signing_');

return [{
  json: {
    ...$input.first().json,
    _is_smoke_test: isSmoke
  }
}];
"""

SIGN_RESPONSE_JS = r"""const ENFORCE = ($env.COACH_WEBHOOK_HMAC_ENFORCE || '').trim().toLowerCase() === 'true';
const SECRET = ($env.PHASE2_WEBHOOK_HMAC_SECRET || $env.COACH_WEBHOOK_HMAC_SECRET || '').trim();

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

const textEncoder = new TextEncoder();
function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function signResponse(payload, secret) {
  try {
    const crypto = require('crypto');
    return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  } catch (nodeError) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) {
      throw new Error('Neither Node crypto nor Web Crypto is available. ' + nodeError.message);
    }
    const signingKey = await subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBuffer = await subtle.sign('HMAC', signingKey, textEncoder.encode(payload));
    return 'sha256=' + arrayBufferToHex(signatureBuffer);
  }
}

const sig = await signResponse(payload, SECRET);

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

def make_smoke_switch(name, position):
    return {
        "parameters": {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": "",
                    "typeValidation": "strict",
                    "version": 2
                },
                "conditions": [
                    {
                        "id": "smoke-test-condition",
                        "leftValue": "={{ $json._is_smoke_test }}",
                        "rightValue": "",
                        "operator": {
                            "type": "boolean",
                            "operation": "true",
                            "singleValue": True
                        }
                    }
                ],
                "combinator": "and"
            },
            "options": {}
        },
        "id": str(uuid.uuid4()),
        "name": name,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": position
    }

def find_node(nodes, name):
    for node in nodes:
        if node.get("name") == name:
            return node
    return None

def main():
    workflows_dir = Path("n8n/workflows")
    
    # ----------------- 1. analyse_1.json -----------------
    print("Enhancing analyse_1.json...")
    path = workflows_dir / "analyse_1.json"
    with open(path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
    
    nodes = workflow.get("nodes", [])
    connections = workflow.get("connections", {})
    
    # Inbound node, switch node, outbound node
    verify_node = {
        "parameters": {
            "jsCode": VERIFY_HMAC_JS
        },
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [160, -150],
        "id": str(uuid.uuid4()),
        "name": "Verify Coach Webhook HMAC (analyse_1)"
    }
    switch_node = make_smoke_switch("Smoke Switch (analyse_1)", [320, -150])
    
    sign_node = find_node(nodes, "Sign Webhook Response (analyse_1)")
    if sign_node:
        sign_node["parameters"]["jsCode"] = SIGN_RESPONSE_JS
    else:
        print("[ERROR] Sign node not found in analyse_1.json!")
        return 1
        
    nodes.append(verify_node)
    nodes.append(switch_node)
    
    # Connections
    # Webhook -> Verify
    connections["Webhook"] = {
        "main": [
            [
                {
                    "node": verify_node["name"],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Verify -> Smoke Switch
    connections[verify_node["name"]] = {
        "main": [
            [
                {
                    "node": switch_node["name"],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Smoke Switch
    connections[switch_node["name"]] = {
        "main": [
            # True -> Sign node
            [
                {
                    "node": sign_node["name"],
                    "type": "main",
                    "index": 0
                }
            ],
            # False -> Normalize Analyse Input
            [
                {
                    "node": "Normalize Analyse Input",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    
    workflow["nodes"] = nodes
    workflow["connections"] = connections
    with open(path, "w", encoding="utf-8") as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)
    print("analyse_1.json saved successfully!")

    # ----------------- 2. coach.json -----------------
    print("\nEnhancing coach.json...")
    path = workflows_dir / "coach.json"
    with open(path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
        
    nodes = workflow.get("nodes", [])
    connections = workflow.get("connections", {})
    
    verify_node = find_node(nodes, "Verify Coach Webhook HMAC")
    if verify_node:
        verify_node["parameters"]["jsCode"] = VERIFY_HMAC_JS
    else:
        print("[ERROR] Verify node not found in coach.json!")
        return 1
        
    sign_node = find_node(nodes, "Sign Webhook Response (coach)")
    if sign_node:
        sign_node["parameters"]["jsCode"] = SIGN_RESPONSE_JS
    else:
        print("[ERROR] Sign node not found in coach.json!")
        return 1
        
    switch_node = make_smoke_switch("Smoke Switch (coach)", [150, -162])
    nodes.append(switch_node)
    
    # Connections rewiring
    # Verify Coach Webhook HMAC -> Smoke Switch
    connections["Verify Coach Webhook HMAC"] = {
        "main": [
            [
                {
                    "node": switch_node["name"],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Smoke Switch
    connections[switch_node["name"]] = {
        "main": [
            # True -> Sign node
            [
                {
                    "node": sign_node["name"],
                    "type": "main",
                    "index": 0
                }
            ],
            # False -> Normalize Coach Input1
            [
                {
                    "node": "Normalize Coach Input1",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    
    workflow["nodes"] = nodes
    workflow["connections"] = connections
    with open(path, "w", encoding="utf-8") as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)
    print("coach.json saved successfully!")

    # ----------------- 3. coach-conversation.json -----------------
    print("\nEnhancing coach-conversation.json...")
    path = workflows_dir / "coach-conversation.json"
    with open(path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
        
    nodes = workflow.get("nodes", [])
    connections = workflow.get("connections", {})
    
    verify_node = find_node(nodes, "Verify Coach Conversation Webhook HMAC")
    if verify_node:
        verify_node["parameters"]["jsCode"] = VERIFY_HMAC_JS
    else:
        print("[ERROR] Verify node not found in coach-conversation.json!")
        return 1
        
    sign_node = find_node(nodes, "Sign Webhook Response (coach-conversation)")
    if sign_node:
        sign_node["parameters"]["jsCode"] = SIGN_RESPONSE_JS
    else:
        print("[ERROR] Sign node not found in coach-conversation.json!")
        return 1
        
    switch_node = make_smoke_switch("Smoke Switch (coach-conversation)", [180, -150])
    nodes.append(switch_node)
    
    # Connections rewiring
    # Verify Coach Conversation Webhook HMAC -> Smoke Switch
    connections["Verify Coach Conversation Webhook HMAC"] = {
        "main": [
            [
                {
                    "node": switch_node["name"],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Smoke Switch
    connections[switch_node["name"]] = {
        "main": [
            # True -> Sign node
            [
                {
                    "node": sign_node["name"],
                    "type": "main",
                    "index": 0
                }
            ],
            # False -> Normalize Coach Conversation Input
            [
                {
                    "node": "Normalize Coach Conversation Input",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    
    workflow["nodes"] = nodes
    workflow["connections"] = connections
    with open(path, "w", encoding="utf-8") as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)
    print("coach-conversation.json saved successfully!")

    # ----------------- 4. fridge-scan-chef.json -----------------
    print("\nEnhancing fridge-scan-chef.json...")
    path = workflows_dir / "fridge-scan-chef.json"
    with open(path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
        
    nodes = workflow.get("nodes", [])
    connections = workflow.get("connections", {})
    
    verify_node = {
        "parameters": {
            "jsCode": VERIFY_HMAC_JS
        },
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [130, -200],
        "id": str(uuid.uuid4()),
        "name": "Verify Coach Webhook HMAC (fridge-scan)"
    }
    switch_node = make_smoke_switch("Smoke Switch (fridge-scan)", [290, -200])
    
    sign_node = {
        "parameters": {
            "jsCode": SIGN_RESPONSE_JS
        },
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [390, -100],
        "id": str(uuid.uuid4()),
        "name": "Sign Webhook Response (fridge-scan-chef)"
    }
    
    nodes.append(verify_node)
    nodes.append(switch_node)
    nodes.append(sign_node)
    
    # Connections rewiring
    # Webhook -> Verify
    connections["Webhook"] = {
        "main": [
            [
                {
                    "node": verify_node["name"],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Verify -> Smoke Switch
    connections[verify_node["name"]] = {
        "main": [
            [
                {
                    "node": switch_node["name"],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Smoke Switch
    connections[switch_node["name"]] = {
        "main": [
            # True -> Sign node
            [
                {
                    "node": sign_node["name"],
                    "type": "main",
                    "index": 0
                }
            ],
            # False -> Normalize inbound fridge scan
            [
                {
                    "node": "Normalize inbound fridge scan",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Normalize inbound fridge scan -> Sign node
    connections["Normalize inbound fridge scan"] = {
        "main": [
            [
                {
                    "node": sign_node["name"],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Sign node -> Respond to App
    connections[sign_node["name"]] = {
        "main": [
            [
                {
                    "node": "Respond to App",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    
    workflow["nodes"] = nodes
    workflow["connections"] = connections
    with open(path, "w", encoding="utf-8") as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)
    print("fridge-scan-chef.json saved successfully!")
    
    print("\nAll 4 n8n workflows successfully updated with try-catch resilience & smoke shortcuts!")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
