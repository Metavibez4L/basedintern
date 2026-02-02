# OpenClaw (optional) integration

This repo can be used as an OpenClaw workspace skill pack.

## Prereqs

OpenClaw requires Node >= 22.12.

On Windows, OpenClaw recommends using WSL2 (Ubuntu) for best compatibility.

## Install OpenClaw

If you have Node >= 22.12:

- `npm install -g openclaw@latest`
- Run the wizard: `openclaw onboard --install-daemon`

### Windows note: global npm bin on PATH

On Windows, `npm install -g` installs shims into `%APPDATA%\npm`.

If `openclaw` is not recognized, either:

- Add `%APPDATA%\npm` to your PATH, or
- Run it directly: `%APPDATA%\npm\openclaw.cmd`

## Use this repo’s skills

OpenClaw loads skills from `<workspace>/skills`.

Options:

1) Use this repo as your OpenClaw workspace
- Point your OpenClaw agent workspace at this repository folder.
- The skill is at `skills/based-intern-ops/SKILL.md`.

2) Keep a different workspace, but load this repo’s skill folder
- Add `skills.load.extraDirs` to your `~/.openclaw/openclaw.json` and include this repo’s `skills` folder path.

After changing skills, start a new OpenClaw session (or ensure the skills watcher is enabled).
