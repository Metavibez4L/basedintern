---
name: based-intern-ops
description: Operate the Based Intern agent (run tests, inspect state, run locally)
metadata: {"openclaw":{"os":["win32","linux","darwin"],"requires":{"anyBins":["node","npm","pnpm"]}}}
---

This skill helps you operate this repository's Based Intern agent.

Location:
- Repo root is `{baseDir}/../..` (two levels up from this skill folder).

Safe defaults:
- Prefer read-only actions first (status, logs, state inspection).
- Never enable live trading unless explicitly requested and all guardrails are understood.
- Never print secret values (e.g. PRIVATE_KEY, API tokens). If you need to confirm env presence, list variable NAMES only.

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

---

Railway + OpenClaw Gateway workflow (remote execution)

Context:
- If you're connected to an OpenClaw Gateway running in Railway using `Dockerfile.openclaw`, the repo is at `/app` and the TypeScript project is at `/app/based-intern`.

Goals:
- Reproduce Railway-only behavior (Linux env, Railway-provided env vars)
- Run safe repo workflows: test/typecheck/build
- Inspect persisted state files if present

Important constraints:
- Don’t assume you can "edit code" in a running Railway container and keep it. Containers are immutable per deploy.
- Use this for execution/verification; make code changes via PRs/commits, then redeploy.

Railway-safe commands (do not leak secrets)

1) Identify deploy + environment
- `cd /app/based-intern`
- `node -v && npm -v`
- `pwd && ls -la`
- `printenv | grep -E '^RAILWAY_' | sort || true`
- `printenv | cut -d= -f1 | sort | sed -n '1,200p'`

2) Run repo workflows in Railway environment
- `cd /app/based-intern && npm test`
- `cd /app/based-intern && npm run typecheck`
- `cd /app/based-intern && npm run build`

3) Validate config without printing secrets
- `cd /app/based-intern && node -e "try{require('./dist/src/config.js').loadConfig(); console.log('CONFIG_OK')}catch(e){console.error(String(e && e.message ? e.message : e)); process.exit(1)}"`

4) Inspect runtime state (if available)
- `cd /app/based-intern && ls -la data || true`
- `cd /app/based-intern && (test -f data/state.json && cat data/state.json | jq '.' || echo 'no data/state.json')`

5) Agent logs
- For the actual Based Intern agent running as a Railway Worker, use Railway's service logs UI.

---

Attach to the running Railway agent (control server)

Prereqs:
- On the Railway **agent service**, set: `CONTROL_ENABLED=true`, `CONTROL_PORT=8080`, `CONTROL_TOKEN=<strong secret>`.
- From the Railway **OpenClaw Gateway service**, call the agent via Railway private networking.

If the agent Railway service name is `basedintern`, the internal base URL is typically:
- `http://basedintern.railway.internal:8080`

Read-only checks:
- `curl -sS http://basedintern.railway.internal:8080/healthz`
- `curl -sS -H "Authorization: Bearer $CONTROL_TOKEN" http://basedintern.railway.internal:8080/status | jq .`

Trigger a manual tick (safe; blocks if a tick is already running):
- `curl -sS -X POST -H "Authorization: Bearer $CONTROL_TOKEN" "http://basedintern.railway.internal:8080/tick?reason=openclaw" | jq .`

If you need to tailor runtime config, edit `.env` or set environment variables before launching the process.
