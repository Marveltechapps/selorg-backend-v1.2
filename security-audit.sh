#!/usr/bin/env bash
# CI: detect likely hardcoded credentials (not cache keys, Object.keys, OAuth URLs, etc.)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PATTERN='(password|api[_-]?key|access[_-]?token|private[_-]?key)\s*=\s*['\''"][^'\''"]{6,}['\''"]|(jwt[_-]?secret|client[_-]?secret)\s*=\s*['\''"][^'\''"]{8,}['\''"]'

matches="$(
  grep -rEn "$PATTERN" src/ --include='*.js' 2>/dev/null \
    | grep -vE '(__tests__|\.test\.|\.spec\.|/tests/|mock|example)' \
    || true
)"

# Explicit allowlist for known-safe comparisons / messages
if [ -n "$matches" ]; then
  matches="$(echo "$matches" | grep -vE \
    'dev-insecure-secret-please-change|passwordLastChangedBy|Invalid (or expired )?token|oauth/token|REDACTED' \
    || true)"
fi

if [ -n "$matches" ]; then
  echo 'Possible hardcoded secrets found:'
  echo "$matches"
  exit 1
fi

# seed.js must not ship a default plaintext password literal
if grep -qE "defaultPassword\s*=\s*['\"][^'\"]+['\"]" src/seed.js 2>/dev/null; then
  echo 'src/seed.js must use SEED_DEFAULT_PASSWORD env var, not a hardcoded password literal'
  exit 1
fi

echo 'No hardcoded credential patterns detected.'
exit 0
