import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import MobileAccessibilityHelper from '../MobileAccessibilityHelper';

describe('MobileAccessibilityHelper', () => {
  beforeEach(() => {
    const existingStyle = document.getElementById('rapidraw-mobile-a11y');
    if (existingStyle) existingStyle.remove();
  });

  afterEach(() => {
    const existingStyle = document.getElementById('rapidraw-mobile-a11y');
    if (existingStyle) existingStyle.remove();
  });

  describe('基本渲染', () => {
    it('组件渲染时不返回 DOM 元素', () => {
      const { container } = render(<MobileAccessibilityHelper />);
      expect(container.firstChild).toBeNull();
    });

    it('组件渲染后注入无障碍样式', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      expect(style).toBeInTheDocument();
      expect(style?.tagName).toBe('STYLE');
    });

    it('样式元素注入到 document.head 中', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      expect(style?.parentElement).toBe(document.head);
    });
  });

  describe('组件卸载', () => {
    it('组件卸载时移除注入的样式', () => {
      const { unmount } = render(<MobileAccessibilityHelper />);
      expect(document.getElementById('rapidraw-mobile-a11y')).toBeInTheDocument();

      unmount();

      expect(document.getElementById('rapidraw-mobile-a11y')).not.toBeInTheDocument();
    });

    it('多次挂载和卸载不会残留样式元素', () => {
      const { unmount, rerender } = render(<MobileAccessibilityHelper />);
      expect(document.getElementById('rapidraw-mobile-a11y')).toBeInTheDocument();

      unmount();
      expect(document.getElementById('rapidraw-mobile-a11y')).not.toBeInTheDocument();

      render(<MobileAccessibilityHelper />);
      expect(document.getElementById('rapidraw-mobile-a11y')).toBeInTheDocument();
      expect(document.head.querySelectorAll('#rapidraw-mobile-a11y').length).toBe(1);
    });
  });

  describe('触控优化 - 最小触摸目标', () => {
    it('样式包含移动端最小触摸目标规则 (44x44px)', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('@media (pointer: coarse)');
      expect(cssText).toContain('min-height: 44px');
      expect(cssText).toContain('min-width: 44px');
    });

    it('最小触摸目标规则应用于 button 元素', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('button:not([class*="h-"]):not([class*="w-"])');
    });

    it('最小触摸目标规则应用于 role="button" 元素', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('[role="button"]:not([class*="h-"]):not([class*="w-"])');
    });

    it('最小触摸目标规则应用于链接元素', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('a:not([class*="h-"]):not([class*="w-"])');
    });

    it('最小触摸目标规则应用于 checkbox 和 radio', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('input[type="checkbox"]');
      expect(cssText).toContain('input[type="radio"]');
    });

    it('最小触摸目标规则应用于 tabindex 元素', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('[tabindex]:not([class*="h-"]):not([class*="w-"])');
    });
  });

  describe('触控优化 - 滑块触控区域', () => {
    it('样式包含滑块触控区域扩展规则', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('input[type="range"]::-webkit-slider-thumb');
      expect(cssText).toContain('width: 28px');
      expect(cssText).toContain('height: 28px');
    });
  });

  describe('点击区域放大 - 图标按钮', () => {
    it('样式包含图标按钮点击区域放大规则', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('.icon-button');
      expect(cssText).toContain('[data-icon-button]');
    });

    it('图标按钮使用伪元素扩展点击区域', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('.icon-button::after');
      expect(cssText).toContain('[data-icon-button]::after');
      expect(cssText).toContain("content: ''");
    });

    it('图标按钮伪元素为 44x44px', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('width: 44px');
      expect(cssText).toContain('height: 44px');
    });

    it('图标按钮伪元素居中定位', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('position: absolute');
      expect(cssText).toContain('top: 50%');
      expect(cssText).toContain('left: 50%');
      expect(cssText).toContain('transform: translate(-50%, -50%)');
    });
  });

  describe('键盘导航支持', () => {
    it('样式包含焦点可见指示器规则', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('@media (pointer: fine)');
      expect(cssText).toContain(':focus-visible');
    });

    it('焦点指示器有正确的样式', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('outline: 2px solid rgba(59, 130, 246, 0.5)');
      expect(cssText).toContain('outline-offset: 2px');
    });
  });

  describe('减少动画模式', () => {
    it('样式包含减少动画偏好媒体查询', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('减少动画模式下禁用动画持续时间', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('animation-duration: 0.01ms !important');
      expect(cssText).toContain('animation-iteration-count: 1 !important');
    });

    it('减少动画模式下禁用过渡效果', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('transition-duration: 0.01ms !important');
    });

    it('减少动画模式下禁用平滑滚动', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('scroll-behavior: auto !important');
    });

    it('减少动画规则应用于所有元素', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('*, *::before, *::after');
    });
  });

  describe('高对比度模式', () => {
    it('样式包含高对比度偏好媒体查询', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain('@media (prefers-contrast: high)');
    });

    it('高对比度模式下设置边框颜色变量', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      const cssText = style?.textContent || '';

      expect(cssText).toContain(':root');
      expect(cssText).toContain('--border-color: rgba(255, 255, 255, 0.4)');
    });
  });

  describe('SSR 环境处理', () => {
    it('组件源码包含 window 未定义时的安全检查', () => {
      const componentSource = MobileAccessibilityHelper.toString();
      expect(componentSource).toContain('typeof window');
      expect(componentSource).toContain('undefined');
    });

    it('useEffect 回调中有 window 存在性检查', () => {
      const componentSource = MobileAccessibilityHelper.toString();
      expect(componentSource).toMatch(/typeof\s+window\s*===\s*['"]undefined['"]/);
    });
  });

  describe('样式 ID 唯一性', () => {
    it('样式元素具有正确的 ID', () => {
      render(<MobileAccessibilityHelper />);
      const style = document.getElementById('rapidraw-mobile-a11y');
      expect(style).toBeInTheDocument();
      expect(style?.id).toBe('rapidraw-mobile-a11y');
    });

    it('多次渲染不会创建多个样式元素', () => {
      const { rerender } = render(<MobileAccessibilityHelper />);
      rerender(<MobileAccessibilityHelper />);
      rerender(<MobileAccessibilityHelper />);

      const styles = document.head.querySelectorAll('#rapidraw-mobile-a11y');
      expect(styles.length).toBe(1);
    });
  });
});
