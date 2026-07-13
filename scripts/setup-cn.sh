#!/usr/bin/env bash
set -euo pipefail

# 国内开发环境一键初始化脚本
# 用法: ./scripts/setup-cn.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

cd "$PROJECT_ROOT"

# 1. 检查必要工具
check_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 is not installed. Please install it first."
    return 1
  fi
  log_info "$1 found"
}

log_info "Checking required tools..."
check_command node
check_command npm
check_command cargo
check_command rustc

# 2. 应用 Cargo 国内镜像配置
log_info "Configuring Cargo for China network..."
mkdir -p "$HOME/.cargo"
if [[ -f "$HOME/.cargo/config" ]] && [[ ! -f "$HOME/.cargo/config.bak" ]]; then
  cp "$HOME/.cargo/config" "$HOME/.cargo/config.bak"
  log_warn "Backup existing ~/.cargo/config to ~/.cargo/config.bak"
fi
cp "$PROJECT_ROOT/.cargo/config" "$HOME/.cargo/config"

# 3. 应用 npm 国内镜像配置
log_info "npm registry configuration is provided by .npmrc"

# 4. 安装前端依赖
log_info "Installing frontend dependencies with npm ci..."
npm ci

# 5. 安装 Rust 目标（用于 Android 开发）
log_info "Installing Rust targets for Android..."
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android 2>/dev/null || true

# 6. 应用 Gradle 国内配置（可选，用于 Android 构建）
if [[ -d "$PROJECT_ROOT/src-tauri/gen/android" ]]; then
  log_info "Applying China Gradle configuration for Android..."
  cd "$PROJECT_ROOT/src-tauri/gen/android"
  cp build.cn.gradle.kts build.gradle.kts
  cp settings.cn.gradle settings.gradle
fi

# 7. 生成 Android 调试签名
if [[ -d "$PROJECT_ROOT/src-tauri/gen/android" ]]; then
  log_info "Generating Android debug keystore..."
  "$PROJECT_ROOT/scripts/generate-keystore.sh" "$PROJECT_ROOT/src-tauri/gen/android"
fi

# 8. 预下载 ONNX Runtime（桌面平台）
log_info "Pre-downloading ONNX Runtime libraries for desktop platforms..."
mkdir -p "$PROJECT_ROOT/src-tauri/resources"

ONNX_BASE_URL="${RAPIDRAW_ONNXRUNTIME_MIRROR:-https://fast-cdn.rapidraw.cn/onnxruntimes-v1.22.0/}"
ONNX_FILES=(
  "onnxruntime-windows-x86_64.dll:579b636403983254346a5c1d80bd28f1519cd1e284cd204f8d4ff41f8d711559"
  "onnxruntime-windows-aarch64.dll:79281671a386ed1baab9dbdbb09fe55f99577011472e9526cf9d0b468bb6bcc7"
  "libonnxruntime-linux-x86_64.so:3da6146e14e7b8aaec625dde11d6114c7457c87a5f93d744897da8781e35c673"
  "libonnxruntime-linux-aarch64.so:0afd69a0ae38c5099fd0e8604dda398ac43dee67cd9c6394b5142b19e82528de"
  "libonnxruntime-macos-x86_64.dylib:283e595e61cf65df7a6b1d59a1616cbd35c8b6399dd90d799d99b71a3ff83160"
  "libonnxruntime-macos-aarch64.dylib:2b885992d3d6fa4130d39ec84a80d7504ff52750027c547bb22c86165f19406a"
)

for entry in "${ONNX_FILES[@]}"; do
  filename="${entry%%:*}"
  expected_hash="${entry##*:}"
  filepath="$PROJECT_ROOT/src-tauri/resources/$filename"

  if [[ -f "$filepath" ]]; then
    log_info "$filename already exists, skipping download."
    continue
  fi

  log_info "Downloading $filename..."
  if command -v curl &> /dev/null; then
    curl -fsSL "${ONNX_BASE_URL}${filename}?download=true" -o "$filepath" || {
      log_warn "Failed to download $filename from mirror. Skipping."
      rm -f "$filepath"
      continue
    }
  elif command -v wget &> /dev/null; then
    wget -q "${ONNX_BASE_URL}${filename}?download=true" -O "$filepath" || {
      log_warn "Failed to download $filename from mirror. Skipping."
      rm -f "$filepath"
      continue
    }
  else
    log_warn "Neither curl nor wget found. Skipping ONNX pre-download."
    break
  fi

  if command -v sha256sum &> /dev/null; then
    actual_hash=$(sha256sum "$filepath" | awk '{print $1}')
    if [[ "$actual_hash" != "$expected_hash" ]]; then
      log_warn "$filename hash mismatch! Expected $expected_hash, got $actual_hash."
      rm -f "$filepath"
    else
      log_info "$filename downloaded and verified."
    fi
  else
    log_warn "sha256sum not found, skipping hash verification for $filename."
  fi
done

log_info "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Set ANDROID_HOME and NDK_HOME environment variables for Android builds."
echo "  2. Run 'npm run tauri dev' for desktop development."
echo "  3. Run 'npm run tauri android dev' for Android development."