#!/usr/bin/env bash
set -euo pipefail

# 生成 Android 调试/发布签名密钥
# 用法: ./scripts/generate-keystore.sh [输出目录]
# 默认输出到 src-tauri/gen/android

OUTPUT_DIR="${1:-src-tauri/gen/android}"
KEYSTORE_FILE="${OUTPUT_DIR}/release.keystore"
KEY_ALIAS="rapidraw"
KEY_PASSWORD="rapidraw123"
VALIDITY_DAYS=10000

mkdir -p "$OUTPUT_DIR"

if [[ -f "$KEYSTORE_FILE" ]]; then
  echo "Keystore already exists at $KEYSTORE_FILE"
  echo "Remove it first if you want to regenerate."
  exit 0
fi

keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -storepass "$KEY_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=RapidRAW, OU=Development, O=RapidRAW, L=Beijing, ST=Beijing, C=CN"

cat > "${OUTPUT_DIR}/keystore.properties" <<EOF
keyAlias=${KEY_ALIAS}
password=${KEY_PASSWORD}
storeFile=release.keystore
EOF

echo "Keystore generated: $KEYSTORE_FILE"
echo "Properties written to: ${OUTPUT_DIR}/keystore.properties"
echo ""
echo "WARNING: This is a development keystore. For production releases,"
echo "replace it with a properly secured release keystore and use CI secrets."