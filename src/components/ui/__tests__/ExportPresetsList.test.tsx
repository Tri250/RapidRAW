import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExportPresetsList from '../ExportPresetsList';
import { ExportPreset } from '../ExportImportProperties';
import { AppSettings, Theme } from '../AppProperties';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-123',
}));

const mockPresets: ExportPreset[] = [
  {
    id: 'preset-1',
    name: 'High Quality JPEG',
    fileFormat: 'jpeg',
    jpegQuality: 95,
    enableResize: false,
    resizeMode: 'width',
    resizeValue: 1920,
    dontEnlarge: false,
    keepMetadata: true,
    preserveTimestamps: true,
    stripGps: false,
    filenameTemplate: '{original_filename}',
    enableWatermark: false,
    watermarkPath: null,
    watermarkAnchor: 'bottomRight',
    watermarkScale: 10,
    watermarkSpacing: 10,
    watermarkOpacity: 50,
  },
  {
    id: 'preset-2',
    name: 'Web Optimized',
    fileFormat: 'webp',
    jpegQuality: 80,
    enableResize: true,
    resizeMode: 'width',
    resizeValue: 1200,
    dontEnlarge: true,
    keepMetadata: false,
    preserveTimestamps: false,
    stripGps: true,
    filenameTemplate: '{original_filename}_web',
    enableWatermark: false,
    watermarkPath: null,
    watermarkAnchor: 'bottomRight',
    watermarkScale: 10,
    watermarkSpacing: 10,
    watermarkOpacity: 50,
  },
  {
    id: 'preset-3',
    name: 'Print Ready',
    fileFormat: 'tiff',
    jpegQuality: 100,
    enableResize: false,
    resizeMode: 'width',
    resizeValue: 3000,
    dontEnlarge: false,
    keepMetadata: true,
    preserveTimestamps: true,
    stripGps: false,
    filenameTemplate: '{original_filename}_print',
    enableWatermark: false,
    watermarkPath: null,
    watermarkAnchor: 'bottomRight',
    watermarkScale: 10,
    watermarkSpacing: 10,
    watermarkOpacity: 50,
  },
  {
    id: '__last_used__',
    name: 'Last Used',
    fileFormat: 'jpeg',
    jpegQuality: 90,
    enableResize: false,
    resizeMode: 'width',
    resizeValue: 1920,
    dontEnlarge: false,
    keepMetadata: true,
    preserveTimestamps: true,
    stripGps: false,
    filenameTemplate: '{original_filename}',
    enableWatermark: false,
    watermarkPath: null,
    watermarkAnchor: 'bottomRight',
    watermarkScale: 10,
    watermarkSpacing: 10,
    watermarkOpacity: 50,
  },
  {
    id: 'default-web',
    name: 'Default Web',
    fileFormat: 'jpeg',
    jpegQuality: 85,
    enableResize: true,
    resizeMode: 'width',
    resizeValue: 1600,
    dontEnlarge: false,
    keepMetadata: false,
    preserveTimestamps: true,
    stripGps: true,
    filenameTemplate: '{original_filename}',
    enableWatermark: false,
    watermarkPath: null,
    watermarkAnchor: 'bottomRight',
    watermarkScale: 10,
    watermarkSpacing: 10,
    watermarkOpacity: 50,
  },
];

const mockCurrentSettings: Omit<ExportPreset, 'id' | 'name'> = {
  fileFormat: 'jpeg',
  jpegQuality: 90,
  enableResize: false,
  resizeMode: 'width',
  resizeValue: 1920,
  dontEnlarge: false,
  keepMetadata: true,
  preserveTimestamps: true,
  stripGps: false,
  filenameTemplate: '{original_filename}',
  enableWatermark: false,
  watermarkPath: null,
  watermarkAnchor: 'bottomRight',
  watermarkScale: 10,
  watermarkSpacing: 10,
  watermarkOpacity: 50,
};

const createMockAppSettings = (presets: ExportPreset[] = mockPresets): AppSettings => ({
  theme: Theme.Dark,
  lastRootPath: null,
  exportPresets: presets,
});

