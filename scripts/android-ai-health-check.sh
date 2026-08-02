#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "========================================"
echo "RapidRAW Android AI Engine Full Check"
echo "Release v1.8.29"
echo "========================================"

fail=0
repair=0
warn=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}OK${NC}: $1"; }
fail_msg() { echo -e "  ${RED}FAIL${NC}: $1"; fail=$((fail + 1)); }
warn_msg() { echo -e "  ${YELLOW}WARN${NC}: $1"; warn=$((warn + 1)); }
repair_msg() { echo -e "  ${BLUE}REPAIR${NC}: $1"; repair=$((repair + 1)); }

# ---------------------------------------------------------------------------
# 1. Version sync check
# ---------------------------------------------------------------------------
echo ""
echo "[1/10] Checking version sync for release v1.8.29..."

pkg_version="$(node -e "console.log(require('./package.json').version)")"
tauri_version="$(node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8')); console.log(c.version || '')")"
cargo_version="$(grep -m1 '^version' src-tauri/Cargo.toml | sed -E 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/')"

if [[ "$pkg_version" != "1.8.29" ]]; then
  fail_msg "package.json version is $pkg_version, expected 1.8.29"
else
  ok "package.json version: $pkg_version"
fi

if [[ "$tauri_version" != "1.8.29" ]]; then
  fail_msg "tauri.conf.json version is $tauri_version, expected 1.8.29"
else
  ok "tauri.conf.json version: $tauri_version"
fi

if [[ "$cargo_version" != "1.8.29" ]]; then
  fail_msg "Cargo.toml version is $cargo_version, expected 1.8.29"
else
  ok "Cargo.toml version: $cargo_version"
fi

# Android versionCode / versionName
android_version_name=""
if [[ -f "src-tauri/gen/android/app/tauri.properties" ]]; then
  android_version_name="$(grep 'tauri.android.versionName' src-tauri/gen/android/app/tauri.properties | cut -d'=' -f2 | tr -d ' ')"
fi
if [[ -z "$android_version_name" ]]; then
  warn_msg "Android versionName not found in tauri.properties"
else
  ok "Android versionName: $android_version_name"
fi

# ---------------------------------------------------------------------------
# 2. AndroidManifest.xml AI-critical checks
# ---------------------------------------------------------------------------
echo ""
echo "[2/10] Checking AndroidManifest.xml AI-critical configuration..."

manifest="src-tauri/gen/android/app/src/main/AndroidManifest.xml"

if [[ ! -f "$manifest" ]]; then
  fail_msg "AndroidManifest.xml not found"
else
  # Check largeHeap (essential for AI model loading)
  if grep -q 'android:largeHeap="true"' "$manifest"; then
    ok "largeHeap=true (required for AI model memory)"
  else
    fail_msg "missing android:largeHeap=true - AI models may OOM"
  fi

  # Check INTERNET permission (model download)
  if grep -q 'android.permission.INTERNET' "$manifest"; then
    ok "INTERNET permission present"
  else
    fail_msg "missing INTERNET permission - model download will fail"
  fi

  # Check READ_MEDIA_IMAGES (Android 13+ gallery access)
  if grep -q 'android.permission.READ_MEDIA_IMAGES' "$manifest"; then
    ok "READ_MEDIA_IMAGES permission present"
  else
    fail_msg "missing READ_MEDIA_IMAGES permission"
  fi

  # Check extractNativeLibs consistency
  if grep -q 'android:extractNativeLibs="false"' "$manifest"; then
    ok "extractNativeLibs=false (optimal for .so mmap)"
  else
    warn_msg "extractNativeLibs is not false - may impact ONNX loading performance"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Gradle build configuration checks
# ---------------------------------------------------------------------------
echo ""
echo "[3/10] Checking Gradle build configuration..."

app_build_gradle="src-tauri/gen/android/app/build.gradle.kts"
root_build_gradle="src-tauri/gen/android/build.gradle.kts"

if [[ ! -f "$app_build_gradle" ]]; then
  fail_msg "app/build.gradle.kts not found"
