import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LUTControl from '../LUTControl';

const mockShowContextMenu = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('../../../context/ContextMenuContext', () => ({
  useContextMenu: () => ({
    showContextMenu: mockShowContextMenu,
  }),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../utils/hapticFeedback', () => ({
  hapticOnSliderChange: vi.fn(),
}));

vi.mock('../../../store/useEditorStore', () => ({
  useEditorStore: vi.fn((selector) => {
    const state = {
      selectedImage: {
        path: '/test/image.jpg',
        isReady: true,
      },
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      osPlatform: 'linux',
    })),
  },
}));

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-toastify';
import { useEditorStore } from '../../../store/useEditorStore';
import { useSettingsStore } from '../../../store/useSettingsStore';

describe('LUTControl', () => {
  const defaultProps = {
    lutPath: null,
    lutName: null,
    lutIntensity: 100,
    onLutSelect: vi.fn(),
    onLutHover: vi.fn(),
    onIntensityChange: vi.fn(),
    onClear: vi.fn(),
    onDragStateChange: vi.fn(),
  };

  const mockLutEntries = [
    { name: 'Cool Tone', path: '/luts/cool.cube' },
    { name: 'Warm Tone', path: '/luts/warm.cube' },
    { name: 'Vintage', path: '/luts/vintage.3dl' },
  ];

  const mockLutPreviews = [
    { path: '/luts/cool.cube', thumb: 'data:image/png;base64,cool' },
    { path: '/luts/warm.cube', thumb: 'data:image/png;base64,warm' },
    { path: '/luts/vintage.3dl', thumb: null },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as vi.Mock).mockResolvedValue([]);
    (useEditorStore as unknown as vi.Mock).mockImplementation((selector: any) => {
      const state = {
        selectedImage: {
          path: '/test/image.jpg',
          isReady: true,
        },
      };
      return selector ? selector(state) : state;
    });
  });

  describe('基本渲染', () => {
    it('渲染 LUT 标签文本', () => {
      render(<LUTControl {...defaultProps} />);
      expect(screen.getByText('ui.lut.label')).toBeInTheDocument();
    });

    it('未选择 LUT 时显示选择按钮', () => {
      render(<LUTControl {...defaultProps} />);
      expect(screen.getByText('ui.lut.select')).toBeInTheDocument();
    });

    it('未选择 LUT 时不显示清除按钮', () => {
      render(<LUTControl {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      const hasClearButton = buttons.some(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.lut.clearLut',
      );
      expect(hasClearButton).toBe(false);
    });

    it('选择 LUT 后显示 LUT 名称', () => {
      render(<LUTControl {...defaultProps} lutPath="/luts/cool.cube" lutName="Cool Tone" />);
      expect(screen.getByText('Cool Tone')).toBeInTheDocument();
    });

    it('选择 LUT 后显示清除按钮', () => {
      render(<LUTControl {...defaultProps} lutPath="/luts/cool.cube" lutName="Cool Tone" />);
      const clearButton = screen.getByRole('button', { name: '' });
      expect(clearButton).toHaveAttribute('data-tooltip', 'ui.lut.clearLut');
    });

    it('最外层容器有 mb-2 类', () => {
      const { container } = render(<LUTControl {...defaultProps} />);
      const outerDiv = container.firstChild;
      expect(outerDiv).toHaveClass('mb-2');
    });
  });

  describe('展开/收起', () => {
    it('点击选择按钮展开 LUT 列表', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });
    });

    it('再次点击收起 LUT 列表', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      fireEvent.click(toggleButton!);
      expect(screen.queryByText('Cool Tone')).not.toBeInTheDocument();
    });

    it('ChevronDown 图标在展开时旋转 180 度', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        const chevron = screen.getByText('ui.lut.select').nextElementSibling;
        expect(chevron).toHaveClass('rotate-180');
      });
    });
  });

  describe('LUT 列表显示', () => {
    it('空列表时显示导入按钮', async () => {
      (invoke as vi.Mock).mockResolvedValue([]);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('ui.lut.import')).toBeInTheDocument();
      });
    });

    it('显示 LUT 条目网格', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        mockLutEntries.forEach((entry) => {
          expect(screen.getByText(entry.name)).toBeInTheDocument();
        });
      });
    });

    it('列表末尾有添加按钮', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        const importButton = screen.getByRole('button', { name: '' });
        expect(importButton).toHaveAttribute('data-tooltip', 'ui.lut.import');
      });
    });

    it('LUT 条目使用网格布局', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        const gridContainer = screen.getByText('Cool Tone').closest('.grid');
        expect(gridContainer).toHaveClass('grid-cols-3');
        expect(gridContainer).toHaveClass('gap-2');
      });
    });
  });

  describe('选择 LUT', () => {
    it('点击 LUT 条目调用 onLutSelect', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      const onLutSelect = vi.fn();
      render(<LUTControl {...defaultProps} onLutSelect={onLutSelect} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      const coolButton = screen.getByText('Cool Tone').closest('button');
      fireEvent.click(coolButton!);

      expect(onLutSelect).toHaveBeenCalledWith('/luts/cool.cube');
    });

    it('点击已选中的 LUT 调用 onClear', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      const onClear = vi.fn();
      render(
        <LUTControl
          {...defaultProps}
          lutPath="/luts/cool.cube"
          lutName="Cool Tone"
          onClear={onClear}
        />,
      );

      const toggleButton = screen.getByText('Cool Tone').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      const coolSwatches = screen.getAllByText('Cool Tone');
      const swatchButton = coolSwatches[1].closest('button');
      fireEvent.click(swatchButton!);

      expect(onClear).toHaveBeenCalled();
    });

    it('选中的 LUT 有 border-accent 类', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      render(
        <LUTControl {...defaultProps} lutPath="/luts/cool.cube" lutName="Cool Tone" />,
      );

      const toggleButton = screen.getByText('Cool Tone').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        const coolTexts = screen.getAllByText('Cool Tone');
        const swatchText = coolTexts[1];
        const swatchButton = swatchText.closest('button');
        expect(swatchButton).toHaveClass('border-accent');
      });
    });
  });

  describe('LUT 强度调整', () => {
    it('选择 LUT 后显示强度滑块', () => {
      render(
        <LUTControl {...defaultProps} lutPath="/luts/cool.cube" lutName="Cool Tone" />,
      );
      expect(screen.getByText('ui.lut.intensity')).toBeInTheDocument();
    });

    it('未选择 LUT 时不显示强度滑块', () => {
      render(<LUTControl {...defaultProps} />);
      expect(screen.queryByText('ui.lut.intensity')).not.toBeInTheDocument();
    });

    it('滑块初始值为 lutIntensity', () => {
      render(
        <LUTControl
          {...defaultProps}
          lutPath="/luts/cool.cube"
          lutName="Cool Tone"
          lutIntensity={75}
        />,
      );
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('value', '75');
    });

    it('滑块值改变时调用 onIntensityChange', () => {
      const onIntensityChange = vi.fn();
      render(
        <LUTControl
          {...defaultProps}
          lutPath="/luts/cool.cube"
          lutName="Cool Tone"
          onIntensityChange={onIntensityChange}
        />,
      );
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '50' } });
      expect(onIntensityChange).toHaveBeenCalledWith(50);
    });

    it('滑块范围是 0-100', () => {
      render(
        <LUTControl {...defaultProps} lutPath="/luts/cool.cube" lutName="Cool Tone" />,
      );
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('min', '0');
      expect(slider).toHaveAttribute('max', '100');
    });

    it('滑块步长为 1', () => {
      render(
        <LUTControl {...defaultProps} lutPath="/luts/cool.cube" lutName="Cool Tone" />,
      );
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('step', '1');
    });
  });

  describe('启用/禁用 LUT', () => {
    it('点击清除按钮调用 onClear', () => {
      const onClear = vi.fn();
      render(
        <LUTControl
          {...defaultProps}
          lutPath="/luts/cool.cube"
          lutName="Cool Tone"
          onClear={onClear}
        />,
      );

      const clearButton = screen.getByRole('button', { name: '' });
      fireEvent.click(clearButton);

      expect(onClear).toHaveBeenCalled();
    });

    it('清除按钮有 data-tooltip 属性', () => {
      render(
        <LUTControl {...defaultProps} lutPath="/luts/cool.cube" lutName="Cool Tone" />,
      );
      const clearButton = screen.getByRole('button', { name: '' });
      expect(clearButton).toHaveAttribute('data-tooltip', 'ui.lut.clearLut');
    });
  });

  describe('不同 LUT 类型', () => {
    it('支持 .cube 扩展名的 LUT', async () => {
      const entries = [{ name: 'test.cube', path: '/luts/test.cube' }];
      (invoke as vi.Mock).mockResolvedValue(entries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('test.cube')).toBeInTheDocument();
      });
    });

    it('支持 .3dl 扩展名的 LUT', async () => {
      const entries = [{ name: 'test.3dl', path: '/luts/test.3dl' }];
      (invoke as vi.Mock).mockResolvedValue(entries);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('test.3dl')).toBeInTheDocument();
      });
    });
  });

  describe('自定义 LUT 导入', () => {
    it('点击导入按钮打开文件选择对话框', async () => {
      (invoke as vi.Mock).mockResolvedValue([]);
      (open as vi.Mock).mockResolvedValue(null);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('ui.lut.import')).toBeInTheDocument();
      });

      const importButton = screen.getByText('ui.lut.import').closest('button');
      fireEvent.click(importButton!);

      expect(open).toHaveBeenCalled();
    });

    it('导入 LUT 后更新列表', async () => {
      const newEntries = [
        { name: 'NewLUT.cube', path: '/luts/new.cube' },
      ];
      (invoke as vi.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(newEntries);
      (open as vi.Mock).mockResolvedValue(['/downloads/new.cube']);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('ui.lut.import')).toBeInTheDocument();
      });

      const importButton = screen.getByText('ui.lut.import').closest('button');
      fireEvent.click(importButton!);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('import_luts', {
          sourcePaths: ['/downloads/new.cube'],
        });
      });
    });

    it('取消文件选择不执行导入', async () => {
      (invoke as vi.Mock).mockResolvedValue([]);
      (open as vi.Mock).mockResolvedValue(null);
      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('ui.lut.import')).toBeInTheDocument();
      });

      const importButton = screen.getByText('ui.lut.import').closest('button');
      fireEvent.click(importButton!);

      expect(invoke).not.toHaveBeenCalledWith('import_luts', expect.any(Object));
    });

    it('导入失败时显示错误提示', async () => {
      (invoke as vi.Mock)
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Import failed'));
      (open as vi.Mock).mockResolvedValue(['/downloads/new.cube']);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('ui.lut.import')).toBeInTheDocument();
      });

      const importButton = screen.getByText('ui.lut.import').closest('button');
      fireEvent.click(importButton!);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('ui.lut.importFailed');
      });
    });
  });

  describe('重置为默认', () => {
    it('双击强度标签重置强度为 100', () => {
      const onIntensityChange = vi.fn();
      render(
        <LUTControl
          {...defaultProps}
          lutPath="/luts/cool.cube"
          lutName="Cool Tone"
          lutIntensity={50}
          onIntensityChange={onIntensityChange}
        />,
      );

      const label = screen.getByText('ui.lut.intensity');
      fireEvent.doubleClick(label);

      expect(onIntensityChange).toHaveBeenCalledWith(100);
    });
  });

  describe('onChange 回调', () => {
    it('onLutHover 在鼠标进入时被调用', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      const onLutHover = vi.fn();
      render(<LUTControl {...defaultProps} onLutHover={onLutHover} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      const coolSwatch = screen.getByText('Cool Tone').closest('button');
      fireEvent.mouseEnter(coolSwatch!);

      expect(onLutHover).toHaveBeenCalledWith('/luts/cool.cube');
    });

    it('onLutHover 在鼠标离开时被调用为 null', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);
      const onLutHover = vi.fn();
      render(<LUTControl {...defaultProps} onLutHover={onLutHover} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      const coolSwatch = screen.getByText('Cool Tone').closest('button');
      fireEvent.mouseLeave(coolSwatch!);

      expect(onLutHover).toHaveBeenCalledWith(null);
    });

    it('onDragStateChange 从 Slider 透传', () => {
      const onDragStateChange = vi.fn();
      render(
        <LUTControl
          {...defaultProps}
          lutPath="/luts/cool.cube"
          lutName="Cool Tone"
          onDragStateChange={onDragStateChange}
        />,
      );

      const slider = screen.getByRole('slider');
      fireEvent.mouseDown(slider, { clientX: 50 });

      expect(onDragStateChange).toHaveBeenCalledWith(true);
    });
  });

  describe('加载状态', () => {
    it('预览加载中 isLoadingPreviews 为 true', async () => {
      let resolvePreviews: ((value: any) => void) | null = null;
      const previewsPromise = new Promise((resolve) => {
        resolvePreviews = resolve;
      });

      (invoke as vi.Mock)
        .mockResolvedValueOnce(mockLutEntries)
        .mockImplementationOnce(() => previewsPromise);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          'generate_lut_previews',
          expect.objectContaining({
            lutPaths: expect.any(Array),
          }),
        );
      });

      const coolButton = screen.getByText('Cool Tone').closest('button');
      const hasLoadingState = coolButton?.querySelector('.animate-pulse');
      expect(hasLoadingState).toBeTruthy();

      resolvePreviews!(mockLutPreviews);
    });
  });

  describe('预览图', () => {
    it('有预览图时显示 img 元素', async () => {
      (invoke as vi.Mock)
        .mockResolvedValueOnce(mockLutEntries)
        .mockResolvedValueOnce(mockLutPreviews);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        const img = screen.getByAltText('Cool Tone');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'data:image/png;base64,cool');
      });
    });

    it('无预览图时显示 ImageOff 图标', async () => {
      (invoke as vi.Mock)
        .mockResolvedValueOnce(mockLutEntries)
        .mockResolvedValueOnce(mockLutPreviews);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        const vintageButton = screen.getByText('Vintage').closest('button');
        const imageOff = vintageButton?.querySelector('.lucide-image-off');
        expect(imageOff).toBeInTheDocument();
      });
    });
  });

  describe('右键菜单', () => {
    it('右键点击 LUT 显示上下文菜单', async () => {
      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      const coolSwatch = screen.getByText('Cool Tone').closest('button');
      fireEvent.contextMenu(coolSwatch!);

      expect(mockShowContextMenu).toHaveBeenCalled();
    });

    it('删除 LUT 调用 remove_lut 命令', async () => {
      let deleteHandler: (() => void) | null = null;

      mockShowContextMenu.mockImplementation((_x: number, _y: number, items: any[]) => {
        const deleteItem = items.find((item) => item.label === 'ui.lut.removeLut');
        if (deleteItem) {
          deleteHandler = deleteItem.onClick;
        }
      });

      (invoke as vi.Mock)
        .mockResolvedValueOnce(mockLutEntries)
        .mockResolvedValueOnce(mockLutEntries.slice(1));

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      const coolSwatch = screen.getByText('Cool Tone').closest('button');
      fireEvent.contextMenu(coolSwatch!);

      expect(deleteHandler).not.toBeNull();

      await deleteHandler!();

      expect(invoke).toHaveBeenCalledWith('remove_lut', { path: '/luts/cool.cube' });
    });

    it('删除当前选中的 LUT 时调用 onClear', async () => {
      const onClear = vi.fn();
      let deleteHandler: (() => void) | null = null;

      mockShowContextMenu.mockImplementation((_x: number, _y: number, items: any[]) => {
        const deleteItem = items.find((item) => item.label === 'ui.lut.removeLut');
        if (deleteItem) {
          deleteHandler = deleteItem.onClick;
        }
      });

      (invoke as vi.Mock)
        .mockResolvedValueOnce(mockLutEntries)
        .mockResolvedValueOnce(mockLutEntries.slice(1));

      render(
        <LUTControl
          {...defaultProps}
          lutPath="/luts/cool.cube"
          lutName="Cool Tone"
          onClear={onClear}
        />,
      );

      const toggleButton = screen.getByText('Cool Tone').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        const coolTexts = screen.getAllByText('Cool Tone');
        expect(coolTexts.length).toBeGreaterThan(1);
      });

      const coolTexts = screen.getAllByText('Cool Tone');
      const swatchButton = coolTexts[1].closest('button');
      fireEvent.contextMenu(swatchButton!);

      expect(deleteHandler).not.toBeNull();

      await deleteHandler!();

      expect(onClear).toHaveBeenCalled();
    });
  });

  describe('LUT 列表加载失败', () => {
    it('list_luts 失败时不崩溃', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (invoke as vi.Mock).mockRejectedValue(new Error('Failed to list'));

      expect(() => {
        render(<LUTControl {...defaultProps} />);
      }).not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('无选中图片时不生成预览', () => {
    it('selectedImage 为 null 时不调用 generate_lut_previews', async () => {
      (useEditorStore as unknown as vi.Mock).mockImplementation((selector: any) => {
        const state = {
          selectedImage: null,
        };
        return selector ? selector(state) : state;
      });

      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      expect(invoke).not.toHaveBeenCalledWith(
        'generate_lut_previews',
        expect.any(Object),
      );
    });

    it('图片未就绪时不调用 generate_lut_previews', async () => {
      (useEditorStore as unknown as vi.Mock).mockImplementation((selector: any) => {
        const state = {
          selectedImage: {
            path: '/test/image.jpg',
            isReady: false,
          },
        };
        return selector ? selector(state) : state;
      });

      (invoke as vi.Mock).mockResolvedValue(mockLutEntries);

      render(<LUTControl {...defaultProps} />);

      const toggleButton = screen.getByText('ui.lut.select').closest('button');
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Cool Tone')).toBeInTheDocument();
      });

      expect(invoke).not.toHaveBeenCalledWith(
        'generate_lut_previews',
        expect.any(Object),
      );
    });
  });

  describe('LUT 名称显示', () => {
    it('名称过长时被截断', () => {
      const longName = 'VeryLongLUTNameThatShouldBeTruncated.cube';
      render(
        <LUTControl {...defaultProps} lutPath="/luts/long.cube" lutName={longName} />,
      );
      const nameSpan = screen.getByText(longName);
      expect(nameSpan).toHaveClass('truncate');
      expect(nameSpan).toHaveClass('max-w-35');
    });

    it('未选择时显示 select 文本', () => {
      render(<LUTControl {...defaultProps} />);
      expect(screen.getByText('ui.lut.select')).toBeInTheDocument();
    });
  });
});
