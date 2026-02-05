# OpenClaw on Railway (Optional)

You can run an **OpenClaw Gateway** on Railway so you can connect to it remotely and run repo workflows (tests/build/typecheck) in the same environment your production deploy uses.

Recommended architecture on Railway:

- **Service A (Worker):** Based Intern agent (the actual bot)
- **Service B (Web):** OpenClaw Gateway (remote control plane for ops/dev)

If your agent service name is `basedintern`, its private-network hostname is typically:

- `http://basedintern.railway.internal`

## Security warning

An OpenClaw Gateway can execute actions via tools/skills. Treat it like production remote access:

- Always set a strong `OPENCLAW_GATEWAY_TOKEN`
- Never expose the token publicly
- Prefer private networking (e.g. Tailscale) when possible

## Option A (recommended): Run only the Based Intern agent

See [docs/RAILWAY.md](docs/RAILWAY.md).

## Option B: Run an OpenClaw Gateway as a separate Railway Web Service

This repo includes a dedicated Dockerfile at the repo root: `Dockerfile.openclaw`.

### 1) Create a Railway service

- Create a new service from this GitHub repo.
- Configure it as a **Web** service.
- Set Dockerfile path to `Dockerfile.openclaw`.

This image installs the `based-intern/` dependencies so the gateway can run repo commands inside Railway.

### 2) Set Railway Variables

Required:
- `OPENCLAW_GATEWAY_TOKEN=...` (strong secret)

Optional:
- `OPENCLAW_GATEWAY_PORT` is not used; Railway uses `PORT` automatically.

### 3) Deploy and get the URL

Railway will give you a public URL like:

- `https://<service>.up.railway.app`

The Gateway is WebSocket-based; your URL will be `wss://...`.

### 4) Point your local OpenClaw CLI at the remote gateway

On your local machine, configure:

- Remote URL (example): `wss://<service>.up.railway.app`
- Remote token: the same `OPENCLAW_GATEWAY_TOKEN`

If your local config currently uses local loopback, you will need to set the `gateway.remoteUrl` and token fields in your OpenClaw config.

To run a minimal agent turn via the gateway, you must select a session or agent id. For example:

- `openclaw agent --agent main --message "pong" --json`

### What this enables (realistic workflow)

- Run `npm test`, `npm run typecheck`, inspect logs/state, and reproduce Railway-only behavior (env vars, Linux, etc.) through OpenClaw.
- Improve the deployed agent by iterating locally (or via PRs), then letting Railway redeploy automatically.

For copy/paste-safe commands (including "list env names without leaking secrets"), use the `based-intern-ops` skill.

For attaching to the running Railway worker (status + manual tick), use the `based-intern-railway-control` skill.

### Attaching to the running agent (via private network)

Enable the agent control server on the **agent service**:

- `CONTROL_ENABLED=true`
- `CONTROL_PORT=8080`
- `CONTROL_TOKEN=<strong secret>`

Then from the **OpenClaw Gateway service**, you can call the running agent over Railway private networking:

- `curl -sS http://basedintern.railway.internal:8080/healthz`
- `curl -sS -H "Authorization: Bearer $CONTROL_TOKEN" http://basedintern.railway.internal:8080/status | jq .`
- `curl -sS -X POST -H "Authorization: Bearer $CONTROL_TOKEN" "http://basedintern.railway.internal:8080/tick?reason=openclaw" | jq .`

Tip: set the same `CONTROL_TOKEN` value as a secret on both services so you can reuse it inside the gateway container.

Important: containers on Railway are immutable per deploy; file edits made inside a running container won’t persist across redeploys. Treat the Railway gateway as a *remote execution environment*, not the source of truth for code.

### Notes

- This uses `openclaw gateway run --dev --allow-unconfigured` so the container can boot without a pre-existing `~/.openclaw/openclaw.json`.
- The repo is copied into the image so workspace skills (like `based-intern-ops`) are available.
