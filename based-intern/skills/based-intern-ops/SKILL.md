---
name: based-intern-ops
description: Operate the Based Intern agent (run tests, inspect state, run locally)
metadata: {"openclaw":{"os":["win32","linux","darwin"],"requires":{"anyBins":["node","npm","pnpm"],"bins":["git"]}}}
---

This skill helps you operate this repository's Based Intern agent.

Location:
- Repo root is `{baseDir}/../..` (two levels up from this skill folder).

Safe defaults:
- Prefer read-only actions first (status, logs, state inspection).
- Never enable live trading unless explicitly requested and all guardrails are understood.

Common actions (run from repo root):

1) Check health
- `node -v`
- `npm -v`
- `npm test`
- `npm run lint`
- `npm run typecheck`

2) Run the agent locally (safe)
- `npm run dev`
  - Uses `.env` defaults; `DRY_RUN=true`, `TRADING_ENABLED=false`, `SOCIAL_MODE=none` unless you override.

3) Inspect persisted state
- Read `data/state.json` to see last post/trade times and circuit breakers.

4) Build + run production bundle
- `npm run build`
- `npm start`

If you need to tailor runtime config, edit `.env` or set environment variables before launching the process.
