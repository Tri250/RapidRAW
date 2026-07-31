#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "========================================"
echo "RapidRAW Health Check & Self-Repair"
echo "========================================"

fail=0

# 1. Version sync check
echo ""
echo "[1/7] Checking version sync..."
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

# 2. Rust toolchain alignment
echo ""
echo "[2/7] Checking Rust toolchain alignment..."
rust_minver="$(grep -m1 '^rust-version' src-tauri/Cargo.toml | sed -E 's/^rust-version[[:space:]]*=[[:space:]]*"([^"]+)".*$/\1/')"
toolchain_channel=""
if [[ -f rust-toolchain.toml ]]; then
  toolchain_channel="$(grep -m1 'channel' rust-toolchain.toml | sed -E 's/.*channel[[:space:]]*=[[:space:]]*"([^"]+)".*$/\1/')"
fi
if [[ -n "${rust_minver}" && -n "${toolchain_channel}" && "${rust_minver}" != "${toolchain_channel}" ]]; then
  echo "  FAIL: Rust version mismatch"
  fail=1
else
  echo "  OK: Rust toolchain aligned"
fi

# 3. Node dependencies
echo ""
echo "[3/7] Checking Node dependencies..."
if [[ ! -d node_modules ]]; then
  echo "  REPAIR: Installing node_modules..."
  npm install
else
  echo "  OK: node_modules exists"
fi

# 4. Frontend type check
echo ""
echo "[4/7] Running frontend type check..."
if npm run typecheck >/dev/null 2>&1; then
  echo "  OK: TypeScript type check passed"
else
  echo "  FAIL: TypeScript type check failed"
  fail=1
fi

# 5. Frontend tests
echo ""
echo "[5/7] Running frontend tests..."
if npm run test >/dev/null 2>&1; then
  echo "  OK: Frontend tests passed"
else
  echo "  FAIL: Frontend tests failed"
  fail=1
fi

# 6. Tauri config validation
echo ""
echo "[6/7] Validating Tauri config..."
if node -e "
  const fs = require('fs');
  const config = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  if (!config.identifier) { throw new Error('Missing app identifier'); }
  if (!config.version) { throw new Error('Missing app version'); }
  if (!config.build?.frontendDist) { throw new Error('Missing frontendDist'); }
  if (!config.bundle?.icon || config.bundle.icon.length === 0) { throw new Error('Missing bundle icons'); }
" 2>/dev/null; then
  echo "  OK: Tauri config valid"
else
  echo "  FAIL: Tauri config validation failed"
  fail=1
fi

# 7. Capabilities check
echo ""
echo "[7/7] Checking capabilities..."
if [[ -f "src-tauri/capabilities/default.json" ]]; then
  echo "  OK: Default capabilities file exists"
else
  echo "  FAIL: Missing default capabilities file"
  fail=1
fi

echo ""
echo "========================================"
if [[ "$fail" -eq 0 ]]; then
  echo "Health check PASSED"
  exit 0
else
  echo "Health check FAILED ($fail issue(s))"
  exit 1
fi
