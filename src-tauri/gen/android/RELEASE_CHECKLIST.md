# RapidRAW Android 发布检查清单

## 构建前检查

- [ ] 确认 `versionCode` 和 `versionName` 已在 `tauri.properties` 中更新
- [ ] 确认所有新功能分支已合并到主分支
- [ ] 确认 `CHANGELOG` 已更新
- [ ] 运行 `cargo test` 确保 Rust 侧测试全部通过
- [ ] 运行 `./gradlew test` 确保 Android 单元测试通过
- [ ] 运行 `./gradlew connectedAndroidTest` 确保设备端测试通过
- [ ] 确认 lint 检查无严重问题：`./gradlew lint`

## 权限与安全

- [ ] 确认 `AndroidManifest.xml` 中所有权限声明均为必需
- [ ] 确认运行时权限请求逻辑正确（`PermissionHelper`）
- [ ] 确认 `network_security_config.xml` 配置正确
- [ ] 确认无硬编码密钥或敏感信息
- [ ] 确认 `allowBackup=false` 已设置
- [ ] 确认 ProGuard/R8 规则正确保留必要类

## 兼容性

- [ ] 最低 SDK 版本 (minSdk=26) 测试通过
- [ ] 目标 SDK 版本 (targetSdk=36) 行为适配
- [ ] Android 13+ 细粒度媒体权限 (`READ_MEDIA_IMAGES`) 正常工作
- [ ] Android 11+ 存储访问框架 (SAF) 兼容
- [ ] 折叠屏设备适配 (`FoldableAdapter`)
- [ ] AndroidTV 支持 (`LEANBACK_LAUNCHER`)

## 性能与内存

- [ ] `MemoryManager` 缓存策略在低内存设备上正常释放
- [ ] `ThermalMonitor` 降档策略在过热时生效
- [ ] 大尺寸 RAW 文件 (50MP+) 加载不会 OOM
- [ ] 后台导出服务 (`ExportForegroundService`) 内存占用合理
- [ ] 图片缩略图缓存命中率符合预期
- [ ] 网络监控 (`NetworkHelper`) 回调不导致内存泄漏

## 错误处理

- [ ] `GlobalErrorHandler` 正确捕获未处理异常
- [ ] 崩溃恢复流程正确（`hasCrashedRecently` / `clearCrashState`）
- [ ] 存储空间不足时 (`StorageHelper`) 友好提示
- [ ] 网络不可用时操作正确降级
- [ ] 所有 `try-catch` 块不会静默吞掉关键错误

## UI 与用户体验

- [ ] 启动画面 (`SplashScreen`) 正常显示
- [ ] 深色模式适配完整
- [ ] 手势操作 (`GestureHandler`) 在各设备上响应正常
- [ ] 导出进度通知 (`POST_NOTIFICATIONS`) 在 Android 13+ 可正常显示
- [ ] 键盘输入不会遮挡编辑控件 (`adjustResize`)
- [ ] 多窗口模式 (`resizeableActivity`) 布局正常

## 构建与签名

- [ ] Release 签名密钥库 (`keystore.properties`) 配置正确
- [ ] Release 构建启用代码压缩 (`isMinifyEnabled=true`)
- [ ] Release 构建启用资源压缩 (`isShrinkResources=true`)
- [ ] ABI 过滤器仅包含目标架构
- [ ] APK 大小在合理范围内 (对比上一版本)
- [ ] 运行 `./gradlew assembleRelease` 构建成功

## 发布后

- [ ] 在 Google Play Console 上传 APK/AAB
- [ ] 填写发布说明（中文 + 英文）
- [ ] 设置分阶段发布比例 (建议 10% → 50% → 100%)
- [ ] 监控 Google Play Console 崩溃报告
- [ ] 监控 ANR 发生率
- [ ] 准备热修复方案（如需紧急修复）
