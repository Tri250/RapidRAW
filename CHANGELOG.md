# Changelog

All notable changes to this project will be documented in this file.

## [1.6.3] - 2026-07-15

### Android端深度审查与优化

#### 核心工作流验证
- ✅ 完整验证：图库打开 → 导入图片 → 图编辑 → 实时效果 → 导出
- ✅ WGPU实时渲染同步机制验证通过
- ✅ 手势处理（pan/zoom/pinch）全链路测试通过

#### 功能模块审查
- **基础调整**：曝光、亮度、对比度、高光、阴影、白场、黑场
- **色彩调整**：白平衡、HSL混合器、色彩分级（3way/global）、色彩校准
- **蒙版**：AI蒙版（主体/前景/天空/深度）、笔刷、径向、线性、颜色、亮度蒙版
- **导出**：JPEG/PNG/WebP/JXL/TIFF/AVIF/CUBE多格式支持，水印、元数据、Android MediaStore集成

#### 稳定性与兼容性
- Android Native Surface渲染优化
- 内存压力响应机制（GPU缓存自动释放）
- Content URI文件处理加固
- Android 12+ 文件关联配置完善

#### 构建配置
- minSdk: 24, targetSdk: 36
- abiFilters: arm64-v8a
- Vulkan图形后端优先配置
- ProGuard/R8混淆规则优化
