#!/usr/bin/env python3
"""Gravitas Antigravity Lifecycle Hook Handler.

Implements Antigravity's PreToolUse, PostToolUse, and SessionStart contracts
to deterministically enforce Gravitas invariants and inject runtime context.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input) if raw_input.strip() else {}
    except Exception:
        payload = {}

    tool_call = payload.get("toolCall")

    # SessionStart event (no toolCall in payload)
    if not tool_call:
        response = {
            "injectSteps": [
                {
                    "systemMessage": {
                        "systemMessage": (
                            "GRAVITAS Reliability Runtime is active. Invariants: "
                            "(1) Ground before mutating, (2) Stay in declared scope, "
                            "(3) Completion needs evidence (./scripts/check.sh), "
                            "(4) Never exact-retry failures, (5) Satisfy task contract, "
                            "(6) Report unverified claims."
                        )
                    }
                }
            ]
        }
        sys.stdout.write(json.dumps(response))
        return 0

    # PreToolUse / PostToolUse events
    tool_name = tool_call.get("name", "")
    args = tool_call.get("args", {})

    # Check for read-only contract or lock file
    workspace_root = Path(__file__).resolve().parents[2]
    contract_file = workspace_root / ".agents" / "contract.json"
    read_only_marker = workspace_root / ".agents" / ".read_only"

    is_mutation_tool = tool_name in {"edit_file", "write_file"}

    if is_mutation_tool:
        # If explicitly marked read-only or contract specifies read-only mode
        if read_only_marker.is_file():
            sys.stdout.write(
                json.dumps(
                    {
                        "decision": "deny",
                        "reason": "GRAVITAS Guard: Workspace is currently in read-only mode.",
                    }
                )
            )
            return 0

        if contract_file.is_file():
            try:
                contract = json.loads(contract_file.read_text(encoding="utf-8"))
                mode = contract.get("mode", "implement")
                read_only_modes = {"answer", "research", "plan", "review", "security-review"}
                if mode in read_only_modes:
                    sys.stdout.write(
                        json.dumps(
                            {
                                "decision": "deny",
                                "reason": f"GRAVITAS Guard: Current contract mode '{mode}' prohibits file mutations.",
                            }
                        )
                    )
                    return 0

                # Check allowed write scope if configured
                allowed_scope = contract.get("allowed_write_scope")
                if allowed_scope and isinstance(allowed_scope, list):
                    target_path = str(args.get("Path", ""))
                    if not any(target_path.startswith(str(workspace_root / p)) or target_path.startswith(p) for p in allowed_scope):
                        sys.stdout.write(
                            json.dumps(
                                {
                                    "decision": "deny",
                                    "reason": f"GRAVITAS Guard: Path '{target_path}' is outside allowed write scope {allowed_scope}.",
                                }
                            )
                        )
                        return 0
            except Exception:
                pass

    # Default allowance for PreToolUse
    # If this is called in PostToolUse context, returning empty dict or allow is safe
    if "error" in payload:
        # PostToolUse contract expects {}
        sys.stdout.write(json.dumps({}))
    else:
        sys.stdout.write(json.dumps({"decision": "allow"}))

    return 0


if __name__ == "__main__":
    sys.exit(main())