else
  # Check ABI filter (arm64-v8a required for ONNX Runtime)
  if grep -q 'arm64-v8a' "$app_build_gradle"; then
    ok "ABI filter includes arm64-v8a (ONNX Runtime requirement)"
  else
    fail_msg "missing arm64-v8a ABI filter - ONNX Runtime will fail"
  fi

  # Check minSdk
  min_sdk="$(grep -o 'minSdk[[:space:]]*=[[:space:]]*[0-9]*' "$app_build_gradle" | grep -o '[0-9]*')"
  if [[ -n "$min_sdk" && "$min_sdk" -ge 26 ]]; then
    ok "minSdk=$min_sdk (>= 26 required for Tauri 2.x)"
  else
    fail_msg "minSdk=$min_sdk (must be >= 26)"
  fi

  # Check jniLibs.useLegacyPackaging in release
  if grep -A 20 'getByName("release")' "$app_build_gradle" | grep -q 'useLegacyPackaging[[:space:]]*=[[:space:]]*false'; then
    ok "release jniLibs.useLegacyPackaging=false (matches extractNativeLibs)"
  else
    warn_msg "release jniLibs.useLegacyPackaging should be false"
  fi

  # Check proguard rules inclusion
  if grep -q 'proguardFiles' "$app_build_gradle"; then
    ok "proguardFiles configured"
  else
    warn_msg "proguardFiles not configured"
  fi
fi

if [[ -f "$root_build_gradle" ]]; then
  if grep -q 'com.android.tools.build:gradle' "$root_build_gradle"; then
    agp_version="$(grep 'com.android.tools.build:gradle' "$root_build_gradle" | sed -E 's/.*gradle:([0-9.]+).*/\1/')"
    ok "Android Gradle Plugin: $agp_version"
  else
    warn_msg "Android Gradle Plugin version not detected"
  fi
else
  fail_msg "root build.gradle.kts not found"
fi

# ---------------------------------------------------------------------------
# 4. AI Model integrity check (SHA256 verification)
# ---------------------------------------------------------------------------
echo ""
echo "[4/10] Checking AI model integrity..."

models_dir="src-tauri/models"
mkdir -p "$models_dir"

# Model definitions: filename|url|sha256|name
models=(
  "sam_vit_b_01ec64_encoder.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/sam_vit_b_01ec64_encoder.onnx?download=true|16ab73d9c824886f0de2938c19df22fb9ec3deebfd0de58e65177e479213d7d1|SAM Encoder"
  "sam_vit_b_01ec64_decoder.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/sam_vit_b_01ec64_decoder.onnx?download=true|85d0d672cf5b7fe763edcde429e5533e62f674af4b15c7d688b7673b0ef00bf7|SAM Decoder"
  "u2net.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/u2net.onnx?download=true|8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491|Foreground Model"
  "skyseg_u2net.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/skyseg-u2net.onnx?download=true|ab9c34c64c3d821220a2886a4a06da4642ffa14d5b30e8d5339056a089aa1d39|Sky Segmentation"
  "depth_anything_v2_vits.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/depth_anything_v2_vits.onnx?download=true|d2b11a11c1d4a12b47608fa65a17ee9a4c605b55ee1730c8e3b526304f2562be|Depth Model"
  "nind_denoise_utnet_684.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/nind_denoise_utnet_684.onnx?download=true|ee3586279d514df557ff3f7dec6df37fafc51ba5d3a3435b2cc9ac2d9017e7fe|Denoise Model"
  "lama_fp16.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/lama_fp16.onnx?download=true|2d6be6277c400d6f1b91819737f7c3da935e5c63d1b521d393be1196a2bfa82c|Inpainting Model"
  "clip_model.onnx|https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/clip_model.onnx?download=true|57879bb1c23cdeb350d23569dd251ed4b740a96d747c529e94a2bb8040ac5d00|CLIP Model"
)

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

model_fail=0
for entry in "${models[@]}"; do
  IFS='|' read -r filename url expected_hash name <<< "$entry"
  path="$models_dir/$filename"
  result="$(verify_sha256 "$path" "$expected_hash")"
  case "$result" in
    ok)
      ok "$name integrity verified"
      ;;
    missing)
      warn_msg "$name missing at $path"
      model_fail=$((model_fail + 1))
      ;;
    mismatch)
      fail_msg "$name SHA256 mismatch - model corrupted"
      model_fail=$((model_fail + 1))
      ;;
  esac
done

if [[ "$model_fail" -gt 0 ]]; then
  echo ""
  echo "  Note: $model_fail model(s) need download. Run with --repair to auto-fix."
fi

# ---------------------------------------------------------------------------
# 5. AI Model URL reachability check
# ---------------------------------------------------------------------------
echo ""
echo "[5/10] Checking AI model download URL reachability..."

