name: repo-ops
entry: repo-ops.sh
description: "Run common repo operations (typecheck, test, build, git status, commit, push) as single atomic commands. Eliminates multi-step exec chaining."
# Repo Ops Skill

Run common repository operations as single commands. Each command runs in the `based-intern/` subdirectory of the workspace.

## Commands

### Typecheck
```bash
/repo-ops typecheck
```
Runs `npx tsc --noEmit`. Returns exit code 0 on success, 1 on errors.

### Test
```bash
/repo-ops test
```
Runs `npm test`. Returns test summary and exit code.

### Build
```bash
/repo-ops build
```
Runs `npm run build` if a build script exists.

### Git Status
```bash
/repo-ops status
```
Shows `git status --short` and `git diff --stat` for a quick overview.

### Git Commit
```bash
/repo-ops commit "your commit message here"
```
Stages all changes (`git add -A`) and commits with the provided message.

### Git Push
```bash
/repo-ops push
```
Pushes the current branch to origin.

### Full Check (typecheck + test)
```bash
/repo-ops check
```
Runs typecheck then tests. Stops on first failure.

## Notes

- All commands run from the `based-intern/` subdirectory automatically.
- Use `check` for a quick health assessment before committing.
- Each command is atomic — no multi-step reasoning needed.
