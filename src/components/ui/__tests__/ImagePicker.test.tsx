import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImagePicker from '../ImagePicker';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { open } from '@tauri-apps/plugin-dialog';

describe('ImagePicker', () => {
  const defaultProps = {
    imageName: null,
    onImageSelect: vi.fn(),
    onClear: vi.fn(),
    label: 'Test Label',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    it('渲染 label 文本', () => {
      render(<ImagePicker {...defaultProps} />);
      expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('渲染选择按钮', () => {
      render(<ImagePicker {...defaultProps} />);
      expect(screen.getByText('ui.imagePicker.select')).toBeInTheDocument();
    });

    it('选择按钮是 button 元素', () => {
      render(<ImagePicker {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('空状态时不显示清除按钮', () => {
      render(<ImagePicker {...defaultProps} />);
      const clearButtons = screen.queryByRole('button', { name: '' });
      expect(screen.queryByTestId('clear-button')).not.toBeInTheDocument();
    });
  });

  describe('显示选中的图片', () => {
    it('有 imageName 时显示图片名称', () => {
      render(<ImagePicker {...defaultProps} imageName="test.png" />);
      expect(screen.getByText('test.png')).toBeInTheDocument();
    });

    it('有 imageName 时不显示选择文本', () => {
      render(<ImagePicker {...defaultProps} imageName="test.png" />);
      expect(screen.queryByText('ui.imagePicker.select')).not.toBeInTheDocument();
    });

    it('imageName 为 null 时显示选择文本', () => {
      render(<ImagePicker {...defaultProps} imageName={null} />);
      expect(screen.getByText('ui.imagePicker.select')).toBeInTheDocument();
    });
  });

  describe('点击选择图片', () => {
    it('点击选择按钮时调用 open 对话框', async () => {
      vi.mocked(open).mockResolvedValue(null);
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      expect(open).toHaveBeenCalledTimes(1);
    });

    it('open 对话框配置正确 - 单选', async () => {
      vi.mocked(open).mockResolvedValue(null);
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      expect(open).toHaveBeenCalledWith(
        expect.objectContaining({
          multiple: false,
        }),
      );
    });

    it('open 对话框配置正确 - 只支持 png 格式', async () => {
      vi.mocked(open).mockResolvedValue(null);
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      const callArgs = vi.mocked(open).mock.calls[0][0];
      expect(callArgs.filters).toBeDefined();
      expect(callArgs.filters[0].extensions).toEqual(['png']);
    });

    it('选择图片后调用 onImageSelect 回调', async () => {
      vi.mocked(open).mockResolvedValue('/path/to/image.png');
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      await Promise.resolve();

      expect(defaultProps.onImageSelect).toHaveBeenCalledTimes(1);
      expect(defaultProps.onImageSelect).toHaveBeenCalledWith('/path/to/image.png');
    });

    it('取消选择时不调用 onImageSelect', async () => {
      vi.mocked(open).mockResolvedValue(null);
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      await Promise.resolve();

      expect(defaultProps.onImageSelect).not.toHaveBeenCalled();
    });

    it('选择结果为数组时不调用 onImageSelect', async () => {
      vi.mocked(open).mockResolvedValue(['/path/to/image.png']);
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      await Promise.resolve();

      expect(defaultProps.onImageSelect).not.toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('打开对话框出错时不崩溃', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(open).mockRejectedValue(new Error('Dialog error'));

      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      await Promise.resolve();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(defaultProps.onImageSelect).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('清除选择', () => {
    it('有 imageName 时显示清除按钮', () => {
      render(<ImagePicker {...defaultProps} imageName="test.png" />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(2);
    });

    it('点击清除按钮调用 onClear 回调', () => {
      render(<ImagePicker {...defaultProps} imageName="test.png" />);

      const buttons = screen.getAllByRole('button');
      const clearButton = buttons[1];
      fireEvent.click(clearButton);

      expect(defaultProps.onClear).toHaveBeenCalledTimes(1);
    });

    it('清除按钮有正确的 tooltip 属性', () => {
      render(<ImagePicker {...defaultProps} imageName="test.png" />);

      const buttons = screen.getAllByRole('button');
      const clearButton = buttons[1];
      expect(clearButton).toHaveAttribute('data-tooltip', 'ui.imagePicker.clearImage');
    });
  });

  describe('onChange 回调', () => {
    it('onImageSelect 接收选中的文件路径', async () => {
      const testPath = '/Users/test/photos/photo.png';
      vi.mocked(open).mockResolvedValue(testPath);
      const onImageSelect = vi.fn();

      render(<ImagePicker {...defaultProps} onImageSelect={onImageSelect} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      await Promise.resolve();

      expect(onImageSelect).toHaveBeenCalledWith(testPath);
    });
  });

  describe('支持的图片格式', () => {
    it('过滤器名称使用翻译键', async () => {
      vi.mocked(open).mockResolvedValue(null);
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      const callArgs = vi.mocked(open).mock.calls[0][0];
      expect(callArgs.filters[0].name).toBe('ui.imagePicker.filterLabel');
    });

    it('只支持 png 扩展名', async () => {
      vi.mocked(open).mockResolvedValue(null);
      render(<ImagePicker {...defaultProps} />);

      const selectButton = screen.getByText('ui.imagePicker.select');
      fireEvent.click(selectButton);

      const callArgs = vi.mocked(open).mock.calls[0][0];
      expect(callArgs.filters[0].extensions).toHaveLength(1);
      expect(callArgs.filters[0].extensions[0]).toBe('png');
    });
  });

  describe('tooltip 属性', () => {
    it('空状态时按钮有选择图片的 tooltip', () => {
      render(<ImagePicker {...defaultProps} />);
      const selectButton = screen.getByText('ui.imagePicker.select');
      expect(selectButton).toHaveAttribute('data-tooltip', 'ui.imagePicker.selectImageFile');
    });

    it('有图片时按钮 tooltip 显示图片名称', () => {
      render(<ImagePicker {...defaultProps} imageName="my-photo.png" />);
      const selectButton = screen.getByText('my-photo.png');
      expect(selectButton).toHaveAttribute('data-tooltip', 'my-photo.png');
    });
  });

  describe('样式和布局', () => {
    it('外层容器有 mb-2 类', () => {
      const { container } = render(<ImagePicker {...defaultProps} />);
      const outerDiv = container.firstChild as HTMLElement;
      expect(outerDiv.className).toContain('mb-2');
    });

    it('选择按钮有正确的样式类', () => {
      render(<ImagePicker {...defaultProps} />);
      const selectButton = screen.getByText('ui.imagePicker.select');
      expect(selectButton.className).toContain('text-sm');
      expect(selectButton.className).toContain('text-text-primary');
      expect(selectButton.className).toContain('cursor-pointer');
      expect(selectButton.className).toContain('truncate');
    });

    it('清除按钮有正确的样式类', () => {
      render(<ImagePicker {...defaultProps} imageName="test.png" />);
      const buttons = screen.getAllByRole('button');
      const clearButton = buttons[1];
      expect(clearButton.className).toContain('rounded-full');
      expect(clearButton.className).toContain('bg-bg-tertiary');
      expect(clearButton.className).toContain('transition-all');
    });

    it('清除按钮有过渡动画类', () => {
      render(<ImagePicker {...defaultProps} imageName="test.png" />);
      const buttons = screen.getAllByRole('button');
      const clearButton = buttons[1];
      expect(clearButton.className).toContain('duration-200');
      expect(clearButton.className).toContain('ease-in-out');
    });
  });

  describe('label 显示', () => {
    it('使用 Text 组件渲染 label', () => {
      render(<ImagePicker {...defaultProps} label="My Custom Label" />);
      expect(screen.getByText('My Custom Label')).toBeInTheDocument();
    });

    it('不同 label 文本正确显示', () => {
      const { rerender } = render(<ImagePicker {...defaultProps} label="Label 1" />);
      expect(screen.getByText('Label 1')).toBeInTheDocument();

      rerender(<ImagePicker {...defaultProps} label="Label 2" />);
      expect(screen.getByText('Label 2')).toBeInTheDocument();
    });
  });
});
