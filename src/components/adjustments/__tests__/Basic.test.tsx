import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BasicAdjustments from '../Basic';

vi.mock('../../../utils/hapticFeedback', () => ({
  hapticOnSliderChange: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('BasicAdjustments', () => {
  const defaultAdjustments = {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    toneMapper: 'basic' as const,
  };

  const defaultProps = {
    adjustments: defaultAdjustments as any,
    setAdjustments: vi.fn(),
    onDragStateChange: vi.fn(),
    isForMask: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isForMask=true 时渲染组件不报错', () => {
    const { unmount } = render(<BasicAdjustments {...defaultProps} />);
    expect(screen.getByText('adjustments.basic.contrast')).toBeInTheDocument();
    unmount();
  });
});
