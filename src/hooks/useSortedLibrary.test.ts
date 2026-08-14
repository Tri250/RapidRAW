import { describe, it, expect, vi } from 'vitest';
import {
  ADVANCED_QUERY_REGEX,
  parseShutter,
  parseAperture,
  parseFocalLength,
  isValidShutterValue,
  computeGroupedLibrary,
} from './useSortedLibrary';
import { RawStatus, EditedStatus, SortDirection } from '../components/ui/AppProperties';
import type { ImageFile } from '../components/ui/AppProperties';

vi.mock('../store/useLibraryStore', () => ({ useLibraryStore: vi.fn() }));
vi.mock('../store/useSettingsStore', () => ({ useSettingsStore: vi.fn() }));

const makeFile = (overrides: Partial<ImageFile> & { path: string }): ImageFile => ({
  is_edited: false,
  modified: 0,
  rating: 0,
  tags: [],
  exif: null,
  is_virtual_copy: false,
  is_cloud_placeholder: false,
  ...overrides,
});

const emptyLibrary = {
  imageList: [],
  imageRatings: {},
  filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
  searchCriteria: { tags: [], text: '', mode: 'AND' },
  sortCriteria: { key: 'name', order: SortDirection.Ascending },
};

const emptySettings = {
  appSettings: {},
  supportedTypes: { raw: ['cr2', 'nef', 'arw'], nonRaw: ['jpg', 'jpeg', 'png'] },
};

describe('parseShutter', () => {
  it('returns 0 for missing or invalid values', () => {
    expect(parseShutter(undefined)).toBe(0);
    expect(parseShutter('')).toBe(0);
    expect(parseShutter('abc')).toBe(0);
  });

  it('parses fraction shutter speeds', () => {
    expect(parseShutter('1/125')).toBeCloseTo(1 / 125);
    expect(parseShutter('1/2000')).toBeCloseTo(1 / 2000);
    expect(parseShutter('1/500s')).toBeCloseTo(1 / 500);
  });

  it('parses decimal shutter speeds', () => {
    expect(parseShutter('0.5')).toBeCloseTo(0.5);
    expect(parseShutter('2')).toBe(2);
    expect(parseShutter('2s')).toBe(2);
  });

  it('handles zero denominator gracefully', () => {
    expect(parseShutter('1/0')).toBe(0);
  });
});

describe('parseAperture', () => {
  it('returns 0 for missing or invalid values', () => {
    expect(parseAperture(undefined)).toBe(0);
    expect(parseAperture('')).toBe(0);
    expect(parseAperture('abc')).toBe(0);
  });

  it('parses f-number formats', () => {
    expect(parseAperture('f/2.8')).toBeCloseTo(2.8);
    expect(parseAperture('F4')).toBe(4);
    expect(parseAperture('1.8')).toBeCloseTo(1.8);
  });
});

describe('parseFocalLength', () => {
  it('returns 0 for missing or invalid values', () => {
    expect(parseFocalLength(undefined)).toBe(0);
    expect(parseFocalLength('')).toBe(0);
    expect(parseFocalLength('n/a')).toBe(0);
  });

  it('parses single focal lengths', () => {
    expect(parseFocalLength('50mm')).toBe(50);
    expect(parseFocalLength('50.0 mm')).toBe(50);
  });

  it('parses the low end of zoom ranges', () => {
    expect(parseFocalLength('24-70mm')).toBe(24);
  });
});

