import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('hapticFeedback', () => {
  const originalUserAgent = navigator.userAgent;
  const originalVibrate = navigator.vibrate;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: originalUserAgent,
      vibrate: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('triggerHaptic - non-Android platform', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        vibrate: vi.fn(),
      });
    });

    it('does not call navigator.vibrate on non-Android platform', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('light');
      expect(navigator.vibrate).not.toHaveBeenCalled();
    });

    it('does not call navigator.vibrate for any intensity on non-Android platform', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      const intensities = ['light', 'medium', 'heavy', 'selection', 'success', 'error'] as const;
      intensities.forEach((intensity) => {
        triggerHaptic(intensity);
      });
      expect(navigator.vibrate).not.toHaveBeenCalled();
    });
  });

  describe('triggerHaptic - Android platform', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
        vibrate: vi.fn(),
      });
    });

    it('calls navigator.vibrate on Android platform', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('light');
      expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    });

    it('light intensity passes a number to navigator.vibrate', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('light');
      expect(navigator.vibrate).toHaveBeenCalledWith(8);
      expect(typeof (navigator.vibrate as vi.Mock).mock.calls[0][0]).toBe('number');
    });

    it('medium intensity passes a number to navigator.vibrate', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('medium');
      expect(navigator.vibrate).toHaveBeenCalledWith(12);
      expect(typeof (navigator.vibrate as vi.Mock).mock.calls[0][0]).toBe('number');
    });

    it('heavy intensity passes a number to navigator.vibrate', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('heavy');
      expect(navigator.vibrate).toHaveBeenCalledWith(18);
      expect(typeof (navigator.vibrate as vi.Mock).mock.calls[0][0]).toBe('number');
    });

    it('selection intensity passes a number to navigator.vibrate', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('selection');
      expect(navigator.vibrate).toHaveBeenCalledWith(5);
      expect(typeof (navigator.vibrate as vi.Mock).mock.calls[0][0]).toBe('number');
    });

    it('success intensity passes an array to navigator.vibrate', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('success');
      expect(navigator.vibrate).toHaveBeenCalledWith([10, 30, 10]);
      expect(Array.isArray((navigator.vibrate as vi.Mock).mock.calls[0][0])).toBe(true);
    });

    it('error intensity passes an array to navigator.vibrate', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('error');
      expect(navigator.vibrate).toHaveBeenCalledWith([20, 40, 20]);
      expect(Array.isArray((navigator.vibrate as vi.Mock).mock.calls[0][0])).toBe(true);
    });

    it('defaults to light intensity when no argument is provided', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic();
      expect(navigator.vibrate).toHaveBeenCalledWith(8);
    });

    it('silently fails when navigator.vibrate throws an error', async () => {
      const vibrateMock = vi.fn(() => {
        throw new Error('Vibration not supported');
      });
      vi.stubGlobal('navigator', {
        ...navigator,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
        vibrate: vibrateMock,
      });
      const { triggerHaptic } = await import('../hapticFeedback');
      expect(() => triggerHaptic('light')).not.toThrow();
      expect(vibrateMock).toHaveBeenCalled();
    });

    it('passes a copy of the array pattern (not the original reference)', async () => {
      const { triggerHaptic } = await import('../hapticFeedback');
      triggerHaptic('success');
      const passedArray = (navigator.vibrate as vi.Mock).mock.calls[0][0];
      expect(passedArray).toEqual([10, 30, 10]);
      passedArray.push(999);
      triggerHaptic('success');
      const secondCallArray = (navigator.vibrate as vi.Mock).mock.calls[1][0];
      expect(secondCallArray).toEqual([10, 30, 10]);
    });
  });

  describe('convenience functions - Android platform', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
        vibrate: vi.fn(),
      });
    });

    it('hapticOnSliderChange calls triggerHaptic with light', async () => {
      const { hapticOnSliderChange } = await import('../hapticFeedback');
      hapticOnSliderChange();
      expect(navigator.vibrate).toHaveBeenCalledWith(8);
    });

    it('hapticOnButtonPress calls triggerHaptic with medium', async () => {
      const { hapticOnButtonPress } = await import('../hapticFeedback');
      hapticOnButtonPress();
      expect(navigator.vibrate).toHaveBeenCalledWith(12);
    });

    it('hapticOnToggle calls triggerHaptic with selection', async () => {
      const { hapticOnToggle } = await import('../hapticFeedback');
      hapticOnToggle();
      expect(navigator.vibrate).toHaveBeenCalledWith(5);
    });

    it('hapticOnSuccess calls triggerHaptic with success', async () => {
      const { hapticOnSuccess } = await import('../hapticFeedback');
      hapticOnSuccess();
      expect(navigator.vibrate).toHaveBeenCalledWith([10, 30, 10]);
    });

    it('hapticOnError calls triggerHaptic with error', async () => {
      const { hapticOnError } = await import('../hapticFeedback');
      hapticOnError();
      expect(navigator.vibrate).toHaveBeenCalledWith([20, 40, 20]);
    });
  });

  describe('convenience functions - non-Android platform', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        vibrate: vi.fn(),
      });
    });

    it('hapticOnSliderChange does not call vibrate on non-Android', async () => {
      const { hapticOnSliderChange } = await import('../hapticFeedback');
      hapticOnSliderChange();
      expect(navigator.vibrate).not.toHaveBeenCalled();
    });

    it('hapticOnButtonPress does not call vibrate on non-Android', async () => {
      const { hapticOnButtonPress } = await import('../hapticFeedback');
      hapticOnButtonPress();
      expect(navigator.vibrate).not.toHaveBeenCalled();
    });

    it('hapticOnToggle does not call vibrate on non-Android', async () => {
      const { hapticOnToggle } = await import('../hapticFeedback');
      hapticOnToggle();
      expect(navigator.vibrate).not.toHaveBeenCalled();
    });

    it('hapticOnSuccess does not call vibrate on non-Android', async () => {
      const { hapticOnSuccess } = await import('../hapticFeedback');
      hapticOnSuccess();
      expect(navigator.vibrate).not.toHaveBeenCalled();
    });

    it('hapticOnError does not call vibrate on non-Android', async () => {
      const { hapticOnError } = await import('../hapticFeedback');
      hapticOnError();
      expect(navigator.vibrate).not.toHaveBeenCalled();
    });
  });

  describe('default export', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
        vibrate: vi.fn(),
      });
    });

    it('default export equals triggerHaptic', async () => {
      const { default: defaultExport, triggerHaptic } = await import('../hapticFeedback');
      expect(defaultExport).toBe(triggerHaptic);
    });

    it('default export works the same as triggerHaptic', async () => {
      const { default: defaultExport } = await import('../hapticFeedback');
      defaultExport('medium');
      expect(navigator.vibrate).toHaveBeenCalledWith(12);
    });
  });
});
