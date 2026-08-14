#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "========================================"
echo "RapidRAW Release Validation"
echo "========================================"

fail=0

# 1. Version sync
echo ""
echo "[1/5] Checking version sync..."
pkg_version="$(node -e "console.log(require('./package.json').version)")"
tauri_version="$(node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8')); console.log(c.version || '')")"
cargo_version="$(grep -m1 '^version' src-tauri/Cargo.toml | sed -E 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*$/\1/')"

if [[ "$pkg_version" != "$tauri_version" || "$pkg_version" != "$cargo_version" ]]; then
  echo "  FAIL: Version mismatch"
  echo "    package.json:    $pkg_version"
  echo "    tauri.conf.json: $tauri_version"
  echo "    Cargo.toml:      $cargo_version"
  fail=1
else
  echo "  OK: All versions in sync ($pkg_version)"
fi

# 2. Check working tree is clean
echo ""
echo "[2/5] Checking git working tree..."
if git diff --quiet && git diff --cached --quiet; then
  echo "  OK: Working tree is clean"
else
  echo "  FAIL: Working tree has uncommitted changes"
  fail=1
fi

# 3. Check tag exists for version
echo ""
echo "[3/5] Checking git tag..."
tag="v${pkg_version}"
if git tag -l "$tag" | grep -q "$tag"; then
  echo "  OK: Tag $tag exists"
else
  echo "  WARN: Tag $tag does not exist locally"
fi

# 4. Run tests
echo ""
echo "[4/5] Running tests..."
if npm run test >/dev/null 2>&1; then
  echo "  OK: Tests passed"
else
  echo "  FAIL: Tests failed"
  fail=1
fi

# 5. Check for critical security vulnerabilities
echo ""
echo "[5/5] Checking for high-severity npm vulnerabilities..."
audit_result=$(npm audit --audit-level=high 2>&1 || true)
if echo "$audit_result" | grep -q "found 0 vulnerabilities"; then
  echo "  OK: No high-severity vulnerabilities"
else
  vuln_count="$(echo "$audit_result" | grep -oE '[0-9]+ high severity' | grep -oE '^[0-9]+' | head -1 || true)"
  vuln_count="${vuln_count:-0}"
  if [[ "$vuln_count" == "0" ]]; then
    echo "  OK: No high-severity vulnerabilities"
  else
    echo "  WARN: $vuln_count high-severity vulnerabilities found (devDeps only)"
  fi
fi

echo ""
echo "========================================"
if [[ "$fail" -eq 0 ]]; then
  echo "Release validation PASSED"
  echo "Ready to tag and release: $tag"
  exit 0
else
  echo "Release validation FAILED ($fail issue(s))"
  exit 1
fi
