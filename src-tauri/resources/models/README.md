# RapidRAW 预置 AI 模型目录

将以下模型文件放到此目录，打包时会被 Tauri bundle 进应用：

| # | 文件名 | 大小 | 用途 |
|---|--------|------|------|
| 1 | sam_vit_b_01ec64_encoder.onnx | ~375MB | SAM2 主体分割 Encoder |
| 2 | sam_vit_b_01ec64_decoder.onnx | ~38MB | SAM2 主体分割 Decoder |
| 3 | u2net.onnx | ~176MB | U2Net-P 前景分割 |
| 4 | skyseg_u2net.onnx | ~176MB | U2Net 天空分割 |
| 5 | depth_anything_v2_vits.onnx | ~100MB | Depth Anything V2-S 深度估计 |
| 6 | nind_denoise_utnet_684.onnx | ~100MB | NIND UTNet-684 AI 降噪 |
| 7 | clip_model.onnx | ~600MB | CLIP ViT-B/32 自动标签 Embedding |
| 8 | clip_tokenizer.json | <1MB | CLIP Tokenizer 分词器 |
| 9 | lama_fp16.onnx | ~570MB | LaMa FP16 Generative Inpaint |

**预置后效果**：应用启动时直接从 resources 拷贝到用户 app_data_dir/models/，
全程离线，无需网络下载。拷贝完成后 SHA256 校验确保完整性。

**开发环境**：目录为空时会自动 fallback 到 hf-mirror.com 下载逻辑。
**正式打包**：把这 9 个 .onnx + 1 个 .json 放进此目录，tauri.conf.json
已配置 resources → 会被 bundle 进安装包。

下载地址（hf-mirror.com 镜像）：
https://hf-mirror.com/CyberTimon/RapidRAW-Models/tree/main

