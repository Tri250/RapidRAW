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

# 8. Android AI-critical configuration check
echo ""
echo "[8/10] Checking Android AI-critical configuration..."
manifest="src-tauri/gen/android/app/src/main/AndroidManifest.xml"
app_build_gradle="src-tauri/gen/android/app/build.gradle.kts"

if [[ -f "$manifest" ]]; then
  if grep -q 'android:largeHeap="true"' "$manifest"; then
    echo "  OK: Android largeHeap enabled (AI memory requirement)"
  else
    echo "  FAIL: Android largeHeap not enabled - AI models may OOM"
    fail=1
  fi

  if grep -q 'android.permission.INTERNET' "$manifest"; then
    echo "  OK: INTERNET permission present (model download)"
  else
    echo "  FAIL: INTERNET permission missing"
    fail=1
  fi

  if grep -q 'android.permission.READ_MEDIA_IMAGES' "$manifest"; then
    echo "  OK: READ_MEDIA_IMAGES permission present"
  else
    echo "  WARN: READ_MEDIA_IMAGES permission missing"
  fi
else
  echo "  WARN: AndroidManifest.xml not found"
fi

if [[ -f "$app_build_gradle" ]]; then
  if grep -q 'arm64-v8a' "$app_build_gradle"; then
    echo "  OK: ABI filter includes arm64-v8a"
  else
    echo "  FAIL: arm64-v8a ABI filter missing - ONNX Runtime requires this"
    fail=1
  fi

  min_sdk="$(grep -o 'minSdk[[:space:]]*=[[:space:]]*[0-9]*' "$app_build_gradle" | grep -o '[0-9]*')"
  if [[ -n "$min_sdk" && "$min_sdk" -ge 26 ]]; then
    echo "  OK: minSdk=$min_sdk"
  else
    echo "  FAIL: minSdk=$min_sdk (must be >= 26)"
    fail=1
  fi
else
  echo "  WARN: app/build.gradle.kts not found"
fi

# 9. AI model integrity check
echo ""
echo "[9/10] Checking AI model integrity..."

models_dir="src-tauri/models"
mkdir -p "$models_dir"

verify_sha256() {
  local path="$1" expected="$2"
  if [[ ! -f "$path" ]]; then
    echo "missing"
    return
  fi
  local actual
  actual="$(sha256sum "$path" | awk '{print $1}')"
  if [[ "$actual" == "$expected" ]]; then
    echo "ok"
  else
    echo "mismatch"
  fi
}

models=(
  "sam_vit_b_01ec64_encoder.onnx|16ab73d9c824886f0de2938c19df22fb9ec3deebfd0de58e65177e479213d7d1|SAM Encoder"
  "sam_vit_b_01ec64_decoder.onnx|85d0d672cf5b7fe763edcde429e5533e62f674af4b15c7d688b7673b0ef00bf7|SAM Decoder"
  "u2net.onnx|8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491|Foreground Model"
  "skyseg_u2net.onnx|ab9c34c64c3d821220a2886a4a06da4642ffa14d5b30e8d5339056a089aa1d39|Sky Segmentation"
  "depth_anything_v2_vits.onnx|d2b11a11c1d4a12b47608fa65a17ee9a4c605b55ee1730c8e3b526304f2562be|Depth Model"
  "nind_denoise_utnet_684.onnx|ee3586279d514df557ff3f7dec6df37fafc51ba5d3a3435b2cc9ac2d9017e7fe|Denoise Model"
  "lama_fp16.onnx|2d6be6277c400d6f1b91819737f7c3da935e5c63d1b521d393be1196a2bfa82c|Inpainting Model"
  "clip_model.onnx|57879bb1c23cdeb350d23569dd251ed4b740a96d747c529e94a2bb8040ac5d00|CLIP Model"
)

model_issues=0
for entry in "${models[@]}"; do
  IFS='|' read -r filename expected_hash name <<< "$entry"
  path="$models_dir/$filename"
  result="$(verify_sha256 "$path" "$expected_hash")"
  case "$result" in
    ok)
      echo "  OK: $name integrity verified"
      ;;
    missing)
      echo "  WARN: $name missing"
      model_issues=$((model_issues + 1))
      ;;
    mismatch)
      echo "  FAIL: $name SHA256 mismatch (corrupted)"
      model_issues=$((model_issues + 1))
      fail=1
      ;;
  esac
done

if [[ "$model_issues" -gt 0 ]]; then
  echo "       Note: $model_issues model(s) need download. They will auto-download at runtime."
fi

# 10. Rust AI module health check
echo ""
echo "[10/10] Checking Rust AI module health..."

rust_ai_modules=(
  "src-tauri/src/ai_service.rs"
  "src-tauri/src/ai_processing.rs"
  "src-tauri/src/ai_connector.rs"
  "src-tauri/src/android_integration.rs"
  "src-tauri/src/face_landmark.rs"
)

for f in "${rust_ai_modules[@]}"; do
  if [[ -f "$f" ]]; then
    echo "  OK: $f exists"
  else
    echo "  FAIL: $f missing"
    fail=1
  fi
done

if grep -q 'NNAPIExecutionProvider' src-tauri/src/ai_processing.rs 2>/dev/null; then
  echo "  OK: NNAPIExecutionProvider configured for Android"
else
  echo "  FAIL: NNAPIExecutionProvider not found"
  fail=1
fi

if grep -q 'check_available_memory' src-tauri/src/ai_processing.rs 2>/dev/null; then
  echo "  OK: Android memory guard implemented"
else
  echo "  WARN: Android memory guard not detected"
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
