import { create } from 'zustand';
import {
  FilterCriteria,
  ImageFile,
  RawStatus,
  SortCriteria,
  SortDirection,
  AlbumItem,
} from '../components/ui/AppProperties';
import { Adjustments, INITIAL_ADJUSTMENTS } from '../utils/adjustments';
import { ColumnWidths } from '../components/panel/MainLibrary';

export interface SmartAlbumCondition {
  field: 'rating' | 'colorLabel' | 'tag' | 'dateModified' | 'dateTaken' | 'cameraModel' | 'isEdited';
  operator: 'equals' | 'greaterThan' | 'lessThan' | 'contains' | 'between';
  value: any;
}

export interface SmartAlbum {
  id: string;
  name: string;
  conditions: SmartAlbumCondition[];
  isSmart: true;
}

export interface SearchCriteria {
  tags: string[];
  text: string;
  mode: 'AND' | 'OR';
}

interface AdvancedFilterState {
  dateFrom: string | null;
  dateTo: string | null;
  cameraModel: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
}

interface LibraryState {
  // Paths & Trees
  rootPaths: string[];
  currentFolderPath: string | null;
  expandedFolders: Set<string>;
  folderTrees: any[];
  pinnedFolderTrees: any[];

  // Albums
  albumTree: AlbumItem[];
  activeAlbumId: string | null;
  expandedAlbumGroups: Set<string>;

  // Smart Albums & Favorites
  smartAlbums: SmartAlbum[];
  favorites: string[];

  // Images & Selection
  imageList: Array<ImageFile>;
  imageRatings: Record<string, number>;
  multiSelectedPaths: Array<string>;
  selectionAnchorPath: string | null;
  libraryActivePath: string | null;
  libraryActiveAdjustments: Adjustments;

  // Sorting & Filtering
  sortCriteria: SortCriteria;
  filterCriteria: FilterCriteria;
  searchCriteria: SearchCriteria;
  advancedFilter: AdvancedFilterState;

  // UI State specific to the Library View
  isTreeLoading: boolean;
  isViewLoading: boolean;
  libraryScrollTop: number;
  listColumnWidths: ColumnWidths;

  // Actions
  setLibrary: (updater: Partial<LibraryState> | ((state: LibraryState) => Partial<LibraryState>)) => void;
  clearSelection: () => void;
  setFilterCriteria: (criteria: Partial<FilterCriteria> | ((prev: FilterCriteria) => FilterCriteria)) => void;
  setSearchCriteria: (criteria: Partial<SearchCriteria> | ((prev: SearchCriteria) => SearchCriteria)) => void;
  setSortCriteria: (criteria: Partial<SortCriteria> | ((prev: SortCriteria) => SortCriteria)) => void;
  setAdvancedFilter: (filter: Partial<AdvancedFilterState> | ((prev: AdvancedFilterState) => AdvancedFilterState)) => void;
  clearAdvancedFilter: () => void;
  addSmartAlbum: (album: SmartAlbum) => void;
  removeSmartAlbum: (id: string) => void;
  toggleFavorite: (path: string) => void;
  isFavorite: (path: string) => boolean;
  getSmartAlbumImages: (images: ImageFile[], album: SmartAlbum) => ImageFile[];
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
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
  libraryActiveAdjustments: INITIAL_ADJUSTMENTS,

  sortCriteria: { key: 'name', order: SortDirection.Ascending },
  filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
  searchCriteria: { tags: [], text: '', mode: 'OR' },
  advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },

  isTreeLoading: false,
  isViewLoading: false,
  libraryScrollTop: 0,
  listColumnWidths: {
    thumbnail: 4,
    name: 20,
    date: 15,
    rating: 8,
    color: 8,
    shutter: 10,
    aperture: 10,
    iso: 10,
    focal: 15,
  },

  setLibrary: (updater) => set((state) => (typeof updater === 'function' ? updater(state) : updater)),

  clearSelection: () => set({ multiSelectedPaths: [], libraryActivePath: null }),

  setFilterCriteria: (criteria) =>
    set((state) => ({
      filterCriteria:
        typeof criteria === 'function' ? criteria(state.filterCriteria) : { ...state.filterCriteria, ...criteria },
    })),

  setSearchCriteria: (criteria) =>
    set((state) => ({
      searchCriteria:
        typeof criteria === 'function' ? criteria(state.searchCriteria) : { ...state.searchCriteria, ...criteria },
    })),

  setSortCriteria: (criteria) =>
    set((state) => ({
      sortCriteria:
        typeof criteria === 'function' ? criteria(state.sortCriteria) : { ...state.sortCriteria, ...criteria },
    })),

  setAdvancedFilter: (filter) =>
    set((state) => ({
      advancedFilter:
        typeof filter === 'function' ? filter(state.advancedFilter) : { ...state.advancedFilter, ...filter },
    })),

  clearAdvancedFilter: () =>
    set({
      advancedFilter: { dateFrom: null, dateTo: null, cameraModel: null, focalLengthMin: null, focalLengthMax: null },
    }),

  addSmartAlbum: (album) =>
    set((state) => ({ smartAlbums: [...state.smartAlbums, album] })),

  removeSmartAlbum: (id) =>
    set((state) => ({ smartAlbums: state.smartAlbums.filter((a) => a.id !== id) })),

  toggleFavorite: (path) =>
    set((state) => ({
      favorites: state.favorites.includes(path)
        ? state.favorites.filter((p) => p !== path)
        : [...state.favorites, path],
    })),

  isFavorite: (path: string): boolean => {
    return get().favorites.includes(path);
  },

  getSmartAlbumImages: (images, album) => {
    return images.filter((img) =>
      album.conditions.every((condition) => {
        const fieldValue = (() => {
          switch (condition.field) {
            case 'rating':
              return img.rating;
            case 'colorLabel': {
              const colorTag = img.tags?.find((t: string) => t.startsWith('color:'))?.substring(6);
              return colorTag || null;
            }
            case 'tag':
              return img.tags?.filter((t: string) => !t.startsWith('color:')) || [];
            case 'dateModified':
              return img.modified;
            case 'dateTaken':
              return img.exif?.DateTimeOriginal || null;
            case 'cameraModel':
              return img.exif?.Model || null;
            case 'isEdited':
              return img.is_edited;
            default:
              return null;
          }
        })();

        switch (condition.operator) {
          case 'equals':
            return fieldValue === condition.value;
          case 'greaterThan':
            return typeof fieldValue === 'number' && fieldValue > condition.value;
          case 'lessThan':
            return typeof fieldValue === 'number' && fieldValue < condition.value;
          case 'contains':
            if (Array.isArray(fieldValue)) return fieldValue.includes(condition.value);
            if (typeof fieldValue === 'string') return fieldValue.toLowerCase().includes(String(condition.value).toLowerCase());
            return false;
          case 'between':
            if (typeof fieldValue === 'number') {
              const [min, max] = condition.value;
              return fieldValue >= min && fieldValue <= max;
            }
            if (typeof fieldValue === 'string' && condition.value && Array.isArray(condition.value)) {
              const [startDate, endDate] = condition.value;
              if (startDate && endDate) {
                const fieldDate = new Date(fieldValue).getTime();
                const minTime = new Date(startDate).getTime();
                const maxTime = new Date(endDate).getTime();
                if (!isNaN(fieldDate) && !isNaN(minTime) && !isNaN(maxTime)) {
                  return fieldDate >= minTime && fieldDate <= maxTime;
                }
              }
            }
            return false;
          default:
            return true;
        }
      }),
    );
  },
}));
