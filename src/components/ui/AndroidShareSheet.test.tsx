import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AndroidShareSheet from './AndroidShareSheet';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core');
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('AndroidShareSheet', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      <AndroidShareSheet filePath="/tmp/test.jpg" mimeType="image/jpeg" visible={false} onClose={onClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders share targets when visible', () => {
    render(
      <AndroidShareSheet filePath="/tmp/test.jpg" mimeType="image/jpeg" visible={true} onClose={onClose} />
    );
    expect(screen.getByText('androidShare.wechat')).toBeInTheDocument();
    expect(screen.getByText('androidShare.qq')).toBeInTheDocument();
    expect(screen.getByText('androidShare.weibo')).toBeInTheDocument();
    expect(screen.getByText('androidShare.more')).toBeInTheDocument();
  });

  it('calls invoke on share target click', async () => {
    (invoke as any).mockResolvedValue(undefined);
    render(
      <AndroidShareSheet filePath="/tmp/test.jpg" mimeType="image/jpeg" visible={true} onClose={onClose} />
    );
    const wechatBtn = screen.getByText('androidShare.wechat').closest('button')!;
    fireEvent.click(wechatBtn);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('share_image', expect.any(Object));
    });
  });

  it('calls onClose when cancel clicked', () => {
    render(
      <AndroidShareSheet filePath="/tmp/test.jpg" mimeType="image/jpeg" visible={true} onClose={onClose} />
    );
    fireEvent.click(screen.getByText('androidShare.cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
