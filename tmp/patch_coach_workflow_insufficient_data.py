#!/usr/bin/env python3
"""
Patch n8n/workflows/coach.json node "Code in JavaScript2" to signal
insufficient_data when the final body comes from the generic fallback or the
templated localizedCopy.genericError, instead of silently serving a fabricated
reply that consumes the user quota.

Idempotent: skips the patch if R-22 markers are already present.

Companion fix (Edge): supabase/functions/_shared/coachPayload.ts now throws
Phase2HttpError(422, "coach_insufficient_data") when insufficient_data===true,
and supabase/functions/coach-generate-response/handler.ts catches it to refund
the quota via markPendingEntryError.
"""

import json
import sys
from pathlib import Path

WORKFLOW_PATH = Path(__file__).parent.parent / "n8n" / "workflows" / "coach.json"

NODE_NAME = "Code in JavaScript2"

OLD_FINAL_BODY_BLOCK = """const synthesizedBody = synthesizeBody(content, localizedCopy.sectionLabels);
const finalBody = coachRoute === \"no_scan\"
  ? (
    clampString(
      firstNonEmptyString([
        synthesizedBody,
        localizedCopy.noScanBody,
        localizedCopy.genericError,
      ]),
      4000,
    ) ||
    clampString(localizedCopy.genericError, 4000)
  )
  : (
    clampString(
      firstNonEmptyString([
        parsedBodySanitized,
        synthesizedBody,
        fallbackBody,
        localizedCopy.genericError,
      ]),
      4000,
    ) ||
    clampString(localizedCopy.genericError, 4000)
  );"""

NEW_FINAL_BODY_BLOCK = """const synthesizedBody = synthesizeBody(content, localizedCopy.sectionLabels);
/* R-22 (2026-05-26): track the source of finalBody so the Edge handler can
   detect when n8n had to fall back to a generic/templated body (LLM refusal
   or empty content) and refund the quota instead of persisting a fabricated
   reply. See COACH_BUG_HYDRATATION_AUDIT_2026_05_20.md + audit 2026-05-26. */
function resolveFinalBodyCandidate() {
  if (coachRoute === \"no_scan\") {
    if (typeof synthesizedBody === \"string\" && synthesizedBody.trim()) {
      return { body: synthesizedBody, source: \"synthesized\" };
    }
    if (typeof localizedCopy.noScanBody === \"string\" && localizedCopy.noScanBody.trim()) {
      return { body: localizedCopy.noScanBody, source: \"no_scan_body\" };
    }
    return { body: localizedCopy.genericError, source: \"generic_error\" };
  }
  if (typeof parsedBodySanitized === \"string\" && parsedBodySanitized.trim()) {
    return { body: parsedBodySanitized, source: \"parsed\" };
  }
  if (typeof synthesizedBody === \"string\" && synthesizedBody.trim()) {
    return { body: synthesizedBody, source: \"synthesized\" };
  }
  if (typeof fallbackBody === \"string\" && fallbackBody.trim()) {
    return { body: fallbackBody, source: \"fallback\" };
  }
  return { body: localizedCopy.genericError, source: \"generic_error\" };
}
const finalBodyCandidate = resolveFinalBodyCandidate();
const finalBodySource = finalBodyCandidate.source;
const finalBody =
  clampString(finalBodyCandidate.body, 4000) ||
  clampString(localizedCopy.genericError, 4000);"""

OLD_RETURN_BLOCK = """return [
  {
    json: {
      response_version: 2,
      title: finalTitle,
      body: finalBodyClean,
      disclaimer: finalDisclaimer,
      cta_label: clampOptionalString(parsed.cta_label, 40) || derivedCta.label,
      cta_route: readText(parsed.cta_route) || derivedCta.route,
      content,
      source: \"n8n\",
    },
  },
];"""

NEW_RETURN_BLOCK = """/* R-22 (2026-05-26): expose insufficient_data + debug so the Edge handler can
   refund the quota when the final body came from a generic/templated fallback
   rather than the LLM. coachRoute === \"no_scan\" is a legitimate end-state
   ("take a scan first") and must NOT trigger refund. */
const coachFallbackUsed =
  finalBodySource === \"fallback\" || finalBodySource === \"generic_error\";
const isInsufficientData = coachRoute !== \"no_scan\" && coachFallbackUsed;
const promptTypeForDebug =
  (typeof upstreamContext.prompt_type === \"string\" && upstreamContext.prompt_type) ||
  (typeof upstreamContext.visible_prompt_type === \"string\" && upstreamContext.visible_prompt_type) ||
  null;
const hasScanIntentForDebug = !!(
  upstreamContext &&
  (upstreamContext.scan_intent || upstreamContext.has_scan_intent === true)
);
const coachDebugInfo = {
  coach_fallback_used: coachFallbackUsed,
  fallback_reason: finalBodySource,
  language: languageCode,
  coach_route: coachRoute,
  prompt_type: promptTypeForDebug,
  has_scan_intent: hasScanIntentForDebug,
};

return [
  {
    json: Object.assign(
      {
        response_version: 2,
        title: finalTitle,
        body: finalBodyClean,
        disclaimer: finalDisclaimer,
        cta_label: clampOptionalString(parsed.cta_label, 40) || derivedCta.label,
        cta_route: readText(parsed.cta_route) || derivedCta.route,
        content,
        source: \"n8n\",
        debug: coachDebugInfo,
      },
      isInsufficientData ? { insufficient_data: true } : {},
    ),
  },
];"""

R22_MARKER = "R-22 (2026-05-26)"


def main() -> int:
    with WORKFLOW_PATH.open("r", encoding="utf-8") as f:
        workflow = json.load(f)

    target_node = None
    for node in workflow.get("nodes", []):
        if node.get("name") == NODE_NAME:
            target_node = node
            break

    if target_node is None:
        print(f"FATAL: node '{NODE_NAME}' not found in {WORKFLOW_PATH}", file=sys.stderr)
        return 1

    js_code = target_node["parameters"]["jsCode"]

    if R22_MARKER in js_code:
        print(f"OK: {NODE_NAME} already patched (R-22 marker present). No change.")
        return 0

    if OLD_FINAL_BODY_BLOCK not in js_code:
        print("FATAL: could not locate OLD_FINAL_BODY_BLOCK in jsCode.", file=sys.stderr)
        print("First/last chars of expected block:", file=sys.stderr)
        print(repr(OLD_FINAL_BODY_BLOCK[:80]), file=sys.stderr)
        print(repr(OLD_FINAL_BODY_BLOCK[-80:]), file=sys.stderr)
        return 2

    if OLD_RETURN_BLOCK not in js_code:
        print("FATAL: could not locate OLD_RETURN_BLOCK in jsCode.", file=sys.stderr)
        return 3

    new_js = js_code.replace(OLD_FINAL_BODY_BLOCK, NEW_FINAL_BODY_BLOCK, 1)
    new_js = new_js.replace(OLD_RETURN_BLOCK, NEW_RETURN_BLOCK, 1)

    if new_js == js_code:
        print("FATAL: replacements produced no change.", file=sys.stderr)
        return 4

    target_node["parameters"]["jsCode"] = new_js

    with WORKFLOW_PATH.open("w", encoding="utf-8") as f:
        json.dump(workflow, f, ensure_ascii=False, indent=2)
        f.write("\n")

    delta = len(new_js) - len(js_code)
    print(f"PATCHED {NODE_NAME}: jsCode delta = {delta:+d} chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
