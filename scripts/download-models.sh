#!/usr/bin/env bash
# Download AI models via hf-mirror.com (sandbox proxy blocks huggingface.co directly).
# Uses curl with resume (-C -) and long timeout for large files.
set -uo pipefail

cd "$(dirname "$0")/.."
models_dir="src-tauri/models"
mkdir -p "$models_dir"

# Mirror that is reachable through the sandbox HTTP proxy (127.0.0.1:18080).
# huggingface.co itself is SSL-reset by the proxy, but hf-mirror.com works.
MIRROR="${RAPIDRAW_HF_MIRROR:-https://hf-mirror.com}"
BASE="${MIRROR}/CyberTimon/RapidRAW-Models/resolve/main"

# filename|sha256|name
models=(
  "sam_vit_b_01ec64_encoder.onnx|16ab73d9c824886f0de2938c19df22fb9ec3deebfd0de58e65177e479213d7d1|SAM Encoder"
  "sam_vit_b_01ec64_decoder.onnx|85d0d672cf5b7fe763edcde429e5533e62f674af4b15c7d688b7673b0ef00bf7|SAM Decoder"
  "u2net.onnx|8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491|Foreground Model"
  "skyseg-u2net.onnx|ab9c34c64c3d821220a2886a4a06da4642ffa14d5b30e8d5339056a089aa1d39|Sky Segmentation"
  "depth_anything_v2_vits.onnx|d2b11a11c1d4a12b47608fa65a17ee9a4c605b55ee1730c8e3b526304f2562be|Depth Model"
  "nind_denoise_utnet_684.onnx|ee3586279d514df557ff3f7dec6df37fafc51ba5d3a3435b2cc9ac2d9017e7fe|Denoise Model"
  "lama_fp16.onnx|2d6be6277c400d6f1b91819737f7c3da935e5c63d1b521d393be1196a2bfa82c|Inpainting Model"
  "clip_model.onnx|57879bb1c23cdeb350d23569dd251ed4b740a96d747c529e94a2bb8040ac5d00|CLIP Model"
)

ok=0; fail=0
for entry in "${models[@]}"; do
  IFS='|' read -r filename expected name <<< "$entry"
  dest="$models_dir/$filename"
  # Skip if already valid
  if [[ -f "$dest" ]]; then
    actual="$(sha256sum "$dest" | awk '{print $1}')"
    if [[ "$actual" == "$expected" ]]; then
      echo "[OK] $name already present and valid"
      ok=$((ok + 1)); continue
    fi
    echo "[..] $name exists but hash mismatch, re-downloading"
    rm -f "$dest"
  fi
  url="${BASE}/${filename}?download=true"
  echo "[..] Downloading $name from $url"
  # -C - resume, --retry 5, max-time 600s per file, follow redirects
  for attempt in 1 2 3; do
    if curl -L -C - --retry 5 --retry-delay 3 --connect-timeout 30 --max-time 900 \
         -o "$dest" "$url"; then
      actual="$(sha256sum "$dest" | awk '{print $1}')"
      if [[ "$actual" == "$expected" ]]; then
        echo "[OK] $name downloaded and verified ($(du -h "$dest" | cut -f1))"
        # Rename legacy hyphenated filename to underscore version expected by the app.
        if [[ "$filename" == "skyseg-u2net.onnx" ]]; then
          mv "$dest" "$models_dir/skyseg_u2net.onnx"
        fi
        ok=$((ok + 1)); break
      else
        echo "[!] $name SHA mismatch (attempt $attempt): got $actual"
        rm -f "$dest"
      fi
    else
      echo "[!] $name download failed (attempt $attempt)"
      rm -f "$dest"
    fi
    sleep 3
  done
  # After potential rename, check the expected final filename.
  check_file="$dest"
  if [[ "$filename" == "skyseg-u2net.onnx" ]]; then
    check_file="$models_dir/skyseg_u2net.onnx"
  fi
  if [[ ! -f "$check_file" ]] || [[ "$(sha256sum "$check_file" | awk '{print $1}')" != "$expected" ]]; then
    echo "[FAIL] $name could not be downloaded/verified"
    fail=$((fail + 1))
  fi
done

echo ""
echo "========================================"
echo "Downloaded: $ok / ${#models[@]}, Failed: $fail"
if [[ "$fail" -eq 0 ]]; then
  echo "ALL MODELS VERIFIED"
  exit 0
else
  echo "SOME MODELS FAILED"
  exit 1
fi