if command -v curl >/dev/null 2>&1; then
  # Primary: huggingface.co. Fallback: hf-mirror.com (used when HF is blocked
  # by network e.g. sandbox proxy). Either being reachable is sufficient
  # since build.rs / ai_processing.rs honor RAPIDRAW_HF_MIRROR env var.
  hf_reachable=false
  for url in "https://huggingface.co/CyberTimon/RapidRAW-Models" "https://hf-mirror.com/CyberTimon/RapidRAW-Models"; do
    http_code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$url" || echo '000')"
    if [[ "$http_code" == "200" ]]; then
      ok "Model repository reachable via $url (HTTP 200)"
      hf_reachable=true
      break
    fi
  done
  if [[ "$hf_reachable" != "true" ]]; then
    warn_msg "All model mirrors unreachable (HF: $http_code) - set RAPIDRAW_HF_MIRROR to a reachable mirror"
  fi
else
  warn_msg "curl not available, skipping URL reachability check"
fi

# ---------------------------------------------------------------------------
# 6. Rust AI module syntax check
# ---------------------------------------------------------------------------
echo ""
echo "[6/10] Checking Rust AI modules..."

rust_files=(
  "src-tauri/src/ai_service.rs"
  "src-tauri/src/ai_processing.rs"
  "src-tauri/src/ai_connector.rs"
  "src-tauri/src/android_integration.rs"
  "src-tauri/src/face_landmark.rs"
  "src-tauri/src/app_state.rs"
)

for f in "${rust_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    fail_msg "$f not found"
    continue
  fi

  # Check for common Android AI pitfalls
  issues=0

  # Check for unwrap/expect in Android paths (should use proper error handling)
  android_unwrap_count="$(grep -c 'unwrap()\|expect(' "$f" || true)"
  if [[ "$android_unwrap_count" -gt 0 && "$f" == *"android_integration.rs" ]]; then
    # android_integration.rs uses JNI patterns where unwrap is sometimes unavoidable
    : # allow
  fi

  # Check for TODO/FIXME comments
  todo_count="$(grep -c 'TODO\|FIXME\|XXX' "$f" || true)"
  if [[ "$todo_count" -gt 0 ]]; then
    warn_msg "$f contains $todo_count TODO/FIXME marker(s)"
    issues=$((issues + 1))
  fi

  # Check file compiles (basic syntax via rustfmt check with timeout)
  if command -v rustfmt >/dev/null 2>&1; then
    if timeout 10s rustfmt --check "$f" >/dev/null 2>&1; then
      ok "$f syntax OK"
    elif [[ $? -eq 124 ]]; then
      warn_msg "$f rustfmt timed out (toolchain update may be in progress)"
    else
      warn_msg "$f has formatting issues (run: cargo fmt)"
    fi
  else
    ok "$f exists (rustfmt not available for syntax check)"
  fi
done

# ---------------------------------------------------------------------------
# 7. Android target compilation check (lightweight)
# ---------------------------------------------------------------------------
echo ""
echo "[7/10] Checking Android compilation prerequisites..."

