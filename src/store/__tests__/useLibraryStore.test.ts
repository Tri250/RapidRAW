import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore } from '../useLibraryStore';
import { INITIAL_ADJUSTMENTS } from '../../utils/adjustments';
import { SortDirection, RawStatus } from '../../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState());
  });

  describe('初始状态验证', () => {
    it('rootPaths 为空数组', () => {
      const state = useLibraryStore.getState();
      expect(state.rootPaths).toEqual([]);
    });

    it('currentFolderPath 为 null', () => {
      const state = useLibraryStore.getState();
      expect(state.currentFolderPath).toBeNull();
    });

    it('expandedFolders 为空 Set', () => {
      const state = useLibraryStore.getState();
      expect(state.expandedFolders).toBeInstanceOf(Set);
      expect(state.expandedFolders.size).toBe(0);
    });

    it('folderTrees 为空数组', () => {
      const state = useLibraryStore.getState();
      expect(state.folderTrees).toEqual([]);
    });

    it('pinnedFolderTrees 为空数组', () => {
      const state = useLibraryStore.getState();
      expect(state.pinnedFolderTrees).toEqual([]);
    });

    it('albumTree 为空数组', () => {
      const state = useLibraryStore.getState();
      expect(state.albumTree).toEqual([]);
    });

    it('activeAlbumId 为 null', () => {
      const state = useLibraryStore.getState();
      expect(state.activeAlbumId).toBeNull();
    });

    it('expandedAlbumGroups 为空 Set', () => {
      const state = useLibraryStore.getState();
      expect(state.expandedAlbumGroups).toBeInstanceOf(Set);
      expect(state.expandedAlbumGroups.size).toBe(0);
    });

    it('imageList 为空数组', () => {
      const state = useLibraryStore.getState();
      expect(state.imageList).toEqual([]);
    });

    it('imageRatings 为空对象', () => {
      const state = useLibraryStore.getState();
      expect(state.imageRatings).toEqual({});
    });

    it('multiSelectedPaths 为空数组', () => {
      const state = useLibraryStore.getState();
      expect(state.multiSelectedPaths).toEqual([]);
    });

    it('selectionAnchorPath 为 null', () => {
      const state = useLibraryStore.getState();
      expect(state.selectionAnchorPath).toBeNull();
    });

    it('libraryActivePath 为 null', () => {
      const state = useLibraryStore.getState();
      expect(state.libraryActivePath).toBeNull();
    });

    it('libraryActiveAdjustments 为 INITIAL_ADJUSTMENTS', () => {
      const state = useLibraryStore.getState();
      expect(state.libraryActiveAdjustments).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('sortCriteria 默认值正确（key: name, order: Ascending）', () => {
      const state = useLibraryStore.getState();
      expect(state.sortCriteria).toEqual({
        key: 'name',
        order: SortDirection.Ascending,
      });
    });

    it('filterCriteria 默认值正确', () => {
      const state = useLibraryStore.getState();
      expect(state.filterCriteria).toEqual({
        colors: [],
        rating: 0,
        rawStatus: RawStatus.All,
      });
    });

    it('searchCriteria 默认值正确（tags: [], text: "", mode: "OR"）', () => {
      const state = useLibraryStore.getState();
      expect(state.searchCriteria).toEqual({
        tags: [],
        text: '',
        mode: 'OR',
      });
    });

    it('isTreeLoading 为 false', () => {
      const state = useLibraryStore.getState();
      expect(state.isTreeLoading).toBe(false);
    });

    it('isViewLoading 为 false', () => {
      const state = useLibraryStore.getState();
      expect(state.isViewLoading).toBe(false);
    });

    it('libraryScrollTop 为 0', () => {
      const state = useLibraryStore.getState();
      expect(state.libraryScrollTop).toBe(0);
    });

    it('listColumnWidths 有默认值', () => {
      const state = useLibraryStore.getState();
      expect(state.listColumnWidths).toEqual({
        thumbnail: 4,
        name: 20,
        date: 15,
        rating: 8,
        color: 8,
        shutter: 10,
        aperture: 10,
        iso: 10,
        focal: 15,
      });
    });
  });

  describe('setLibrary action', () => {
    it('可以用对象设置状态', () => {
      const { setLibrary } = useLibraryStore.getState();
      setLibrary({ currentFolderPath: '/test/path' });
      const state = useLibraryStore.getState();
      expect(state.currentFolderPath).toBe('/test/path');
    });

    it('可以用函数设置状态', () => {
      const { setLibrary } = useLibraryStore.getState();
      setLibrary((state) => ({ libraryScrollTop: state.libraryScrollTop + 100 }));
      const state = useLibraryStore.getState();
      expect(state.libraryScrollTop).toBe(100);
    });

    it('用对象设置多个状态字段', () => {
      const { setLibrary } = useLibraryStore.getState();
      setLibrary({
        rootPaths: ['/path1', '/path2'],
        isTreeLoading: true,
        libraryScrollTop: 50,
      });
      const state = useLibraryStore.getState();
      expect(state.rootPaths).toEqual(['/path1', '/path2']);
      expect(state.isTreeLoading).toBe(true);
      expect(state.libraryScrollTop).toBe(50);
    });

    it('用函数设置状态时能访问当前状态', () => {
      const { setLibrary } = useLibraryStore.getState();
      setLibrary({ multiSelectedPaths: ['/a', '/b'] });
      setLibrary((state) => ({
        multiSelectedPaths: [...state.multiSelectedPaths, '/c'],
      }));
      const state = useLibraryStore.getState();
      expect(state.multiSelectedPaths).toEqual(['/a', '/b', '/c']);
    });

    it('用空对象调用不会改变状态', () => {
      const { setLibrary } = useLibraryStore.getState();
      const beforeState = useLibraryStore.getState();
      setLibrary({});
      const afterState = useLibraryStore.getState();
      expect(afterState).toEqual(beforeState);
    });

    it('用函数返回空对象不会改变状态', () => {
      const { setLibrary } = useLibraryStore.getState();
      const beforeState = useLibraryStore.getState();
      setLibrary(() => ({}));
      const afterState = useLibraryStore.getState();
      expect(afterState).toEqual(beforeState);
    });
  });

  describe('clearSelection action', () => {
    it('清空 multiSelectedPaths', () => {
      const { setLibrary, clearSelection } = useLibraryStore.getState();
      setLibrary({ multiSelectedPaths: ['/path1', '/path2'] });
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual(['/path1', '/path2']);
      clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
    });

    it('清空 libraryActivePath', () => {
      const { setLibrary, clearSelection } = useLibraryStore.getState();
      setLibrary({ libraryActivePath: '/active/path' });
      expect(useLibraryStore.getState().libraryActivePath).toBe('/active/path');
      clearSelection();
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });

    it('同时清空 multiSelectedPaths 和 libraryActivePath', () => {
      const { setLibrary, clearSelection } = useLibraryStore.getState();
      setLibrary({
        multiSelectedPaths: ['/a', '/b'],
        libraryActivePath: '/a',
      });
      clearSelection();
      const state = useLibraryStore.getState();
      expect(state.multiSelectedPaths).toEqual([]);
      expect(state.libraryActivePath).toBeNull();
    });

    it('对已清空的状态再次调用不会出错', () => {
      const { clearSelection } = useLibraryStore.getState();
      expect(() => clearSelection()).not.toThrow();
      const state = useLibraryStore.getState();
      expect(state.multiSelectedPaths).toEqual([]);
      expect(state.libraryActivePath).toBeNull();
    });
  });

  describe('setFilterCriteria action', () => {
    it('可以用对象部分更新 filterCriteria', () => {
      const { setFilterCriteria } = useLibraryStore.getState();
      setFilterCriteria({ rating: 4 });
      const state = useLibraryStore.getState();
      expect(state.filterCriteria.rating).toBe(4);
      expect(state.filterCriteria.colors).toEqual([]);
      expect(state.filterCriteria.rawStatus).toBe(RawStatus.All);
    });

    it('可以用函数更新 filterCriteria', () => {
      const { setFilterCriteria } = useLibraryStore.getState();
      setFilterCriteria((prev) => ({ rating: prev.rating + 3 }));
      const state = useLibraryStore.getState();
      expect(state.filterCriteria.rating).toBe(3);
    });

    it('用对象更新多个字段', () => {
      const { setFilterCriteria } = useLibraryStore.getState();
      setFilterCriteria({
        colors: ['red', 'blue'],
        rawStatus: RawStatus.RawOnly,
      });
      const state = useLibraryStore.getState();
      expect(state.filterCriteria.colors).toEqual(['red', 'blue']);
      expect(state.filterCriteria.rawStatus).toBe(RawStatus.RawOnly);
      expect(state.filterCriteria.rating).toBe(0);
    });

    it('用函数更新可以访问之前的状态', () => {
      const { setFilterCriteria } = useLibraryStore.getState();
      setFilterCriteria({ colors: ['red'] });
      setFilterCriteria((prev) => ({
        colors: [...prev.colors, 'green'],
      }));
      const state = useLibraryStore.getState();
      expect(state.filterCriteria.colors).toEqual(['red', 'green']);
    });

    it('用空对象调用不会改变 filterCriteria', () => {
      const { setFilterCriteria } = useLibraryStore.getState();
      const before = useLibraryStore.getState().filterCriteria;
      setFilterCriteria({});
      const after = useLibraryStore.getState().filterCriteria;
      expect(after).toEqual(before);
    });

    it('用函数更新会直接替换整个 filterCriteria', () => {
      const { setFilterCriteria } = useLibraryStore.getState();
      setFilterCriteria(() => ({ rating: 2 }));
      const after = useLibraryStore.getState().filterCriteria;
      expect(after).toEqual({ rating: 2 });
    });

    it('不会影响 store 中的其他状态', () => {
      const { setFilterCriteria } = useLibraryStore.getState();
      const beforeRootPaths = useLibraryStore.getState().rootPaths;
      setFilterCriteria({ rating: 5 });
      expect(useLibraryStore.getState().rootPaths).toEqual(beforeRootPaths);
    });
  });

  describe('setSearchCriteria action', () => {
    it('可以用对象部分更新 searchCriteria', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      setSearchCriteria({ text: 'sunset' });
      const state = useLibraryStore.getState();
      expect(state.searchCriteria.text).toBe('sunset');
      expect(state.searchCriteria.tags).toEqual([]);
      expect(state.searchCriteria.mode).toBe('OR');
    });

    it('可以用函数更新 searchCriteria', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      setSearchCriteria((prev) => ({ text: prev.text + ' hello' }));
      const state = useLibraryStore.getState();
      expect(state.searchCriteria.text).toBe(' hello');
    });

    it('用对象更新多个字段', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      setSearchCriteria({
        tags: ['nature', 'landscape'],
        mode: 'AND',
      });
      const state = useLibraryStore.getState();
      expect(state.searchCriteria.tags).toEqual(['nature', 'landscape']);
      expect(state.searchCriteria.mode).toBe('AND');
      expect(state.searchCriteria.text).toBe('');
    });

    it('用函数更新可以访问之前的状态', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      setSearchCriteria({ tags: ['tag1'] });
      setSearchCriteria((prev) => ({
        tags: [...prev.tags, 'tag2'],
      }));
      const state = useLibraryStore.getState();
      expect(state.searchCriteria.tags).toEqual(['tag1', 'tag2']);
    });

    it('用空对象调用不会改变 searchCriteria', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      const before = useLibraryStore.getState().searchCriteria;
      setSearchCriteria({});
      const after = useLibraryStore.getState().searchCriteria;
      expect(after).toEqual(before);
    });

    it('用函数更新会直接替换整个 searchCriteria', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      setSearchCriteria(() => ({ text: 'hello' }));
      const after = useLibraryStore.getState().searchCriteria;
      expect(after).toEqual({ text: 'hello' });
    });

    it('不会影响 store 中的其他状态', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      const beforeImageList = useLibraryStore.getState().imageList;
      setSearchCriteria({ text: 'test' });
      expect(useLibraryStore.getState().imageList).toEqual(beforeImageList);
    });

    it('可以将 mode 在 AND 和 OR 之间切换', () => {
      const { setSearchCriteria } = useLibraryStore.getState();
      expect(useLibraryStore.getState().searchCriteria.mode).toBe('OR');
      setSearchCriteria({ mode: 'AND' });
      expect(useLibraryStore.getState().searchCriteria.mode).toBe('AND');
      setSearchCriteria({ mode: 'OR' });
      expect(useLibraryStore.getState().searchCriteria.mode).toBe('OR');
    });
  });

  describe('setSortCriteria action', () => {
    it('可以用对象部分更新 sortCriteria', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      setSortCriteria({ key: 'date' });
      const state = useLibraryStore.getState();
      expect(state.sortCriteria.key).toBe('date');
      expect(state.sortCriteria.order).toBe(SortDirection.Ascending);
    });

    it('可以用函数更新 sortCriteria', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      setSortCriteria((prev) => ({
        order: prev.order === SortDirection.Ascending ? SortDirection.Descending : SortDirection.Ascending,
      }));
      const state = useLibraryStore.getState();
      expect(state.sortCriteria.order).toBe(SortDirection.Descending);
    });

    it('用对象更新多个字段', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      setSortCriteria({
        key: 'rating',
        order: SortDirection.Descending,
      });
      const state = useLibraryStore.getState();
      expect(state.sortCriteria.key).toBe('rating');
      expect(state.sortCriteria.order).toBe(SortDirection.Descending);
    });

    it('用函数更新可以访问之前的状态', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      setSortCriteria({ key: 'size' });
      setSortCriteria((prev) => ({
        key: prev.key + '_reverse',
      }));
      const state = useLibraryStore.getState();
      expect(state.sortCriteria.key).toBe('size_reverse');
    });

    it('用空对象调用不会改变 sortCriteria', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      const before = useLibraryStore.getState().sortCriteria;
      setSortCriteria({});
      const after = useLibraryStore.getState().sortCriteria;
      expect(after).toEqual(before);
    });

    it('用函数更新会直接替换整个 sortCriteria', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      setSortCriteria(() => ({ key: 'size' }));
      const after = useLibraryStore.getState().sortCriteria;
      expect(after).toEqual({ key: 'size' });
    });

    it('不会影响 store 中的其他状态', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      const beforeFolderPath = useLibraryStore.getState().currentFolderPath;
      setSortCriteria({ key: 'name' });
      expect(useLibraryStore.getState().currentFolderPath).toBe(beforeFolderPath);
    });

    it('可以切换排序方向', () => {
      const { setSortCriteria } = useLibraryStore.getState();
      expect(useLibraryStore.getState().sortCriteria.order).toBe(SortDirection.Ascending);
      setSortCriteria({ order: SortDirection.Descending });
      expect(useLibraryStore.getState().sortCriteria.order).toBe(SortDirection.Descending);
    });
  });
});