describe('ExportPresetsList', () => {
  const mockOnApplyPreset = vi.fn();
  const mockOnSettingsChange = vi.fn();

  beforeEach(() => {
    mockOnApplyPreset.mockClear();
    mockOnSettingsChange.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    it('渲染组件标题', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      expect(screen.getByText('ui.exportPresets.heading')).toBeInTheDocument();
    });

    it('渲染 Dropdown 组件', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      expect(dropdownButton).toBeInTheDocument();
    });

    it('渲染创建新预设按钮 (Plus 图标)', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );
      expect(plusButton).toBeInTheDocument();
    });
  });

  describe('导出预设列表显示', () => {
    it('Dropdown 中显示预设列表（过滤掉 __last_used__）', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      const options = screen.getAllByRole('option');
      expect(options.length).toBe(4);

      expect(screen.getByText('High Quality JPEG')).toBeInTheDocument();
      expect(screen.getByText('Web Optimized')).toBeInTheDocument();
      expect(screen.getByText('Print Ready')).toBeInTheDocument();
      expect(screen.getByText('Default Web')).toBeInTheDocument();
    });

    it('过滤掉 id 为 __last_used__ 的预设', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      expect(screen.queryByText('Last Used')).not.toBeInTheDocument();
    });
  });

  describe('选择预设', () => {
    it('选择预设时调用 onApplyPreset', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('Web Optimized'));

      expect(mockOnApplyPreset).toHaveBeenCalledTimes(1);
      expect(mockOnApplyPreset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'preset-2',
          name: 'Web Optimized',
        }),
      );
    });

    it('选择预设后 Dropdown 显示预设名称', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('Print Ready'));

      expect(screen.getByText('Print Ready')).toBeInTheDocument();
    });

    it('选择预设后显示保存和删除按钮（非默认预设）', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('High Quality JPEG'));

      const buttons = screen.getAllByRole('button');
      const saveButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );
      const deleteButton = buttons.find((btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.deleteTooltip');

      expect(saveButton).toBeInTheDocument();
      expect(deleteButton).toBeInTheDocument();
    });

    it('选择默认预设（id 以 default- 开头）时不显示保存和删除按钮', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('Default Web'));

      const buttons = screen.getAllByRole('button');
      const saveButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );
      const deleteButton = buttons.find((btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.deleteTooltip');

      expect(saveButton).toBeUndefined();
      expect(deleteButton).toBeUndefined();
    });
  });

  describe('创建新预设', () => {
    it('点击 Plus 按钮进入创建模式', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      expect(screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder')).toBeInTheDocument();
    });

    it('创建模式下显示输入框、保存按钮和取消按钮', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const input = screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder');
      expect(input).toBeInTheDocument();
      expect(input).toHaveFocus();

      const allButtons = screen.getAllByRole('button');
      expect(allButtons.length).toBe(2);
    });

    it('输入框为空时保存按钮禁用', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const saveButton = screen.getAllByRole('button')[0];
      expect(saveButton).toBeDisabled();
    });

    it('输入预设名称后保存按钮启用', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const input = screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder');
      fireEvent.change(input, { target: { value: 'My Preset' } });

      const saveButton = screen.getAllByRole('button')[0];
      expect(saveButton).not.toBeDisabled();
    });

    it('点击保存按钮创建新预设', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const input = screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder');
      fireEvent.change(input, { target: { value: 'My New Preset' } });

      const saveButton = screen.getAllByRole('button')[0];
      fireEvent.click(saveButton);

      expect(mockOnSettingsChange).toHaveBeenCalledTimes(1);

      const updatedSettings = mockOnSettingsChange.mock.calls[0][0];
      expect(updatedSettings.exportPresets).toHaveLength(mockPresets.length + 1);

      const newPreset = updatedSettings.exportPresets.find((p: ExportPreset) => p.name === 'My New Preset');
      expect(newPreset).toBeDefined();
      expect(newPreset.id).toBe('test-uuid-123');
      expect(newPreset.name).toBe('My New Preset');
    });

    it('按 Enter 键保存预设', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const input = screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder');
      fireEvent.change(input, { target: { value: 'Enter Preset' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnSettingsChange).toHaveBeenCalledTimes(1);
    });

    it('点击取消按钮退出创建模式', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);
      expect(screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder')).toBeInTheDocument();

      const cancelButton = screen.getAllByRole('button')[1];
      fireEvent.click(cancelButton);

      expect(screen.queryByPlaceholderText('ui.exportPresets.presetNamePlaceholder')).not.toBeInTheDocument();
    });

    it('空白名称不保存（trim 后为空）', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const input = screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder');
      fireEvent.change(input, { target: { value: '   ' } });

      const saveButton = screen.getAllByRole('button')[0];
      fireEvent.click(saveButton);

      expect(mockOnSettingsChange).not.toHaveBeenCalled();
    });

    it('新预设创建后自动选中该预设（Dropdown 显示新预设名称）', () => {
      const presetsWithNewOne = [
        ...mockPresets,
        {
          id: 'test-uuid-123',
          name: 'Auto Selected',
          ...mockCurrentSettings,
        },
      ];

      const { rerender } = render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const input = screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder');
      fireEvent.change(input, { target: { value: 'Auto Selected' } });

      const saveButton = screen.getAllByRole('button')[0];
      fireEvent.click(saveButton);

      expect(mockOnSettingsChange).toHaveBeenCalledTimes(1);

      const updatedSettings = mockOnSettingsChange.mock.calls[0][0];
      rerender(
        <ExportPresetsList
          appSettings={updatedSettings}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      expect(screen.getByText('Auto Selected')).toBeInTheDocument();
    });
  });

  describe('删除预设', () => {
    it('点击删除按钮删除选中的预设', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('Web Optimized'));

      const buttons = screen.getAllByRole('button');
      const deleteButton = buttons.find((btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.deleteTooltip');

      fireEvent.click(deleteButton!);

      expect(mockOnSettingsChange).toHaveBeenCalledTimes(1);

      const updatedSettings = mockOnSettingsChange.mock.calls[0][0];
      const remainingPreset = updatedSettings.exportPresets.find((p: ExportPreset) => p.id === 'preset-2');
      expect(remainingPreset).toBeUndefined();
    });

    it('删除预设后清空选中状态', () => {
      const { rerender } = render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('Web Optimized'));

      const buttonsBefore = screen.getAllByRole('button');
      const deleteButton = buttonsBefore.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.deleteTooltip',
      );
      expect(deleteButton).toBeInTheDocument();

      fireEvent.click(deleteButton!);

      expect(mockOnSettingsChange).toHaveBeenCalledTimes(1);
      const updatedSettings = mockOnSettingsChange.mock.calls[0][0];

      rerender(
        <ExportPresetsList
          appSettings={updatedSettings}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttonsAfter = screen.getAllByRole('button');
      const deleteButtonAfter = buttonsAfter.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.deleteTooltip',
      );
      expect(deleteButtonAfter).toBeUndefined();
    });
  });

  describe('覆盖预设', () => {
    it('点击保存按钮覆盖选中的预设', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={{
            ...mockCurrentSettings,
            jpegQuality: 50,
            fileFormat: 'png',
          }}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('High Quality JPEG'));

      const buttons = screen.getAllByRole('button');
      const saveButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );

      fireEvent.click(saveButton!);

      expect(mockOnSettingsChange).toHaveBeenCalledTimes(1);

      const updatedSettings = mockOnSettingsChange.mock.calls[0][0];
      const updatedPreset = updatedSettings.exportPresets.find((p: ExportPreset) => p.id === 'preset-1');
      expect(updatedPreset).toBeDefined();
      expect(updatedPreset.jpegQuality).toBe(50);
      expect(updatedPreset.fileFormat).toBe('png');
    });

    it('覆盖预设后显示保存成功状态（Check 图标）', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('High Quality JPEG'));

      const buttons = screen.getAllByRole('button');
      const saveButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );

      fireEvent.click(saveButton!);

      const buttonsAfter = screen.getAllByRole('button');
      const savedButton = buttonsAfter.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.savedTooltip',
      );
      expect(savedButton).toBeInTheDocument();
    });

    it('保存成功状态在 1500ms 后恢复', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('High Quality JPEG'));

      const buttons = screen.getAllByRole('button');
      const saveButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );

      fireEvent.click(saveButton!);

      const buttonsAfter = screen.getAllByRole('button');
      const savedButton = buttonsAfter.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.savedTooltip',
      );
      expect(savedButton).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      const buttonsFinal = screen.getAllByRole('button');
      const overwriteButton = buttonsFinal.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );
      expect(overwriteButton).toBeInTheDocument();
    });

    it('保存成功状态下按钮禁用', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('High Quality JPEG'));

      const buttons = screen.getAllByRole('button');
      const saveButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );

      fireEvent.click(saveButton!);

      const buttonsAfter = screen.getAllByRole('button');
      const savedButton = buttonsAfter.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.savedTooltip',
      );
      expect(savedButton).toBeDisabled();
    });
  });

  describe('应用预设', () => {
    it('选择预设时调用 onApplyPreset 并传入完整的预设对象', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      fireEvent.click(screen.getByText('Print Ready'));

      expect(mockOnApplyPreset).toHaveBeenCalledTimes(1);
      expect(mockOnApplyPreset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'preset-3',
          name: 'Print Ready',
          fileFormat: 'tiff',
          jpegQuality: 100,
        }),
      );
    });
  });

  describe('空状态', () => {
    it('没有预设时显示空的 Dropdown', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings([])}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
      expect(screen.queryAllByRole('option').length).toBe(0);
    });

    it('没有预设时仍显示创建新预设按钮', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings([])}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );
      expect(plusButton).toBeInTheDocument();
    });

    it('没有选中预设时不显示删除和覆盖按钮', () => {
      render(
        <ExportPresetsList
          appSettings={createMockAppSettings()}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const deleteButton = buttons.find((btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.deleteTooltip');
      const overwriteButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.overwriteTooltip',
      );

      expect(deleteButton).toBeUndefined();
      expect(overwriteButton).toBeUndefined();
    });
  });

  describe('appSettings 为 null', () => {
    it('appSettings 为 null 时正常渲染', () => {
      render(
        <ExportPresetsList
          appSettings={null}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      expect(screen.getByText('ui.exportPresets.heading')).toBeInTheDocument();
    });

    it('appSettings 为 null 时预设列表为空', () => {
      render(
        <ExportPresetsList
          appSettings={null}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      expect(screen.queryAllByRole('option').length).toBe(0);
    });

    it('appSettings 为 null 时点击创建预设不调用 onSettingsChange', () => {
      render(
        <ExportPresetsList
          appSettings={null}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const plusButton = buttons.find(
        (btn) => btn.getAttribute('data-tooltip') === 'ui.exportPresets.saveAsNewTooltip',
      );

      fireEvent.click(plusButton!);

      const input = screen.getByPlaceholderText('ui.exportPresets.presetNamePlaceholder');
      fireEvent.change(input, { target: { value: 'Test Preset' } });

      const saveButton = screen.getAllByRole('button')[0];
      fireEvent.click(saveButton);

      expect(mockOnSettingsChange).not.toHaveBeenCalled();
    });
  });

  describe('exportPresets 为 undefined', () => {
    it('exportPresets 未定义时使用空数组', () => {
      const settingsWithoutPresets: AppSettings = {
        theme: Theme.Dark,
        lastRootPath: null,
      };

      render(
        <ExportPresetsList
          appSettings={settingsWithoutPresets}
          currentSettings={mockCurrentSettings}
          onApplyPreset={mockOnApplyPreset}
          onSettingsChange={mockOnSettingsChange}
        />,
      );

      const dropdownButton = screen.getByRole('button', { expanded: false });
      fireEvent.click(dropdownButton);

      expect(screen.queryAllByRole('option').length).toBe(0);
    });
  });
});
