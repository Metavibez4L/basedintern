# Last Verified

- **Date**: 2026-02-04
- **Tests**: All 197 tests passing
- **Build**: npm run build successful
- **OpenClaw Agent**: basedintern agent configured and operational

## Verification Commands

```bash
npm test
npm run build
npm run typecheck
```

## OpenClaw Integration

This repo is configured as an OpenClaw agent workspace with:
- Agent ID: `basedintern`
- Workspace: `/home/manifest/basedintern/based-intern`
- Tools: coding profile (read, write, exec, process)
- Skills: `based-intern-ops`, `based-intern-railway-control`

Run via:
```bash
openclaw --profile dev agent --agent basedintern --local --thinking off --message "Your task"
```
