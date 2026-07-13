#!/usr/bin/env bash
set -euo pipefail

# 校验 lockfile 一致性
# 用法: ./scripts/verify-lockfiles.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$PROJECT_ROOT"

errors=0

log_info "Verifying package-lock.json is up to date..."
if ! npm ci --dry-run &>/dev/null; then
  log_error "package-lock.json may be out of sync with package.json"
  errors=$((errors + 1))
else
  log_info "package-lock.json is valid."
fi

log_info "Verifying Cargo.lock is up to date..."
if ! cargo metadata --locked --manifest-path src-tauri/Cargo.toml &>/dev/null; then
  log_error "Cargo.lock may be out of sync with Cargo.toml"
  errors=$((errors + 1))
else
  log_info "Cargo.lock is valid."
fi

if [[ $errors -gt 0 ]]; then
  log_error "Lockfile verification failed with $errors error(s)."
  exit 1
fi

log_info "All lockfiles are consistent."