describe('ADVANCED_QUERY_REGEX', () => {
  it('matches numeric field queries with optional operator', () => {
    expect(ADVANCED_QUERY_REGEX.exec('iso 800')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('iso:800')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('iso>=1600')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('aperture>2.8')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('shutter 1/250')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('focal 50')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('rating>=4')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('mm<100')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('s:0.5')).not.toBeNull();
  });

  it('matches documented shorthand formats f:/s: and colon-before-operator', () => {
    expect(ADVANCED_QUERY_REGEX.exec('f:<=2.8')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('s:1/200')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('iso:>800')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('f 2.8')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('s 1/125')).not.toBeNull();
  });

  it('does NOT treat plain tags starting with f/s as advanced queries', () => {
    // Regression: "sunset"/"sky"/"flower" were previously captured as the
    // single-letter fields s/f and evaluated as broken queries matching all.
    expect(ADVANCED_QUERY_REGEX.exec('sunset')).toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('sky')).toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('flower')).toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('friends')).toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('fast')).toBeNull();
  });

  it('matches string field queries', () => {
    expect(ADVANCED_QUERY_REGEX.exec('camera canon')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('make:sony')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('model EOS')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('lens 50mm')).not.toBeNull();
    expect(ADVANCED_QUERY_REGEX.exec('color red')).not.toBeNull();
  });

  it('captures field, operator and value groups', () => {
    const match = ADVANCED_QUERY_REGEX.exec('iso>=1600')!;
    expect(match[1]).toBe('iso');
    expect(match[2]).toBe('>=');
    expect(match[3]).toBe('1600');
  });
});

describe('isValidShutterValue', () => {
  it('accepts fractions, decimals and plain numbers', () => {
    expect(isValidShutterValue('1/200')).toBe(true);
    expect(isValidShutterValue('1/200s')).toBe(true);
    expect(isValidShutterValue('0.5')).toBe(true);
    expect(isValidShutterValue('2')).toBe(true);
    expect(isValidShutterValue('2s')).toBe(true);
  });

  it('rejects malformed or missing values', () => {
    expect(isValidShutterValue(undefined)).toBe(false);
    expect(isValidShutterValue('')).toBe(false);
    expect(isValidShutterValue('abc')).toBe(false);
    expect(isValidShutterValue('1/0')).toBe(false);
    expect(isValidShutterValue('s')).toBe(false);
  });
});

