"""Inject the updated normalizer JS into the n8n workflow JSON.

Run from the repo root:
    python scripts/update_coach_n8n_normalizer.py

It does three things:
  1. Reads tmp/coach-conversation-normalize-CURRENT.js (the editable source).
  2. JSON-encodes it.
  3. Replaces the first `"jsCode": "..."` value in
     n8n/workflows/coach-conversation.json.

This is the safe path for editing JS embedded in n8n workflow JSON: hand-editing
the escaped multi-line string is fragile, especially with Unicode (apostrophes,
ellipsis) sprinkled around the persona style guides.
"""
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
JS_PATH = REPO_ROOT / 'tmp' / 'coach-conversation-normalize-CURRENT.js'
WORKFLOW_PATH = REPO_ROOT / 'n8n' / 'workflows' / 'coach-conversation.json'

# Matches the first "jsCode": "..."  value where "..." accepts:
#  - any non-quote / non-backslash char
#  - or an escape sequence \X
PATTERN = re.compile(r'"jsCode":\s*"(?:[^"\\]|\\.)*"')


def main() -> int:
    js_source = JS_PATH.read_text(encoding='utf-8')
    encoded = json.dumps(js_source)

    workflow_text = WORKFLOW_PATH.read_text(encoding='utf-8')
    # Use a callable to avoid re.sub() interpreting backreferences (\u, \\, etc.)
    # in the replacement — encoded contains \uXXXX escapes for non-ASCII chars
    # in the JS string.
    replacement = f'"jsCode": {encoded}'
    new_text, n = PATTERN.subn(
        lambda _match: replacement,
        workflow_text,
        count=1,
    )
    if n != 1:
        print(f'ERROR: expected exactly 1 jsCode substitution, got {n}', file=sys.stderr)
        return 1

    # Validate the result is still valid JSON before writing.
    try:
        parsed = json.loads(new_text)
    except json.JSONDecodeError as exc:
        print(f'ERROR: result is not valid JSON: {exc}', file=sys.stderr)
        return 1

    WORKFLOW_PATH.write_text(new_text, encoding='utf-8')
    print(f'Updated {WORKFLOW_PATH.relative_to(REPO_ROOT)} (top-level keys: {list(parsed.keys())}).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
