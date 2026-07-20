import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AndroidBottomNav from './AndroidBottomNav';
import { useUIStore } from '../../store/useUIStore';

vi.mock('../../store/useUIStore');

describe('AndroidBottomNav', () => {
  const setRightPanel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when not Android', () => {
    const { container } = render(<AndroidBottomNav isAndroid={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all 10 nav items on Android', () => {
    (useUIStore as any).mockReturnValue({ activeRightPanel: null });
    (useUIStore as any).mockImplementation((selector: any) => {
      const state = { activeRightPanel: null, setRightPanel };
      return selector ? selector(state) : state;
    });

    render(<AndroidBottomNav isAndroid={true} />);
    expect(screen.getByText('editor.android.bottomNav.library')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.basic')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.color')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.portrait')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.crop')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.masks')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.ai')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.metadata')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.presets')).toBeInTheDocument();
    expect(screen.getByText('editor.android.bottomNav.export')).toBeInTheDocument();
  });

  it('toggles panel on click', () => {
    (useUIStore as any).mockImplementation((selector: any) => {
      const state = { activeRightPanel: null, setRightPanel };
      return selector ? selector(state) : state;
    });

    render(<AndroidBottomNav isAndroid={true} />);
    const basicBtn = screen.getByText('editor.android.bottomNav.basic').closest('button')!;
    fireEvent.click(basicBtn);
    expect(setRightPanel).toHaveBeenCalledWith(expect.anything());
  });
});
