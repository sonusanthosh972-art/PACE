# Project Agent Guidelines: Paisa Pulse (Monorepo)

This repository is governed by the **GRAVITAS Engineering Reliability Runtime** ([`.agents/skills/gravitas/SKILL.md`](.agents/skills/gravitas/SKILL.md)). All coding agents working in this repository must operate under its core invariants and protocols.

---

## The 6 Invariants

1. **Ground before mutating.**
   Read the target file, its tests, and its callers before editing. Never act on assumed file state or hallucinated APIs.
2. **Stay in declared scope.**
   Only edit files directly within the task's stated scope. If secondary modifications are required, declare them explicitly before acting.
3. **Completion needs evidence.**
   A task or bugfix is complete only when verified by executable validator output passed *after* the last mutation. In this repository, the primary validator is [`./scripts/check.sh`](./scripts/check.sh) (or `npm run check`).
4. **Never exact-retry a failure.**
   If a check, build, or test fails, diagnose root causes before attempting a fix. Repeated byte-identical attempts or uninformed retries are prohibited.
5. **Satisfy the contract.**
   Ensure all acceptance criteria, type contracts, and tests are satisfied before concluding a task.
6. **Say what you can't verify.**
   If any condition, platform behavior (e.g. native Android device execution), or integration cannot be verified locally, explicitly flag it in the final report.

---

## Workspace Structure & Toolchain

This is a multi-package monorepo:
- **`apps/mobile`**: React Native / Expo application (TypeScript, Jest).
- **`apps/api-node`**: Backend API service (Node.js, Express, MongoDB, TypeScript, Jest).
- **`apps/admin`**: Web administration dashboard (Next.js, React, TypeScript, ESLint).
- **Node Version**: Node `24.21.0` (pinned via `.nvmrc`).
- **Primary Validator**: [`./scripts/check.sh`](./scripts/check.sh) (or `npm run check`).

---

## Decision Records

For non-trivial mutations or structural architectural decisions, record the decision before mutating:

```yaml
decision:
  action: [file or module to modify]
  reason: [problem being solved]
  evidence: [observed output, file lines, failing tests]
  risk: [low | medium | high]
  allowed_by_contract: true
```

---

## Standard Output Format

All non-trivial task summaries must follow the Gravitas report format:

```markdown
## What Changed
[Summary of files modified, lines changed, behavioral delta]

## Evidence
[Actual command execution output from ./scripts/check.sh, test counts, type check results]

## Why
[Rationale for architectural choices or fixes applied]
```

