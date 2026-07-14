import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExternalEditBar from '../ExternalEditBar';
import type { ExternalEditSession } from '../../../store/useProcessStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('lucide-react', () => ({
  Check: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="check-icon" data-size={size} className={className} />
  ),
  Loader: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="loader-icon" data-size={size} className={className} />
  ),
}));

const mockSession: ExternalEditSession = {
  source: '/path/to/source.jpg',
  output: '/path/to/output.jpg',
  format: 'jpeg',
  jpegQuality: 90,
};

describe('ExternalEditBar', () => {
  const defaultProps = {
    session: mockSession,
    isFinishing: false,
    errorMessage: '',
    onDone: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
    it('渲染组件容器', () => {
      render(<ExternalEditBar {...defaultProps} />);
      const container = screen.getByRole('button').parentElement;
      expect(container).toBeInTheDocument();
      expect(container?.className).toContain('absolute');
      expect(container?.className).toContain('bottom-6');
      expect(container?.className).toContain('left-1/2');
    });

    it('渲染保存目标提示文本', () => {
      render(<ExternalEditBar {...defaultProps} />);
      expect(screen.getByText('editor.externalEdit.savesTo')).toBeInTheDocument();
    });

    it('渲染完成按钮', () => {
      render(<ExternalEditBar {...defaultProps} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('编辑应用名称显示', () => {
    it('显示输出文件名（从路径中提取）', () => {
      render(<ExternalEditBar {...defaultProps} />);
      expect(screen.getByText('output.jpg')).toBeInTheDocument();
    });

    it('使用正斜杠路径时正确提取文件名', () => {
      const session = {
        ...mockSession,
        output: '/home/user/images/photo.png',
      };
      render(<ExternalEditBar {...defaultProps} session={session} />);
      expect(screen.getByText('photo.png')).toBeInTheDocument();
    });

    it('使用反斜杠路径时正确提取文件名', () => {
      const session = {
        ...mockSession,
        output: 'C:\\Users\\test\\image.jpg',
      };
      render(<ExternalEditBar {...defaultProps} session={session} />);
      expect(screen.getByText('image.jpg')).toBeInTheDocument();
    });

    it('只有文件名时直接显示', () => {
      const session = {
        ...mockSession,
        output: 'simple.jpg',
      };
      render(<ExternalEditBar {...defaultProps} session={session} />);
      expect(screen.getByText('simple.jpg')).toBeInTheDocument();
    });

    it('空路径时显示空字符串', () => {
      const session = {
        ...mockSession,
        output: '',
      };
      render(<ExternalEditBar {...defaultProps} session={session} />);
      const spans = screen.getAllByText('');
      expect(spans.length).toBeGreaterThan(0);
    });

    it('输出文件名使用 text-text-primary 样式', () => {
      render(<ExternalEditBar {...defaultProps} />);
      const fileName = screen.getByText('output.jpg');
      expect(fileName.className).toContain('text-text-primary');
    });
  });

  describe('编辑中状态（isFinishing = false）', () => {
    it('显示完成按钮文本', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={false} />);
      expect(screen.getByText('editor.externalEdit.done')).toBeInTheDocument();
    });

    it('显示 Check 图标', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={false} />);
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    });

    it('不显示 Loader 图标', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={false} />);
      expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
    });

    it('按钮未禁用', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={false} />);
      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('保存中状态（isFinishing = true）', () => {
    it('显示导出中按钮文本', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={true} />);
      expect(screen.getByText('editor.externalEdit.exporting')).toBeInTheDocument();
    });

    it('显示 Loader 图标', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={true} />);
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('不显示 Check 图标', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={true} />);
      expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
    });

    it('按钮被禁用', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={true} />);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('Loader 图标有 animate-spin 类', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={true} />);
      const loader = screen.getByTestId('loader-icon');
      expect(loader.className).toContain('animate-spin');
    });
  });

  describe('进度指示', () => {
    it('isFinishing 为 true 时显示加载动画（进度指示）', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={true} />);
      const loader = screen.getByTestId('loader-icon');
      expect(loader).toBeInTheDocument();
      expect(loader.className).toContain('animate-spin');
    });

    it('isFinishing 为 false 时不显示加载动画', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={false} />);
      expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
    });
  });

  describe('错误状态显示', () => {
    it('有错误信息时显示错误文本', () => {
      const errorMsg = '导出失败，请重试';
      render(<ExternalEditBar {...defaultProps} errorMessage={errorMsg} />);
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });

    it('错误信息使用 text-red-400 样式', () => {
      const errorMsg = '导出失败';
      render(<ExternalEditBar {...defaultProps} errorMessage={errorMsg} />);
      const errorElement = screen.getByText(errorMsg);
      expect(errorElement.className).toContain('text-red-400');
    });

    it('错误信息有最大宽度限制和截断样式', () => {
      const errorMsg = '这是一个很长的错误信息用于测试截断效果';
      render(<ExternalEditBar {...defaultProps} errorMessage={errorMsg} />);
      const errorElement = screen.getByText(errorMsg);
      expect(errorElement.className).toContain('max-w-xs');
      expect(errorElement.className).toContain('truncate');
    });

    it('没有错误信息时不显示错误文本', () => {
      render(<ExternalEditBar {...defaultProps} errorMessage="" />);
      const errorElements = screen.queryAllByText(/./).filter(
        (el) => el.className.includes('text-red-400')
      );
      expect(errorElements.length).toBe(0);
    });

    it('错误状态下按钮仍可点击（isFinishing 为 false 时）', () => {
      const errorMsg = '导出失败';
      const onDone = vi.fn();
      render(
        <ExternalEditBar
          {...defaultProps}
          errorMessage={errorMsg}
          isFinishing={false}
          onDone={onDone}
        />
      );
      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  describe('完成状态', () => {
    it('isFinishing 为 false 时显示完成按钮（Check 图标）', () => {
      render(<ExternalEditBar {...defaultProps} isFinishing={false} />);
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
      expect(screen.getByText('editor.externalEdit.done')).toBeInTheDocument();
    });

    it('完成按钮有 py-1.5 样式类', () => {
      render(<ExternalEditBar {...defaultProps} />);
      const button = screen.getByRole('button');
      expect(button.className).toContain('py-1.5');
    });
  });

  describe('保存回调（onDone）', () => {
    it('点击按钮时调用 onDone', () => {
      const onDone = vi.fn();
      render(<ExternalEditBar {...defaultProps} onDone={onDone} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('多次点击按钮时多次调用 onDone', () => {
      const onDone = vi.fn();
      render(<ExternalEditBar {...defaultProps} onDone={onDone} />);
      const button = screen.getByRole('button');
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      expect(onDone).toHaveBeenCalledTimes(3);
    });

    it('isFinishing 为 true 时点击不调用 onDone', () => {
      const onDone = vi.fn();
      render(
        <ExternalEditBar {...defaultProps} isFinishing={true} onDone={onDone} />
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onDone).not.toHaveBeenCalled();
    });
  });

  describe('不同编辑状态', () => {
    it('编辑中状态：isFinishing=false, errorMessage=""', () => {
      render(
        <ExternalEditBar
          {...defaultProps}
          isFinishing={false}
          errorMessage=""
        />
      );
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
      expect(screen.getByText('editor.externalEdit.done')).toBeInTheDocument();
      expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
      expect(screen.getByRole('button')).not.toBeDisabled();
    });

    it('保存中状态：isFinishing=true, errorMessage=""', () => {
      render(
        <ExternalEditBar
          {...defaultProps}
          isFinishing={true}
          errorMessage=""
        />
      );
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
      expect(screen.getByText('editor.externalEdit.exporting')).toBeInTheDocument();
      expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('错误状态：isFinishing=false, errorMessage="error"', () => {
      const errorMsg = '发生错误';
      render(
        <ExternalEditBar
          {...defaultProps}
          isFinishing={false}
          errorMessage={errorMsg}
        />
      );
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
      expect(screen.getByRole('button')).not.toBeDisabled();
    });

    it('保存中加错误状态：isFinishing=true, errorMessage="error"', () => {
      const errorMsg = '保存时出错';
      render(
        <ExternalEditBar
          {...defaultProps}
          isFinishing={true}
          errorMessage={errorMsg}
        />
      );
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('样式和布局', () => {
    it('容器有正确的定位样式', () => {
      render(<ExternalEditBar {...defaultProps} />);
      const container = screen.getByRole('button').parentElement;
      expect(container?.className).toContain('z-40');
      expect(container?.className).toContain('flex');
      expect(container?.className).toContain('items-center');
      expect(container?.className).toContain('gap-3');
    });

    it('容器有正确的背景和边框样式', () => {
      render(<ExternalEditBar {...defaultProps} />);
      const container = screen.getByRole('button').parentElement;
      expect(container?.className).toContain('bg-bg-secondary');
      expect(container?.className).toContain('border');
      expect(container?.className).toContain('border-surface');
      expect(container?.className).toContain('rounded-lg');
      expect(container?.className).toContain('shadow-lg');
    });

    it('容器有正确的内边距', () => {
      render(<ExternalEditBar {...defaultProps} />);
      const container = screen.getByRole('button').parentElement;
      expect(container?.className).toContain('px-4');
      expect(container?.className).toContain('py-2');
    });

    it('保存目标提示文本样式正确', () => {
      render(<ExternalEditBar {...defaultProps} />);
      const savesToText = screen.getByText('editor.externalEdit.savesTo');
      expect(savesToText.className).toContain('text-sm');
      expect(savesToText.className).toContain('text-text-secondary');
      expect(savesToText.className).toContain('whitespace-nowrap');
    });
  });
});
