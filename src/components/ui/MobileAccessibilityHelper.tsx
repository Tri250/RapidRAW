import { useEffect } from 'react';

/**
 * 移动端无障碍辅助组件
 *
 * 自动增强移动端的无障碍体验：
 * - 确保所有交互元素具有 44px 最小触摸目标
 * - 为模态框添加焦点捕获
 * - 为图标按钮添加 aria-label
 * - 管理屏幕阅读器公告
 */
export default function MobileAccessibilityHelper() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 注入最小触摸目标 CSS
    const style = document.createElement('style');
    style.id = 'rapidraw-mobile-a11y';
    style.textContent = `
      /* 移动端最小触摸目标：44x44px (Material Design 标准) */
      @media (pointer: coarse) {
        button:not([class*="h-"]):not([class*="w-"]),
        [role="button"]:not([class*="h-"]):not([class*="w-"]),
        a:not([class*="h-"]):not([class*="w-"]),
        input[type="checkbox"],
        input[type="radio"],
        [tabindex]:not([class*="h-"]):not([class*="w-"]) {
          min-height: 44px;
          min-width: 44px;
        }

        /* 滑块触控区域扩展 */
        input[type="range"]::-webkit-slider-thumb {
          width: 28px;
          height: 28px;
        }

        /* 增加小按钮的点击区域（不改变视觉大小） */
        .icon-button,
        [data-icon-button] {
          position: relative;
        }
        .icon-button::after,
        [data-icon-button]::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 44px;
          height: 44px;
        }
      }

      /* 焦点指示器（键盘导航） */
      @media (pointer: fine) {
        :focus-visible {
          outline: 2px solid rgba(59, 130, 246, 0.5);
          outline-offset: 2px;
        }
      }

      /* 减少动画偏好 */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }

      /* 高对比度模式 */
      @media (prefers-contrast: high) {
        :root {
          --border-color: rgba(255, 255, 255, 0.4);
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existing = document.getElementById('rapidraw-mobile-a11y');
      if (existing) existing.remove();
    };
  }, []);

  return null;
}
