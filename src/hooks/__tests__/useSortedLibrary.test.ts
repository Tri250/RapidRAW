import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useSortedLibrary,
  computeSortedLibrary,
  parseShutter,
  parseAperture,
  parseFocalLength,
  ADVANCED_QUERY_REGEX,
} from '../useSortedLibrary';
import { RawStatus, EditedStatus, SortDirection, ImageFile } from '../../components/ui/AppProperties';

vi.mock('../../store/useLibraryStore', () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

import { useLibraryStore } from '../../store/useLibraryStore';
import { useSettingsStore } from '../../store/useSettingsStore';

const mockImageFile = (overrides: Partial<ImageFile> = {}): ImageFile => ({
  is_edited: false,
  modified: 1000000,
  path: '/test/image.jpg',
  rating: 0,
  tags: null,
  exif: null,
  is_virtual_copy: false,
  is_cloud_placeholder: false,
  ...overrides,
});

const createLibraryState = (overrides: any = {}) => ({
  imageList: [],
  imageRatings: {},
  filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
  searchCriteria: { tags: [], text: '', mode: 'OR' },
  sortCriteria: { key: 'name', order: SortDirection.Ascending },
  ...overrides,
});

const createSettingsState = (overrides: any = {}) => ({
  appSettings: null,
  supportedTypes: {
    raw: ['cr2', 'nef', 'arw'],
    nonRaw: ['jpg', 'jpeg', 'png'],
  },
  ...overrides,
});

describe('useSortedLibrary', () => {
  let mockLibraryState: ReturnType<typeof createLibraryState>;
  let mockSettingsState: ReturnType<typeof createSettingsState>;

  beforeEach(() => {
    mockLibraryState = createLibraryState();
    mockSettingsState = createSettingsState();

    vi.mocked(useLibraryStore).mockImplementation((selector: any) => {
      return selector(mockLibraryState);
    });

    vi.mocked(useSettingsStore).mockImplementation((selector: any) => {
      return selector(mockSettingsState);
    });
  });

  describe('hook 返回值结构', () => {
    it('返回一个数组（ImageFile[]）', () => {
      const { result } = renderHook(() => useSortedLibrary());

      expect(Array.isArray(result.current)).toBe(true);
    });

    it('初始状态下返回空数组', () => {
      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current).toEqual([]);
    });
  });

  describe('初始排序状态', () => {
    it('默认为按名称升序排序', () => {
      const images = [
        mockImageFile({ path: '/b.jpg' }),
        mockImageFile({ path: '/a.jpg' }),
        mockImageFile({ path: '/c.jpg' }),
      ];
      mockLibraryState.imageList = images;

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    });
  });

  describe('按名称排序', () => {
    it('升序排序', () => {
      const images = [
        mockImageFile({ path: '/zebra.jpg' }),
        mockImageFile({ path: '/apple.jpg' }),
        mockImageFile({ path: '/mango.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/apple.jpg', '/mango.jpg', '/zebra.jpg']);
    });

    it('降序排序', () => {
      const images = [
        mockImageFile({ path: '/zebra.jpg' }),
        mockImageFile({ path: '/apple.jpg' }),
        mockImageFile({ path: '/mango.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/zebra.jpg', '/mango.jpg', '/apple.jpg']);
    });
  });

  describe('按日期修改排序 (date)', () => {
    it('升序排序（从旧到新）', () => {
      const images = [
        mockImageFile({ path: '/new.jpg', modified: 2000 }),
        mockImageFile({ path: '/old.jpg', modified: 1000 }),
        mockImageFile({ path: '/mid.jpg', modified: 1500 }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'date', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/old.jpg', '/mid.jpg', '/new.jpg']);
    });

    it('降序排序（从新到旧）', () => {
      const images = [
        mockImageFile({ path: '/new.jpg', modified: 2000 }),
        mockImageFile({ path: '/old.jpg', modified: 1000 }),
        mockImageFile({ path: '/mid.jpg', modified: 1500 }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'date', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/new.jpg', '/mid.jpg', '/old.jpg']);
    });

    it('日期相同时按名称排序', () => {
      const images = [
        mockImageFile({ path: '/b.jpg', modified: 1000 }),
        mockImageFile({ path: '/a.jpg', modified: 1000 }),
        mockImageFile({ path: '/c.jpg', modified: 1000 }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'date', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    });
  });

  describe('按拍摄日期排序 (date_taken)', () => {
    it('升序排序', () => {
      const images = [
        mockImageFile({
          path: '/new.jpg',
          exif: { DateTimeOriginal: '2024:01:02 00:00:00' },
          modified: 1000,
        }),
        mockImageFile({
          path: '/old.jpg',
          exif: { DateTimeOriginal: '2024:01:01 00:00:00' },
          modified: 1000,
        }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'date_taken', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/old.jpg', '/new.jpg']);
    });

    it('降序排序', () => {
      const images = [
        mockImageFile({
          path: '/new.jpg',
          exif: { DateTimeOriginal: '2024:01:02 00:00:00' },
          modified: 1000,
        }),
        mockImageFile({
          path: '/old.jpg',
          exif: { DateTimeOriginal: '2024:01:01 00:00:00' },
          modified: 1000,
        }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'date_taken', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/new.jpg', '/old.jpg']);
    });

    it('拍摄日期相同时按修改日期排序', () => {
      const images = [
        mockImageFile({
          path: '/later.jpg',
          exif: { DateTimeOriginal: '2024:01:01 00:00:00' },
          modified: 2000,
        }),
        mockImageFile({
          path: '/earlier.jpg',
          exif: { DateTimeOriginal: '2024:01:01 00:00:00' },
          modified: 1000,
        }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'date_taken', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/earlier.jpg', '/later.jpg']);
    });

    it('无 exif 时按修改日期排序', () => {
      const images = [
        mockImageFile({ path: '/new.jpg', exif: null, modified: 2000 }),
        mockImageFile({ path: '/old.jpg', exif: null, modified: 1000 }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'date_taken', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/old.jpg', '/new.jpg']);
    });
  });

  describe('按评分排序 (rating)', () => {
    it('升序排序', () => {
      const images = [
        mockImageFile({ path: '/high.jpg' }),
        mockImageFile({ path: '/low.jpg' }),
        mockImageFile({ path: '/mid.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.imageRatings = {
        '/high.jpg': 5,
        '/low.jpg': 1,
        '/mid.jpg': 3,
      };
      mockLibraryState.sortCriteria = { key: 'rating', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/low.jpg', '/mid.jpg', '/high.jpg']);
    });

    it('降序排序', () => {
      const images = [
        mockImageFile({ path: '/high.jpg' }),
        mockImageFile({ path: '/low.jpg' }),
        mockImageFile({ path: '/mid.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.imageRatings = {
        '/high.jpg': 5,
        '/low.jpg': 1,
        '/mid.jpg': 3,
      };
      mockLibraryState.sortCriteria = { key: 'rating', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/high.jpg', '/mid.jpg', '/low.jpg']);
    });

    it('未评分的图片评分为 0', () => {
      const images = [mockImageFile({ path: '/rated.jpg' }), mockImageFile({ path: '/unrated.jpg' })];
      mockLibraryState.imageList = images;
      mockLibraryState.imageRatings = { '/rated.jpg': 3 };
      mockLibraryState.sortCriteria = { key: 'rating', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/unrated.jpg', '/rated.jpg']);
    });
  });

  describe('按编辑状态排序 (edited)', () => {
    it('升序排序（未编辑在前）', () => {
      const images = [
        mockImageFile({ path: '/edited.jpg', is_edited: true }),
        mockImageFile({ path: '/unedited.jpg', is_edited: false }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'edited', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/unedited.jpg', '/edited.jpg']);
    });

    it('降序排序（已编辑在前）', () => {
      const images = [
        mockImageFile({ path: '/edited.jpg', is_edited: true }),
        mockImageFile({ path: '/unedited.jpg', is_edited: false }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'edited', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/edited.jpg', '/unedited.jpg']);
    });
  });

  describe('按 ISO 排序', () => {
    it('升序排序', () => {
      const images = [
        mockImageFile({ path: '/high.jpg', exif: { PhotographicSensitivity: '1600' } }),
        mockImageFile({ path: '/low.jpg', exif: { PhotographicSensitivity: '100' } }),
        mockImageFile({ path: '/mid.jpg', exif: { PhotographicSensitivity: '400' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'iso', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/low.jpg', '/mid.jpg', '/high.jpg']);
    });

    it('降序排序', () => {
      const images = [
        mockImageFile({ path: '/high.jpg', exif: { PhotographicSensitivity: '1600' } }),
        mockImageFile({ path: '/low.jpg', exif: { PhotographicSensitivity: '100' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'iso', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/high.jpg', '/low.jpg']);
    });

    it('支持 ISOSpeedRatings 字段名', () => {
      const images = [
        mockImageFile({ path: '/high.jpg', exif: { ISOSpeedRatings: '800' } }),
        mockImageFile({ path: '/low.jpg', exif: { ISOSpeedRatings: '100' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'iso', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/low.jpg', '/high.jpg']);
    });

    it('无 ISO 时按 0 处理', () => {
      const images = [
        mockImageFile({ path: '/with-iso.jpg', exif: { PhotographicSensitivity: '200' } }),
        mockImageFile({ path: '/no-iso.jpg', exif: null }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'iso', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/no-iso.jpg', '/with-iso.jpg']);
    });
  });

  describe('按快门速度排序 (shutter_speed)', () => {
    it('升序排序', () => {
      const images = [
        mockImageFile({ path: '/fast.jpg', exif: { ExposureTime: '1/1000' } }),
        mockImageFile({ path: '/slow.jpg', exif: { ExposureTime: '1/10' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'shutter_speed', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/fast.jpg', '/slow.jpg']);
    });

    it('降序排序', () => {
      const images = [
        mockImageFile({ path: '/fast.jpg', exif: { ExposureTime: '1/1000' } }),
        mockImageFile({ path: '/slow.jpg', exif: { ExposureTime: '1/10' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'shutter_speed', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/slow.jpg', '/fast.jpg']);
    });
  });

  describe('按光圈排序 (aperture)', () => {
    it('升序排序', () => {
      const images = [
        mockImageFile({ path: '/large.jpg', exif: { FNumber: 'f/1.8' } }),
        mockImageFile({ path: '/small.jpg', exif: { FNumber: 'f/16' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'aperture', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/large.jpg', '/small.jpg']);
    });

    it('降序排序', () => {
      const images = [
        mockImageFile({ path: '/large.jpg', exif: { FNumber: 'f/1.8' } }),
        mockImageFile({ path: '/small.jpg', exif: { FNumber: 'f/16' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'aperture', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/small.jpg', '/large.jpg']);
    });
  });

  describe('按焦距排序 (focal_length)', () => {
    it('升序排序', () => {
      const images = [
        mockImageFile({ path: '/tele.jpg', exif: { FocalLength: '200 mm' } }),
        mockImageFile({ path: '/wide.jpg', exif: { FocalLength: '24 mm' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'focal_length', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/wide.jpg', '/tele.jpg']);
    });

    it('降序排序', () => {
      const images = [
        mockImageFile({ path: '/tele.jpg', exif: { FocalLength: '200 mm' } }),
        mockImageFile({ path: '/wide.jpg', exif: { FocalLength: '24 mm' } }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'focal_length', order: SortDirection.Descending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/tele.jpg', '/wide.jpg']);
    });
  });

  describe('空数组处理', () => {
    it('空图片列表返回空数组', () => {
      mockLibraryState.imageList = [];

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current).toEqual([]);
    });

    it('空数组在各种排序方式下都返回空数组', () => {
      mockLibraryState.imageList = [];

      const sortKeys = [
        'name',
        'date',
        'date_taken',
        'rating',
        'edited',
        'iso',
        'shutter_speed',
        'aperture',
        'focal_length',
      ];
      const orders = [SortDirection.Ascending, SortDirection.Descending];

      for (const key of sortKeys) {
        for (const order of orders) {
          mockLibraryState.sortCriteria = { key, order };
          const { result } = renderHook(() => useSortedLibrary());
          expect(result.current).toEqual([]);
        }
      }
    });
  });

  describe('单元素数组', () => {
    it('单元素数组排序后仍只有一个元素', () => {
      const image = mockImageFile({ path: '/single.jpg' });
      mockLibraryState.imageList = [image];

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current).toHaveLength(1);
      expect(result.current[0].path).toBe('/single.jpg');
    });

    it('单元素在各种排序方式下结果相同', () => {
      const image = mockImageFile({ path: '/single.jpg', modified: 1000 });
      mockLibraryState.imageList = [image];

      const sortKeys = ['name', 'date', 'rating', 'edited'];
      for (const key of sortKeys) {
        mockLibraryState.sortCriteria = { key, order: SortDirection.Ascending };
        const { result } = renderHook(() => useSortedLibrary());
        expect(result.current).toHaveLength(1);
      }
    });
  });

  describe('多元素数组排序验证', () => {
    it('多个元素按名称正确排序', () => {
      const images = [
        mockImageFile({ path: '/img10.jpg' }),
        mockImageFile({ path: '/img2.jpg' }),
        mockImageFile({ path: '/img1.jpg' }),
        mockImageFile({ path: '/img20.jpg' }),
        mockImageFile({ path: '/img3.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual([
        '/img1.jpg',
        '/img10.jpg',
        '/img2.jpg',
        '/img20.jpg',
        '/img3.jpg',
      ]);
    });

    it('排序不会修改原始数组', () => {
      const images = [mockImageFile({ path: '/b.jpg' }), mockImageFile({ path: '/a.jpg' })];
      const originalOrder = images.map((img) => img.path);
      mockLibraryState.imageList = images;

      renderHook(() => useSortedLibrary());

      expect(images.map((img) => img.path)).toEqual(originalOrder);
    });
  });

  describe('特殊字符/中文排序', () => {
    it('中文文件名排序', () => {
      const images = [
        mockImageFile({ path: '/香蕉.jpg' }),
        mockImageFile({ path: '/苹果.jpg' }),
        mockImageFile({ path: '/橙子.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      const paths = result.current.map((img) => img.path);
      expect(paths).toHaveLength(3);
      expect(paths).toContain('/香蕉.jpg');
      expect(paths).toContain('/苹果.jpg');
      expect(paths).toContain('/橙子.jpg');
    });

    it('包含特殊字符的文件名排序', () => {
      const images = [
        mockImageFile({ path: '/image (1).jpg' }),
        mockImageFile({ path: '/image-2.jpg' }),
        mockImageFile({ path: '/image_3.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      const paths = result.current.map((img) => img.path);
      expect(paths).toHaveLength(3);
      expect(Array.isArray(paths)).toBe(true);
    });

    it('混合中英文文件名排序', () => {
      const images = [
        mockImageFile({ path: '/photo.jpg' }),
        mockImageFile({ path: '/照片.jpg' }),
        mockImageFile({ path: '/image.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      const paths = result.current.map((img) => img.path);
      expect(paths).toHaveLength(3);
    });
  });

  describe('排序方向切换', () => {
    it('升序切换为降序', () => {
      const images = [
        mockImageFile({ path: '/a.jpg' }),
        mockImageFile({ path: '/b.jpg' }),
        mockImageFile({ path: '/c.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };

      const { result, rerender } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);

      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Descending };
      rerender();

      expect(result.current.map((img) => img.path)).toEqual(['/c.jpg', '/b.jpg', '/a.jpg']);
    });

    it('降序切换为升序', () => {
      const images = [
        mockImageFile({ path: '/a.jpg' }),
        mockImageFile({ path: '/b.jpg' }),
        mockImageFile({ path: '/c.jpg' }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Descending };

      const { result, rerender } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/c.jpg', '/b.jpg', '/a.jpg']);

      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };
      rerender();

      expect(result.current.map((img) => img.path)).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    });
  });

  describe('排序字段切换', () => {
    it('从名称排序切换为日期排序', () => {
      const images = [
        mockImageFile({ path: '/a.jpg', modified: 3000 }),
        mockImageFile({ path: '/b.jpg', modified: 2000 }),
        mockImageFile({ path: '/c.jpg', modified: 1000 }),
      ];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'name', order: SortDirection.Ascending };

      const { result, rerender } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);

      mockLibraryState.sortCriteria = { key: 'date', order: SortDirection.Ascending };
      rerender();

      expect(result.current.map((img) => img.path)).toEqual(['/c.jpg', '/b.jpg', '/a.jpg']);
    });
  });

  describe('文件大小排序', () => {
    it('没有专门的 size 排序字段时使用默认名称排序', () => {
      const images = [mockImageFile({ path: '/large.jpg' }), mockImageFile({ path: '/small.jpg' })];
      mockLibraryState.imageList = images;
      mockLibraryState.sortCriteria = { key: 'size', order: SortDirection.Ascending };

      const { result } = renderHook(() => useSortedLibrary());

      expect(result.current.map((img) => img.path)).toEqual(['/large.jpg', '/small.jpg']);
    });
  });
});

describe('parseShutter', () => {
  it('解析分数形式的快门速度', () => {
    expect(parseShutter('1/1000')).toBe(0.001);
    expect(parseShutter('1/60')).toBeCloseTo(0.0166667, 5);
    expect(parseShutter('1/2')).toBe(0.5);
  });

  it('解析小数形式的快门速度', () => {
    expect(parseShutter('2.5')).toBe(2.5);
    expect(parseShutter('30')).toBe(30);
  });

  it('解析带 s 后缀的快门速度', () => {
    expect(parseShutter('30s')).toBe(30);
    expect(parseShutter('1/1000s')).toBe(0.001);
    expect(parseShutter('2.5S')).toBe(2.5);
  });

  it('空值或 undefined 返回 0', () => {
    expect(parseShutter(undefined)).toBe(0);
    expect(parseShutter('')).toBe(0);
  });

  it('无效值返回 0', () => {
    expect(parseShutter('abc')).toBe(0);
    expect(parseShutter('1/0')).toBe(0);
  });
});

describe('parseAperture', () => {
  it('解析 f/ 开头的光圈值', () => {
    expect(parseAperture('f/1.8')).toBe(1.8);
    expect(parseAperture('f/16')).toBe(16);
    expect(parseAperture('f/2.8')).toBe(2.8);
  });

  it('解析纯数字光圈值', () => {
    expect(parseAperture('1.8')).toBe(1.8);
    expect(parseAperture('16')).toBe(16);
  });

  it('空值或 undefined 返回 0', () => {
    expect(parseAperture(undefined)).toBe(0);
    expect(parseAperture('')).toBe(0);
  });

  it('无效值返回 0', () => {
    expect(parseAperture('abc')).toBe(0);
  });
});

describe('parseFocalLength', () => {
  it('解析带 mm 单位的焦距', () => {
    expect(parseFocalLength('24 mm')).toBe(24);
    expect(parseFocalLength('200mm')).toBe(200);
    expect(parseFocalLength('85.0 mm')).toBe(85);
  });

  it('解析纯数字焦距', () => {
    expect(parseFocalLength('24')).toBe(24);
    expect(parseFocalLength('200')).toBe(200);
  });

  it('空值或 undefined 返回 0', () => {
    expect(parseFocalLength(undefined)).toBe(0);
    expect(parseFocalLength('')).toBe(0);
  });

  it('无效值返回 0', () => {
    expect(parseFocalLength('abc')).toBe(0);
  });
});

describe('ADVANCED_QUERY_REGEX', () => {
  it('匹配 iso 查询', () => {
    const match = 'iso:100'.match(ADVANCED_QUERY_REGEX);
    expect(match).toBeTruthy();
    expect(match![1].toLowerCase()).toBe('iso');
    expect(match![3]).toBe('100');
  });

  it('匹配 aperture 查询', () => {
    const match = 'aperture:f/2.8'.match(ADVANCED_QUERY_REGEX);
    expect(match).toBeTruthy();
    expect(match![1].toLowerCase()).toBe('aperture');
    expect(match![3]).toBe('f/2.8');
  });

  it('匹配带比较运算符的查询', () => {
    const match = 'iso>400'.match(ADVANCED_QUERY_REGEX);
    expect(match).toBeTruthy();
    expect(match![1].toLowerCase()).toBe('iso');
    expect(match![2]).toBe('>');
    expect(match![3]).toBe('400');
  });

  it('匹配 >= 和 <= 运算符', () => {
    const match1 = 'iso>=400'.match(ADVANCED_QUERY_REGEX);
    expect(match1).toBeTruthy();
    expect(match1![2]).toBe('>=');

    const match2 = 'iso<=800'.match(ADVANCED_QUERY_REGEX);
    expect(match2).toBeTruthy();
    expect(match2![2]).toBe('<=');
  });

  it('匹配带冒号分隔符的查询', () => {
    const match = 'shutter:1/60'.match(ADVANCED_QUERY_REGEX);
    expect(match).toBeTruthy();
    expect(match![1].toLowerCase()).toBe('shutter');
    expect(match![3]).toBe('1/60');
  });

  it('匹配 f 作为 aperture 的别名', () => {
    const match = 'f:2.8'.match(ADVANCED_QUERY_REGEX);
    expect(match).toBeTruthy();
    expect(match![1].toLowerCase()).toBe('f');
  });

  it('匹配 s 作为 shutter 的别名', () => {
    const match = 's:1/60'.match(ADVANCED_QUERY_REGEX);
    expect(match).toBeTruthy();
    expect(match![1].toLowerCase()).toBe('s');
  });

  it('匹配 mm 作为 focal 的别名', () => {
    const match = 'mm:50'.match(ADVANCED_QUERY_REGEX);
    expect(match).toBeTruthy();
    expect(match![1].toLowerCase()).toBe('mm');
  });

  it('不匹配普通标签', () => {
    expect('landscape'.match(ADVANCED_QUERY_REGEX)).toBeNull();
    expect('portrait'.match(ADVANCED_QUERY_REGEX)).toBeNull();
  });
});

describe('computeSortedLibrary', () => {
  it('直接调用返回排序后的列表', () => {
    const images = [mockImageFile({ path: '/b.jpg' }), mockImageFile({ path: '/a.jpg' })];
    const libraryState = createLibraryState({
      imageList: images,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/a.jpg', '/b.jpg']);
  });

  it('按评分过滤', () => {
    const images = [
      mockImageFile({ path: '/rated-5.jpg' }),
      mockImageFile({ path: '/rated-3.jpg' }),
      mockImageFile({ path: '/unrated.jpg' }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      imageRatings: {
        '/rated-5.jpg': 5,
        '/rated-3.jpg': 3,
      },
      filterCriteria: { colors: [], rating: 4, rawStatus: RawStatus.All },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/rated-5.jpg']);
  });

  it('按编辑状态过滤 - 仅已编辑', () => {
    const images = [
      mockImageFile({ path: '/edited.jpg', is_edited: true }),
      mockImageFile({ path: '/unedited.jpg', is_edited: false }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      filterCriteria: {
        colors: [],
        rating: 0,
        rawStatus: RawStatus.All,
        editedStatus: EditedStatus.EditedOnly,
      },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/edited.jpg']);
  });

  it('按编辑状态过滤 - 仅未编辑', () => {
    const images = [
      mockImageFile({ path: '/edited.jpg', is_edited: true }),
      mockImageFile({ path: '/unedited.jpg', is_edited: false }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      filterCriteria: {
        colors: [],
        rating: 0,
        rawStatus: RawStatus.All,
        editedStatus: EditedStatus.UneditedOnly,
      },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/unedited.jpg']);
  });

  it('按颜色标签过滤', () => {
    const images = [
      mockImageFile({ path: '/red.jpg', tags: ['color:red'] }),
      mockImageFile({ path: '/blue.jpg', tags: ['color:blue'] }),
      mockImageFile({ path: '/no-color.jpg', tags: [] }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      filterCriteria: { colors: ['red'], rating: 0, rawStatus: RawStatus.All },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/red.jpg']);
  });

  it('按颜色标签过滤 - 匹配 none', () => {
    const images = [
      mockImageFile({ path: '/red.jpg', tags: ['color:red'] }),
      mockImageFile({ path: '/no-color.jpg', tags: [] }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      filterCriteria: { colors: ['none'], rating: 0, rawStatus: RawStatus.All },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/no-color.jpg']);
  });

  it('按 RAW 状态过滤 - 仅 RAW', () => {
    const images = [mockImageFile({ path: '/photo.cr2' }), mockImageFile({ path: '/photo.jpg' })];
    const libraryState = createLibraryState({
      imageList: images,
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.RawOnly },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/photo.cr2']);
  });

  it('按 RAW 状态过滤 - 仅非 RAW', () => {
    const images = [mockImageFile({ path: '/photo.cr2' }), mockImageFile({ path: '/photo.jpg' })];
    const libraryState = createLibraryState({
      imageList: images,
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.NonRawOnly },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/photo.jpg']);
  });

  it('搜索文本 - 按文件名搜索', () => {
    const images = [mockImageFile({ path: '/sunset.jpg' }), mockImageFile({ path: '/portrait.jpg' })];
    const libraryState = createLibraryState({
      imageList: images,
      searchCriteria: { tags: [], text: 'sunset', mode: 'OR' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/sunset.jpg']);
  });

  it('搜索标签 - 普通标签', () => {
    const images = [
      mockImageFile({ path: '/img1.jpg', tags: ['landscape'] }),
      mockImageFile({ path: '/img2.jpg', tags: ['portrait'] }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      searchCriteria: { tags: ['landscape'], text: '', mode: 'OR' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/img1.jpg']);
  });

  it('搜索标签 - AND 模式', () => {
    const images = [
      mockImageFile({ path: '/img1.jpg', tags: ['landscape', 'mountain'] }),
      mockImageFile({ path: '/img2.jpg', tags: ['landscape'] }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      searchCriteria: { tags: ['landscape', 'mountain'], text: '', mode: 'AND' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/img1.jpg']);
  });

  it('搜索标签 - OR 模式', () => {
    const images = [
      mockImageFile({ path: '/img1.jpg', tags: ['landscape'] }),
      mockImageFile({ path: '/img2.jpg', tags: ['portrait'] }),
      mockImageFile({ path: '/img3.jpg', tags: ['other'] }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      searchCriteria: { tags: ['landscape', 'portrait'], text: '', mode: 'OR' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/img1.jpg', '/img2.jpg']);
  });

  it('高级查询 - ISO 大于', () => {
    const images = [
      mockImageFile({ path: '/high.jpg', exif: { PhotographicSensitivity: '1600' } }),
      mockImageFile({ path: '/low.jpg', exif: { PhotographicSensitivity: '100' } }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      searchCriteria: { tags: ['iso>400'], text: '', mode: 'OR' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/high.jpg']);
  });

  it('高级查询 - 光圈等于', () => {
    const images = [
      mockImageFile({ path: '/f28.jpg', exif: { FNumber: 'f/2.8' } }),
      mockImageFile({ path: '/f56.jpg', exif: { FNumber: 'f/5.6' } }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      searchCriteria: { tags: ['aperture:2.8'], text: '', mode: 'OR' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/f28.jpg']);
  });

  it('高级查询 - 相机型号', () => {
    const images = [
      mockImageFile({
        path: '/canon.jpg',
        exif: { Make: 'Canon', Model: 'EOS R5' },
      }),
      mockImageFile({
        path: '/sony.jpg',
        exif: { Make: 'Sony', Model: 'A7 IV' },
      }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      searchCriteria: { tags: ['camera:canon'], text: '', mode: 'OR' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/canon.jpg']);
  });

  it('高级查询 - 评分', () => {
    const images = [mockImageFile({ path: '/high.jpg' }), mockImageFile({ path: '/low.jpg' })];
    const libraryState = createLibraryState({
      imageList: images,
      imageRatings: { '/high.jpg': 5, '/low.jpg': 2 },
      searchCriteria: { tags: ['rating>=4'], text: '', mode: 'OR' },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    expect(result.map((img) => img.path)).toEqual(['/high.jpg']);
  });

  it('RawOverNonRaw 过滤模式', () => {
    const images = [
      mockImageFile({ path: '/folder/photo.cr2' }),
      mockImageFile({ path: '/folder/photo.jpg' }),
      mockImageFile({ path: '/folder/other.jpg' }),
    ];
    const libraryState = createLibraryState({
      imageList: images,
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.RawOverNonRaw },
    });
    const settingsState = createSettingsState();

    const result = computeSortedLibrary(libraryState, settingsState);

    const paths = result.map((img) => img.path);
    expect(paths).toContain('/folder/photo.cr2');
    expect(paths).toContain('/folder/other.jpg');
    expect(paths).not.toContain('/folder/photo.jpg');
  });
});
