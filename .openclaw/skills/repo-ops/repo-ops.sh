#!/usr/bin/env bash
# repo-ops — atomic repo operations for the basedintern agent
# Usage: /repo-ops <command> [args...]
set -euo pipefail

# Navigate to the based-intern subdir (the TypeScript project)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROJECT_DIR="${REPO_ROOT}/based-intern"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: based-intern/ directory not found at $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
  typecheck)
    echo "=== TYPECHECK ==="
    npx tsc --noEmit 2>&1
    echo "=== TYPECHECK: PASS ==="
    ;;

  test)
    echo "=== TEST ==="
    npm test 2>&1
    echo "=== TEST: PASS ==="
    ;;

  build)
    echo "=== BUILD ==="
    if grep -q '"build"' package.json 2>/dev/null; then
      npm run build 2>&1
      echo "=== BUILD: PASS ==="
    else
      echo "No build script found in package.json"
      exit 1
    fi
    ;;

  status)
    echo "=== GIT STATUS ==="
    cd "$REPO_ROOT"
    git status --short 2>&1
    echo ""
    echo "=== GIT DIFF STAT ==="
    git diff --stat 2>&1
    echo ""
    echo "=== BRANCH ==="
    git branch -vv --no-color 2>&1 | head -5
    ;;

  commit)
    MSG="${1:-auto: repo-ops commit}"
    echo "=== GIT COMMIT ==="
    cd "$REPO_ROOT"
    git add -A 2>&1
    git commit -m "$MSG" 2>&1
    echo "=== COMMIT: DONE ==="
    ;;

  push)
    echo "=== GIT PUSH ==="
    cd "$REPO_ROOT"
    git push 2>&1
    echo "=== PUSH: DONE ==="
    ;;

  check)
    echo "=== FULL CHECK (typecheck + test) ==="
    echo ""
    echo "--- Step 1: Typecheck ---"
    npx tsc --noEmit 2>&1
    echo "--- Typecheck: PASS ---"
    echo ""
    echo "--- Step 2: Tests ---"
    npm test 2>&1
    echo "--- Tests: PASS ---"
    echo ""
    echo "=== FULL CHECK: ALL PASS ==="
    ;;

  help|*)
    echo "repo-ops — atomic repo operations"
    echo ""
    echo "Commands:"
    echo "  typecheck    Run npx tsc --noEmit"
    echo "  test         Run npm test"
    echo "  build        Run npm run build"
    echo "  status       Show git status + diff stat"
    echo "  commit MSG   Stage all + commit with message"
    echo "  push         Push current branch to origin"
    echo "  check        Run typecheck + test (stops on failure)"
    echo "  help         Show this help"
    ;;
esac
