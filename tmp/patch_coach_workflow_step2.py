#!/usr/bin/env python3
"""
Follow-up patch to R-22 in n8n/workflows/coach.json, node "Code in JavaScript2".

Problem found by tests: when the LLM body is empty AND content has no
meaningful fields, the upstream code RESETS `content` to a fallback shape
(content.summary = fallbackBody) and THEN synthesizes a body from it. That
makes our `finalBodySource` look like "synthesized" even though we are really
serving fabricated fallback content. The handler-side refund never fires.

Fix: anchor `isInsufficientData` on `hasMeaningfulContent` (captured BEFORE the
content reset) rather than on `finalBodySource`. Keep `finalBodySource` for
debug only. coachRoute === "no_scan" stays exempt (legitimate end-state).

Idempotent: detects the marker R-22b-2026-05-26 and skips if already applied.
"""

import json
import sys
from pathlib import Path

WORKFLOW_PATH = Path(__file__).parent.parent / "n8n" / "workflows" / "coach.json"
NODE_NAME = "Code in JavaScript2"

OLD_BLOCK = """/* R-22 (2026-05-26): expose insufficient_data + debug so the Edge handler can
   refund the quota when the final body came from a generic/templated fallback
   rather than the LLM. coachRoute === \"no_scan\" is a legitimate end-state
   ("take a scan first") and must NOT trigger refund. */
const coachFallbackUsed =
  finalBodySource === \"fallback\" || finalBodySource === \"generic_error\";
const isInsufficientData = coachRoute !== \"no_scan\" && coachFallbackUsed;"""

NEW_BLOCK = """/* R-22 (2026-05-26) + R-22b (2026-05-26): expose insufficient_data + debug
   so the Edge handler can refund the quota when n8n had to fall back to a
   generic/templated body. We anchor `isInsufficientData` on
   `hasMeaningfulContent` (captured BEFORE the content reset above) because
   when the LLM produces nothing usable the code path overwrites `content`
   with a fallback shape and `synthesizedBody` then mirrors it — which would
   otherwise make `finalBodySource` falsely report "synthesized" and mask a
   real refusal. coachRoute === \"no_scan\" is a legitimate end-state. */
const llmProducedMeaningfulOutput = hasMeaningfulContent === true;
const isInsufficientData =
  coachRoute !== \"no_scan\" && !llmProducedMeaningfulOutput;
const coachFallbackUsed =
  isInsufficientData ||
  finalBodySource === \"fallback\" ||
  finalBodySource === \"generic_error\";"""

R22B_MARKER = "R-22b (2026-05-26)"


def main() -> int:
    with WORKFLOW_PATH.open("r", encoding="utf-8") as f:
        workflow = json.load(f)

    target_node = None
    for node in workflow.get("nodes", []):
        if node.get("name") == NODE_NAME:
            target_node = node
            break

    if target_node is None:
        print(f"FATAL: node '{NODE_NAME}' not found", file=sys.stderr)
        return 1

    js_code = target_node["parameters"]["jsCode"]

    if R22B_MARKER in js_code:
        print(f"OK: {NODE_NAME} already patched (R-22b marker present). No change.")
        return 0

    if OLD_BLOCK not in js_code:
        print("FATAL: could not locate OLD_BLOCK (R-22 step 2)", file=sys.stderr)
        print("Expected head:", repr(OLD_BLOCK[:100]), file=sys.stderr)
        return 2

    new_js = js_code.replace(OLD_BLOCK, NEW_BLOCK, 1)
    if new_js == js_code:
        print("FATAL: replacement produced no change", file=sys.stderr)
        return 3

    target_node["parameters"]["jsCode"] = new_js

    with WORKFLOW_PATH.open("w", encoding="utf-8") as f:
        json.dump(workflow, f, ensure_ascii=False, indent=2)
        f.write("\n")

    delta = len(new_js) - len(js_code)
    print(f"PATCHED {NODE_NAME} (R-22b): jsCode delta = {delta:+d} chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
