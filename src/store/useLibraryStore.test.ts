import { describe,import { describe, it, expect, beforeEach } from 'vitestimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum }import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { Rawimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStoreimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders:import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.fimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    itimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePathimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/aimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePathimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });
  });

  describe('import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });
  });

  describe('setFilterCriteria', () => {
    it('import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });
  });

  describe('setFilterCriteria', () => {
    it('merges partial filter criteria object', () => {
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });
  });

  describe('setFilterCriteria', () => {
    it('merges partial filter criteria object', () => {
      useLibraryStore.getState().setFilterCriteria({import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });
  });

  describe('setFilterCriteria', () => {
    it('merges partial filter criteria object', () => {
      useLibraryStore.getState().setFilterCriteria({ rating: 3 });
      expect(useLibraryStoreimport { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });
  });

  describe('setFilterCriteria', () => {
    it('merges partial filter criteria object', () => {
      useLibraryStore.getState().setFilterCriteria({ rating: 3 });
      expect(useLibraryStore.getState().filterCriteria.rating).toBe(3);
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore, SmartAlbum } from '../store/useLibraryStore';
import { RawStatus, SortDirection, ImageFile } from '../components/ui/AppProperties';

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      rootPaths: [],
      currentFolderPath: null,
      expandedFolders: new Set<string>(),
      folderTrees: [],
      pinnedFolderTrees: [],
      albumTree: [],
      activeAlbumId: null,
      expandedAlbumGroups: new Set<string>(),
      smartAlbums: [],
      favorites: [],
      imageList: [],
      imageRatings: {},
      multiSelectedPaths: [],
      selectionAnchorPath: null,
      libraryActivePath: null,
      sortCriteria: { key: 'name', order: SortDirection.Ascending },
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
      searchCriteria: { tags: [], text: '', mode: 'OR' },
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
      isTreeLoading: false,
      isViewLoading: false,
      libraryScrollTop: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.rootPaths).toEqual([]);
    expect(state.currentFolderPath).toBeNull();
    expect(state.imageList).toEqual([]);
    expect(state.imageRatings).toEqual({});
    expect(state.multiSelectedPaths).toEqual([]);
    expect(state.libraryActivePath).toBeNull();
    expect(state.sortCriteria).toEqual({ key: 'name', order: SortDirection.Ascending });
    expect(state.filterCriteria).toEqual({ colors: [], rating: 0, rawStatus: RawStatus.All });
    expect(state.searchCriteria).toEqual({ tags: [], text: '', mode: 'OR' });
    expect(state.smartAlbums).toEqual([]);
    expect(state.favorites).toEqual([]);
  });

  describe('setLibrary', () => {
    it('sets partial state with object updater', () => {
      useLibraryStore.getState().setLibrary({ rootPaths: ['/home'] });
      expect(useLibraryStore.getState().rootPaths).toEqual(['/home']);
      expect(useLibraryStore.getState().currentFolderPath).toBeNull();
    });

    it('sets partial state with function updater', () => {
      useLibraryStore.getState().setLibrary((state) => ({ rootPaths: [...state.rootPaths, '/new'] }));
      expect(useLibraryStore.getState().rootPaths).toEqual(['/new']);
    });
  });

  describe('clearSelection', () => {
    it('clears multiSelectedPaths and libraryActivePath', () => {
      useLibraryStore.getState().setLibrary({
        multiSelectedPaths: ['/a.jpg', '/b.jpg'],
        libraryActivePath: '/a.jpg',
      });
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().multiSelectedPaths).toEqual([]);
      expect(useLibraryStore.getState().libraryActivePath).toBeNull();
    });
  });

  describe('setFilterCriteria', () => {
    it('merges partial filter criteria object', () => {
      useLibraryStore.getState().setFilterCriteria({ rating: 3 });
      expect(useLibraryStore.getState().filterCriteria.rating).toBe(3);
      expect(useLibraryStore.getState().filterCriteria.raw