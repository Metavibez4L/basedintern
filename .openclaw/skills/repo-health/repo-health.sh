#!/usr/bin/env bash
# repo-health — single-command health check returning structured JSON
set -uo pipefail

# Navigate to the based-intern subdir (the TypeScript project)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROJECT_DIR="${REPO_ROOT}/based-intern"

if [ ! -d "$PROJECT_DIR" ]; then
  echo '{"error": "based-intern/ directory not found"}'
  exit 1
fi

cd "$PROJECT_DIR"

# ============================================================
# 1. TYPECHECK
# ============================================================
TSC_OUTPUT=$(npx tsc --noEmit 2>&1) || true
TSC_EXIT=$?

if [ $TSC_EXIT -eq 0 ]; then
  TSC_STATUS="pass"
  TSC_ERRORS=0
else
  TSC_STATUS="fail"
  # Count error lines (lines containing "error TS")
  TSC_ERRORS=$(echo "$TSC_OUTPUT" | grep -c "error TS" 2>/dev/null || echo "0")
fi

# ============================================================
# 2. TESTS
# ============================================================
TEST_OUTPUT=$(npm test 2>&1) || true
TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
  TEST_STATUS="pass"
else
  TEST_STATUS="fail"
fi

# Parse test counts from vitest output
# Format: "Tests  217 passed (217)" or "Tests  5 failed | 212 passed (217)"
TESTS_TOTAL=$(echo "$TEST_OUTPUT" | grep -oP 'Tests\s+.*\((\d+)\)' | grep -oP '\d+(?=\))' | tail -1)
TESTS_PASSED=$(echo "$TEST_OUTPUT" | grep -oP '(\d+)\s+passed' | grep -oP '^\d+' | tail -1)
TESTS_FAILED=$(echo "$TEST_OUTPUT" | grep -oP '(\d+)\s+failed' | grep -oP '^\d+' | tail -1)

# Defaults if parsing fails
TESTS_TOTAL=${TESTS_TOTAL:-0}
TESTS_PASSED=${TESTS_PASSED:-0}
TESTS_FAILED=${TESTS_FAILED:-0}

# ============================================================
# 3. GIT STATUS
# ============================================================
cd "$REPO_ROOT"

GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_CHANGED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

if [ "$GIT_CHANGED" -eq 0 ]; then
  GIT_STATUS="clean"
else
  GIT_STATUS="dirty"
fi

# ============================================================
# OUTPUT JSON
# ============================================================
cat <<ENDJSON
{
  "tsc": "$TSC_STATUS",
  "tsc_errors": $TSC_ERRORS,
  "tests": "$TEST_STATUS",
  "tests_total": $TESTS_TOTAL,
  "tests_passed": $TESTS_PASSED,
  "tests_failed": $TESTS_FAILED,
  "git": "$GIT_STATUS",
  "git_branch": "$GIT_BRANCH",
  "git_changed_files": $GIT_CHANGED
}
ENDJSON

# Also print human-readable summary
echo ""
echo "=== HEALTH SUMMARY ==="
echo "TypeScript: $TSC_STATUS ($TSC_ERRORS errors)"
echo "Tests:      $TEST_STATUS ($TESTS_PASSED/$TESTS_TOTAL passed, $TESTS_FAILED failed)"
echo "Git:        $GIT_STATUS (branch: $GIT_BRANCH, $GIT_CHANGED changed files)"

if [ "$TSC_STATUS" = "pass" ] && [ "$TEST_STATUS" = "pass" ]; then
  echo "=== OVERALL: HEALTHY ==="
else
  echo "=== OVERALL: ISSUES DETECTED ==="
  if [ "$TSC_STATUS" = "fail" ]; then
    echo ""
    echo "TSC errors:"
    echo "$TSC_OUTPUT" | grep "error TS" | head -10
  fi
fi
