---
name: based-intern-railway-control
description: Attach to the running Based Intern Railway worker via the control server (status + manual tick)
metadata: {"openclaw":{"os":["linux","darwin","win32"],"requires":{"anyBins":["node","npm"]}}}
---

Use this skill when you have:

- A Based Intern agent running on Railway (service name `basedintern`)
- `CONTROL_ENABLED=true` on that worker
- An OpenClaw Gateway service on Railway that can reach the worker over private networking

Base URL (typical Railway private hostname):
- `http://basedintern.railway.internal:8080`

Secrets:
- Put the same `CONTROL_TOKEN` secret on both the worker and the gateway.
- Never print secret values; only confirm success/failure.

Preferred commands (uses the repo script; no curl/jq required):

1) Health (no auth)
- `cd /app/based-intern && npx tsx scripts/control-client.ts health`

2) Status (auth)
- `cd /app/based-intern && CONTROL_TOKEN=$CONTROL_TOKEN npx tsx scripts/control-client.ts status`

3) Manual tick (auth)
- `cd /app/based-intern && CONTROL_TOKEN=$CONTROL_TOKEN npx tsx scripts/control-client.ts tick --reason openclaw`

If you need raw HTTP:
- `curl -sS http://basedintern.railway.internal:8080/healthz`
- `curl -sS -H "Authorization: Bearer $CONTROL_TOKEN" http://basedintern.railway.internal:8080/status`
- `curl -sS -X POST -H "Authorization: Bearer $CONTROL_TOKEN" "http://basedintern.railway.internal:8080/tick?reason=openclaw"`
