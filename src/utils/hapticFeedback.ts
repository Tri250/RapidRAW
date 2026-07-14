/**
 * 触觉反馈工具 - 专为国内 Android 摄影用户优化
 * 提供轻量级触觉反馈，提升交互体验
 */

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

// 振动持续时间 (ms) - 国内用户偏好短促清晰的反馈
const HAPTIC_DURATION = {
  light: 8, // 轻触 - 滑块微调
  medium: 12, // 中等 - 按钮点击
  heavy: 18, // 重触 - 确认操作
  selection: 5, // 选择 - 切换选项
  success: [10, 30, 10], // 成功 - 模式振动
  error: [20, 40, 20], // 错误 - 模式振动
} as const;

/**
 * 触发触觉反馈
 * @param intensity - 反馈强度
 */
export function triggerHaptic(intensity: keyof typeof HAPTIC_DURATION = 'light'): void {
  if (!isAndroid) return;

  try {
    const pattern = HAPTIC_DURATION[intensity];
    if (Array.isArray(pattern)) {
      navigator.vibrate([...pattern] as number[]);
    } else {
      navigator.vibrate(pattern as number);
    }
  } catch {
    // 振动不可用时静默失败
  }
}

/**
 * 滑块交互时的触觉反馈
 * 在值变化时提供微妙的触觉确认
 */
export function hapticOnSliderChange(): void {
  triggerHaptic('light');
}

/**
 * 按钮点击时的触觉反馈
 */
export function hapticOnButtonPress(): void {
  triggerHaptic('medium');
}

/**
 * 开关切换时的触觉反馈
 */
export function hapticOnToggle(): void {
  triggerHaptic('selection');
}

/**
 * 操作成功时的触觉反馈
 */
export function hapticOnSuccess(): void {
  triggerHaptic('success');
}

/**
 * 操作失败时的触觉反馈
 */
export function hapticOnError(): void {
  triggerHaptic('error');
}

export default triggerHaptic;
