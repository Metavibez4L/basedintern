name: repo-health
entry: repo-health.sh
description: "Run a full health check (typecheck + tests + git status) in one command. Returns structured JSON output for easy parsing."
# Repo Health Skill

Run a complete repository health check in a single command. Returns structured JSON so the agent can quickly assess the state of the codebase.

## Usage

```bash
/repo-health
```

## Output Format

Returns JSON with three sections:

```json
{
  "tsc": "pass",
  "tsc_errors": 0,
  "tests": "pass",
  "tests_total": 217,
  "tests_passed": 217,
  "tests_failed": 0,
  "git": "clean",
  "git_branch": "main",
  "git_changed_files": 0
}
```

## Field Reference

| Field | Values | Description |
|-------|--------|-------------|
| `tsc` | `pass` / `fail` | TypeScript compilation result |
| `tsc_errors` | number | Count of tsc errors (0 = clean) |
| `tests` | `pass` / `fail` | Test suite result |
| `tests_total` | number | Total tests run |
| `tests_passed` | number | Tests that passed |
| `tests_failed` | number | Tests that failed |
| `git` | `clean` / `dirty` | Working tree state |
| `git_branch` | string | Current branch name |
| `git_changed_files` | number | Number of modified/untracked files |

## When to Use

- Before making changes: verify baseline health
- After making changes: verify nothing broke
- Before committing: confirm typecheck + tests pass
- As a quick status report
