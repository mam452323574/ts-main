"""Add retry/timeout settings to LLM nodes in the Coach n8n workflows.

N-B of COACH_SECURITY_AUDIT_2026_05.

For each LangChain LLM node in:
  - n8n/workflows/coach.json
  - n8n/workflows/coach-conversation.json

we apply two layers of protection:

1. n8n node-level retry (universally honored by the n8n runtime):
     retryOnFail: true
     maxTries: 2          (1 attempt + 1 retry)
     waitBetweenTries: 1000  (1 second between attempts)

2. Provider-level request timeout via parameters.options.requestTimeout:
     requestTimeout: 30000

The script is idempotent: re-running it after the settings are already in place
leaves the file unchanged.

Run from the repo root:
    python scripts/add_coach_llm_retry_settings.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

LLM_NODE_TYPE_PREFIX = '@n8n/n8n-nodes-langchain.lmChat'

RETRY_SETTINGS = {
    'retryOnFail': True,
    'maxTries': 2,
    'waitBetweenTries': 1000,
}

REQUEST_TIMEOUT_MS = 30000


def patch_workflow(path: Path) -> bool:
    data = json.loads(path.read_text(encoding='utf-8'))
    changed = False
    for node in data.get('nodes', []):
        node_type = node.get('type', '')
        if not isinstance(node_type, str) or not node_type.startswith(LLM_NODE_TYPE_PREFIX):
            continue

        # 1. Node-level retry settings.
        for key, value in RETRY_SETTINGS.items():
            if node.get(key) != value:
                node[key] = value
                changed = True

        # 2. Provider-level request timeout inside parameters.options.
        params: Any = node.setdefault('parameters', {})
        if not isinstance(params, dict):
            continue
        options: Any = params.setdefault('options', {})
        if not isinstance(options, dict):
            params['options'] = {}
            options = params['options']
        if options.get('requestTimeout') != REQUEST_TIMEOUT_MS:
            options['requestTimeout'] = REQUEST_TIMEOUT_MS
            changed = True

    if changed:
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8',
        )
    return changed


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
        print(f'{rel}: {"updated" if changed else "no change"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