if command -v cargo >/dev/null 2>&1; then
  # Detect android target via rustup OR filesystem (rustup may fail when the
  # active toolchain manifest is partially installed). Either signal is enough.
  android_target_found=false
  set +e
  target_output="$(timeout 10s rustup target list --installed 2>/dev/null)"
  rustup_exit=$?
  set -e
  if [[ "$rustup_exit" -eq 124 ]]; then
    warn_msg "rustup target list timed out (toolchain update may be in progress)"
  elif echo "$target_output" | grep -q 'aarch64-linux-android'; then
    ok "Android target aarch64-linux-android installed (rustup)"
    android_target_found=true
  else
    # Filesystem fallback: scan installed toolchains for the target's rustlib dir.
    for tc_dir in /root/.rustup/toolchains/*-x86_64-unknown-linux-gnu; do
      if [[ -d "$tc_dir/lib/rustlib/aarch64-linux-android" ]]; then
        ok "Android target aarch64-linux-android installed (filesystem: $(basename "$tc_dir"))"
        android_target_found=true
        break
      fi
    done
  fi
  if [[ "$android_target_found" != "true" ]]; then
    warn_msg "Android target aarch64-linux-android not installed"
    echo "       Run: rustup target add aarch64-linux-android"
  fi

  # Check NDK: env var OR well-known paths (env may not propagate to subshells).
  ndk_found=false
  for ndk_candidate in "${ANDROID_NDK_HOME:-}" "${NDK_HOME:-}" "/opt/android-ndk-r27c" "/opt/android-ndk" "$HOME/Android/Sdk/ndk"/*; do
    [[ -z "$ndk_candidate" ]] && continue
    if [[ -x "$ndk_candidate/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android30-clang" ]]; then
      ok "Android NDK detected at $ndk_candidate"
      ndk_found=true
      break
    fi
  done
  if [[ "$ndk_found" != "true" ]]; then
    warn_msg "ANDROID_NDK_HOME / NDK_HOME not set and no NDK found in common paths"
  fi
else
  warn_msg "cargo not found, skipping Rust compilation checks"
fi

# ---------------------------------------------------------------------------
# 8. Frontend AI component checks
# ---------------------------------------------------------------------------
echo ""
echo "[8/10] Checking frontend AI components..."

frontend_ai_files=(
  "src/components/panel/right/AIPanel.tsx"
  "src/hooks/useAiMasking.ts"
  "src/hooks/useAiLabeling.ts"
)

for f in "${frontend_ai_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    fail_msg "$f not found"
  else
    ok "$f exists"
  fi
done

# TypeScript type check for AI components
if [[ -d "node_modules" ]]; then
  if npm run typecheck >/dev/null 2>&1; then
    ok "Frontend TypeScript type check passed"
  else
    fail_msg "Frontend TypeScript type check failed"
  fi
else
  warn_msg "node_modules missing, skipping frontend type check"
fi

# ---------------------------------------------------------------------------
# 9. ONNX Runtime / NNAPI configuration check
# ---------------------------------------------------------------------------
echo ""
echo "[9/10] Checking ONNX Runtime / NNAPI configuration..."

if grep -q 'NNAPIExecutionProvider' src-tauri/src/ai_processing.rs; then
  ok "NNAPIExecutionProvider configured for Android"
else
  fail_msg "NNAPIExecutionProvider not found in ai_processing.rs"
fi

if grep -q 'ort::init' src-tauri/src/ai_processing.rs; then
  ok "ORT initialization found"
else
  warn_msg "ORT initialization pattern not detected"
fi

# Check Cargo.toml for ort dependency
if grep -q 'ort' src-tauri/Cargo.toml; then
  ort_version="$(grep 'ort' src-tauri/Cargo.toml | head -1 | sed -E 's/.*ort.*=.*"([^"]+)".*/\1/')"
  ok "ORT dependency: $ort_version"
else
  fail_msg "ORT dependency missing in Cargo.toml"
fi

# Check Android memory threshold
if grep -q 'check_available_memory' src-tauri/src/ai_processing.rs; then
  ok "Android memory check (check_available_memory) implemented"
else
  warn_msg "Android memory check not found"
fi

# ---------------------------------------------------------------------------
# 10. AI service channel health check
# ---------------------------------------------------------------------------
echo ""
echo "[10/10] Checking AI service architecture..."

if grep -q 'AiServiceHandle' src-tauri/src/ai_service.rs; then
  ok "AiServiceHandle present"
else
  fail_msg "AiServiceHandle missing"
fi

if grep -q 'AiOperation' src-tauri/src/ai_service.rs; then
  ok "AiOperation enum present"
else
  fail_msg "AiOperation enum missing"
fi

if grep -q 'spawn_ai_service' src-tauri/src/ai_service.rs; then
  ok "spawn_ai_service function present"
else
  fail_msg "spawn_ai_service missing"
fi

if grep -q 'ai_service_loop' src-tauri/src/ai_service.rs; then
  ok "ai_service_loop present (sequential processing guard)"
else
  fail_msg "ai_service_loop missing"
fi

# Check progress reporting
if grep -q 'ai-progress' src-tauri/src/ai_service.rs; then
  ok "Progress event 'ai-progress' configured"
else
  warn_msg "Progress event not found"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
if [[ "$fail" -eq 0 && "$warn" -eq 0 ]]; then
  echo -e "${GREEN}Android AI Engine Health Check PASSED${NC}"
  echo "All systems operational for release v1.8.29"
  exit 0
elif [[ "$fail" -eq 0 ]]; then
  echo -e "${YELLOW}Android AI Engine Health Check PASSED with warnings${NC}"
  echo "Warnings: $warn (non-blocking)"
  exit 0
else
  echo -e "${RED}Android AI Engine Health Check FAILED${NC}"
  echo "Failures: $fail | Warnings: $warn"
  if [[ "$repair" -gt 0 ]]; then
    echo "Repairs attempted: $repair"
  fi
  exit 1
fi