describe('computeGroupedLibrary', () => {
  it('returns empty display list for empty library', () => {
    const result = computeGroupedLibrary(emptyLibrary, emptySettings);
    expect(result.displayList).toEqual([]);
    expect(result.badges).toBeNull();
  });

  it('sorts by name ascending by default', () => {
    const library = {
      ...emptyLibrary,
      imageList: [makeFile({ path: '/a/B.jpg' }), makeFile({ path: '/a/A.jpg' }), makeFile({ path: '/a/C.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg', '/a/B.jpg', '/a/C.jpg']);
  });

  it('sorts by name descending', () => {
    const library = {
      ...emptyLibrary,
      sortCriteria: { key: 'name', order: SortDirection.Descending },
      imageList: [makeFile({ path: '/a/B.jpg' }), makeFile({ path: '/a/A.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/B.jpg', '/a/A.jpg']);
  });

  it('filters by minimum rating', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: [], rating: 3, rawStatus: RawStatus.All },
      imageRatings: { '/a/A.jpg': 5, '/a/B.jpg': 2, '/a/C.jpg': 3 },
      imageList: [makeFile({ path: '/a/A.jpg' }), makeFile({ path: '/a/B.jpg' }), makeFile({ path: '/a/C.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path).sort()).toEqual(['/a/A.jpg', '/a/C.jpg']);
  });

  it('filters by exact 5-star rating', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: [], rating: 5, rawStatus: RawStatus.All },
      imageRatings: { '/a/A.jpg': 5, '/a/B.jpg': 4 },
      imageList: [makeFile({ path: '/a/A.jpg' }), makeFile({ path: '/a/B.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('filters unrated images only', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: [], rating: -1, rawStatus: RawStatus.All },
      imageRatings: { '/a/A.jpg': 0, '/a/B.jpg': 1 },
      imageList: [makeFile({ path: '/a/A.jpg' }), makeFile({ path: '/a/B.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('filters edited status', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All, editedStatus: EditedStatus.EditedOnly },
      imageList: [makeFile({ path: '/a/A.jpg', is_edited: true }), makeFile({ path: '/a/B.jpg', is_edited: false })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('filters raw only via extension', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.RawOnly },
      imageList: [makeFile({ path: '/a/A.CR2' }), makeFile({ path: '/a/B.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.CR2']);
  });

  it('filters colors using color: tags', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: ['red'], rating: 0, rawStatus: RawStatus.All },
      imageList: [
        makeFile({ path: '/a/A.jpg', tags: ['color:red'] }),
        makeFile({ path: '/a/B.jpg', tags: ['color:blue'] }),
        makeFile({ path: '/a/C.jpg', tags: [] }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('returns empty list when filter excludes all', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: ['nonexistent'], rating: 0, rawStatus: RawStatus.All },
      imageList: [makeFile({ path: '/a/A.jpg', tags: ['color:red'] })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList).toEqual([]);
  });

  it('matches advanced queries using > and < operators', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['iso>400'], text: '', mode: 'AND' },
      imageList: [
        makeFile({ path: '/a/A.jpg', exif: { PhotographicSensitivity: '800' } as any }),
        makeFile({ path: '/a/B.jpg', exif: { PhotographicSensitivity: '100' } as any }),
        makeFile({ path: '/a/C.jpg', exif: null }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('matches advanced queries using = operator on camera model', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['model:EOS R5'], text: '', mode: 'AND' },
      imageList: [
        makeFile({ path: '/a/A.jpg', exif: { Make: 'Canon', Model: 'EOS R5' } as any }),
        makeFile({ path: '/a/B.jpg', exif: { Make: 'Canon', Model: 'EOS R6' } as any }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('does not crash on unknown sort key, falls back to name', () => {
    const library = {
      ...emptyLibrary,
      sortCriteria: { key: 'unknown_field', order: SortDirection.Ascending },
      imageList: [makeFile({ path: '/a/C.jpg' }), makeFile({ path: '/a/A.jpg' }), makeFile({ path: '/a/B.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg', '/a/B.jpg', '/a/C.jpg']);
  });

  it('sorts by date_taken using modified time when dates equal', () => {
    const library = {
      ...emptyLibrary,
      sortCriteria: { key: 'date_taken', order: SortDirection.Ascending },
      imageList: [
        makeFile({ path: '/a/B.jpg', modified: 200, exif: { DateTimeOriginal: '2023:01:01 10:00:00' } as any }),
        makeFile({ path: '/a/A.jpg', modified: 100, exif: { DateTimeOriginal: '2023:01:01 10:00:00' } as any }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    // Since dates are equal, it should fall back to modified time
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg', '/a/B.jpg']);
  });

  it('matches plain text search against filename', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: [], text: 'beach', mode: 'AND' },
      imageList: [makeFile({ path: '/a/beach_sunset.jpg' }), makeFile({ path: '/a/mountain.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/beach_sunset.jpg']);
  });

  it('matches normal tags with AND mode', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['sunset', 'ocean'], text: '', mode: 'AND' },
      imageList: [
        makeFile({ path: '/a/A.jpg', tags: ['sunset', 'ocean'] }),
        makeFile({ path: '/a/B.jpg', tags: ['sunset'] }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('matches normal tags with OR mode', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['sunset', 'ocean'], text: '', mode: 'OR' },
      imageList: [makeFile({ path: '/a/A.jpg', tags: ['sunset'] }), makeFile({ path: '/a/B.jpg', tags: ['portrait'] })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('treats tags beginning with f/s as plain tags, not broken queries (regression)', () => {
    // "sunset" starts with "s" (shutter field). Before the word-boundary fix it
    // was parsed as a shutter query and matched every image (0 === 0).
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['sunset'], text: '', mode: 'AND' },
      imageList: [makeFile({ path: '/a/A.jpg', tags: ['sunset'] }), makeFile({ path: '/a/B.jpg', tags: ['portrait'] })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('rejects malformed numeric query values instead of matching everything', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['s:abc'], text: '', mode: 'AND' },
      imageList: [
        makeFile({ path: '/a/A.jpg', tags: [] }),
        makeFile({ path: '/a/B.jpg', exif: { ExposureTime: '1/100' } }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList).toEqual([]);
  });

  it('evaluates numeric advanced queries (iso > threshold)', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['iso>400'], text: '', mode: 'AND' },
      imageList: [
        makeFile({ path: '/a/A.jpg', exif: { PhotographicSensitivity: '800' } }),
        makeFile({ path: '/a/B.jpg', exif: { PhotographicSensitivity: '200' } }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('evaluates shutter advanced queries using fraction values', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['shutter>=1/250'], text: '', mode: 'AND' },
      imageList: [
        makeFile({ path: '/a/A.jpg', exif: { ExposureTime: '1/500' } }),
        makeFile({ path: '/a/B.jpg', exif: { ExposureTime: '1/100' } }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    // 1/500 = 0.002, 1/250 = 0.004, 1/100 = 0.01 — only B passes
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/B.jpg']);
  });

  it('evaluates camera advanced queries with substring match', () => {
    const library = {
      ...emptyLibrary,
      searchCriteria: { tags: ['camera canon'], text: '', mode: 'AND' },
      imageList: [
        makeFile({ path: '/a/A.jpg', exif: { Make: 'Canon', Model: 'EOS R5' } }),
        makeFile({ path: '/a/B.jpg', exif: { Make: 'Nikon', Model: 'Z6' } }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg']);
  });

  it('sorts by iso ascending', () => {
    const library = {
      ...emptyLibrary,
      sortCriteria: { key: 'iso', order: SortDirection.Ascending },
      imageList: [
        makeFile({ path: '/a/B.jpg', exif: { PhotographicSensitivity: '3200' } }),
        makeFile({ path: '/a/A.jpg', exif: { PhotographicSensitivity: '100' } }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/A.jpg', '/a/B.jpg']);
  });

  it('sorts by rating descending', () => {
    const library = {
      ...emptyLibrary,
      sortCriteria: { key: 'rating', order: SortDirection.Descending },
      imageRatings: { '/a/A.jpg': 2, '/a/B.jpg': 5 },
      imageList: [makeFile({ path: '/a/A.jpg' }), makeFile({ path: '/a/B.jpg' })],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/B.jpg', '/a/A.jpg']);
  });

  it('sorts by date_taken then modified', () => {
    const library = {
      ...emptyLibrary,
      sortCriteria: { key: 'date_taken', order: SortDirection.Ascending },
      imageList: [
        makeFile({ path: '/a/B.jpg', exif: { DateTimeOriginal: '2024:01:01 10:00:00' }, modified: 5 }),
        makeFile({ path: '/a/A.jpg', exif: { DateTimeOriginal: '2024:01:01 10:00:00' }, modified: 1 }),
        makeFile({ path: '/a/C.jpg', exif: { DateTimeOriginal: '2023:01:01 10:00:00' }, modified: 3 }),
      ],
    };
    const result = computeGroupedLibrary(library, emptySettings);
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/C.jpg', '/a/A.jpg', '/a/B.jpg']);
  });

  it('groups via raw preference when grouping is active', () => {
    const library = {
      ...emptyLibrary,
      filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.RawOnly },
      imageList: [makeFile({ path: '/a/PIC.CR2', group_id: 'g1' }), makeFile({ path: '/a/PIC.jpg', group_id: 'g1' })],
    };
    const settings = {
      ...emptySettings,
      appSettings: { grouping: 'raw', groupEditedFiles: true },
    };
    const result = computeGroupedLibrary(library, settings);
    // raw grouping keeps the CR2 and drops the sibling JPEG in the same group
    expect(result.displayList.map((i) => i.path)).toEqual(['/a/PIC.CR2']);
  });
});
