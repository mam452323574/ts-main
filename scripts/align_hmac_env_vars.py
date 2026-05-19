#!/usr/bin/env python3
"""
align_hmac_env_vars.py
Patches Sign/Verify nodes in coach, coach-conversation, analyse_1
to use $env.PHASE2_WEBHOOK_HMAC_SECRET (same as fridge-scan-chef)
instead of process.env.COACH_WEBHOOK_HMAC_SECRET.
"""
import json
from pathlib import Path

WORKFLOWS_DIR = Path(__file__).resolve().parent.parent / "n8n" / "workflows"
FILES = ["coach.json", "coach-conversation.json", "analyse_1.json"]

REPLACEMENTS = [
    # Sign node: align secret lookup
    (
        "(process.env.COACH_WEBHOOK_HMAC_SECRET || process.env.SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET || '')",
        "($env.PHASE2_WEBHOOK_HMAC_SECRET || $env.COACH_WEBHOOK_HMAC_SECRET || '')",
    ),
    # Verify node: align secret lookup
    (
        "(process.env.COACH_WEBHOOK_HMAC_SECRET || '')",
        "($env.PHASE2_WEBHOOK_HMAC_SECRET || $env.COACH_WEBHOOK_HMAC_SECRET || '')",
    ),
    # Enforce flag
    (
        "(process.env.COACH_WEBHOOK_HMAC_ENFORCE || '')",
        "($env.COACH_WEBHOOK_HMAC_ENFORCE || '')",
    ),
]

def main():
    for fname in FILES:
        fp = WORKFLOWS_DIR / fname
        if not fp.exists():
            print(f"[SKIP] {fname} not found")
            continue

        with open(fp, "r", encoding="utf-8") as f:
            wf = json.load(f)

        changed = False
        for node in wf["nodes"]:
            name = node.get("name", "")
            if "Sign Webhook Response" not in name and "Verify" not in name:
                continue

            code = node.get("parameters", {}).get("jsCode", "")
            new_code = code
            for old, new in REPLACEMENTS:
                new_code = new_code.replace(old, new)

            if new_code != code:
                node["parameters"]["jsCode"] = new_code
                changed = True
                print(f"  Patched: {name}")

        if changed:
            with open(fp, "w", encoding="utf-8") as f:
                json.dump(wf, f, indent=2, ensure_ascii=False)
            print(f"  Saved: {fname}")
        else:
            print(f"  No changes: {fname}")

if __name__ == "__main__":
    main()
