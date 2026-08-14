import { describe, it, expect } from 'vitest';
import {
  buildImageGroups,
  getFileExtension,
  getVariantLabel,
  findGroupVariants,
} from './imageGrouping';
import type { ImageFile } from '../components/ui/AppProperties';

function makeFile(path: string, overrides: Partial<ImageFile> = {}): ImageFile {
  return {
    path,
    is_edited: false,
    modified: 0,
    rating: 0,
    tags: null,
    exif: null,
    is_virtual_copy: false,
    is_cloud_placeholder: false,
    ...overrides,
  };
}

describe('getFileExtension', () => {
  it('returns the lowercase extension', () => {
    expect(getFileExtension('/a/IMG_0001.RAW')).toBe('raw');
    expect(getFileExtension('/a/photo.PNG')).toBe('png');
  });

  it('returns empty string when there is no extension', () => {
    expect(getFileExtension('/a/noext')).toBe('');
    expect(getFileExtension('/a/.hidden')).toBe('hidden');
  });

  it('ignores query strings when parsing the path', () => {
    expect(getFileExtension('/a/file.jpg?v=123')).toBe('jpg');
  });

  it('uses the final path segment', () => {
    expect(getFileExtension('/nested/deep/path/photo.jpeg')).toBe('jpeg');
  });
});

describe('getVariantLabel', () => {
  it('uppercases the extension', () => {
    expect(getVariantLabel('/a/x.raw')).toBe('RAW');
    expect(getVariantLabel('/a/x.jpg')).toBe('JPG');
  });

  it('falls back to FILE when there is no extension', () => {
    expect(getVariantLabel('/a/noext')).toBe('FILE');
  });
});

describe('buildImageGroups', () => {
  const raw = makeFile('/a/IMG_0001.RAW', { group_id: 'g1', is_raw: true });
  const jpg = makeFile('/a/IMG_0001.JPG', { group_id: 'g1' });
  const single = makeFile('/a/IMG_0002.JPG');

  it('keeps ungrouped images in the display list', () => {
    const result = buildImageGroups([single], 'first');
    expect(result.displayList).toEqual([single]);
    expect(result.badges.size).toBe(0);
  });

  it('does not group when a group has fewer than 2 files', () => {
    const solo = makeFile('/a/solo.JPG', { group_id: 'g3' });
    const result = buildImageGroups([solo], 'first');
    expect(result.displayList).toEqual([solo]);
    expect(result.badges.has('g3')).toBe(false);
  });

  it('groups variants and hides all but the primary (first preference)', () => {
    const result = buildImageGroups([raw, jpg, single], 'first');
    // primary = first in the group = raw
    expect(result.displayList).toEqual([raw, single]);
    expect(result.badges.get('g1')).toEqual({ count: 2, label: 'JPG+RAW' });
  });

  it('prefers the raw file as primary when preference is raw', () => {
    const result = buildImageGroups([jpg, raw], 'raw');
    expect(result.displayList).toEqual([raw]);
  });

  it('prefers the non-raw file as primary when preference is jpeg', () => {
    const result = buildImageGroups([raw, jpg], 'jpeg');
    expect(result.displayList).toEqual([jpg]);
  });

  it('skips virtual copies when grouping', () => {
    const vc = makeFile('/a/IMG_0001_VIRT.JPG', { group_id: 'g1', is_virtual_copy: true });
    const result = buildImageGroups([raw, jpg, vc, single], 'first');
    expect(result.displayList).toEqual([raw, single]);
    expect(result.badges.get('g1')).toEqual({ count: 2, label: 'JPG+RAW' });
  });

  it('keeps virtual copies visible when their group is not collapsed', () => {
    const original = makeFile('/a/IMG_0001.JPG', { group_id: 'g7' });
    const vc = makeFile('/a/IMG_0001_VIRT.JPG', { group_id: 'g7', is_virtual_copy: true });
    // only one real file in the group -> not collapsed -> both stay visible
    const result = buildImageGroups([original, vc], 'first');
    expect(result.displayList).toEqual([original, vc]);
    expect(result.badges.has('g7')).toBe(false);
  });

  it('keeps edited files out of groups when groupEditedFiles is false', () => {
    const edited = makeFile('/a/IMG_0001_EDIT.JPG', { group_id: 'g1', is_edited: true });
    const result = buildImageGroups([raw, jpg, edited], 'first', false);
    // only raw + jpg remain in g1 -> grouped; edited stays visible on its own
    expect(result.displayList).toEqual([raw, edited]);
    expect(result.badges.get('g1')).toEqual({ count: 2, label: 'JPG+RAW' });
  });

  it('builds a sorted label from the variant extensions', () => {
    const dng = makeFile('/a/IMG_0001.DNG', { group_id: 'g9', is_raw: true });
    const tif = makeFile('/a/IMG_0001.TIF', { group_id: 'g9' });
    const jpg2 = makeFile('/a/IMG_0001.JPG', { group_id: 'g9' });
    const result = buildImageGroups([dng, tif, jpg2], 'first');
    expect(result.badges.get('g9')).toEqual({ count: 3, label: 'DNG+JPG+TIF' });
  });
});

describe('findGroupVariants', () => {
  const raw = makeFile('/a/IMG_0001.RAW', { group_id: 'g1', is_raw: true });
  const jpg = makeFile('/a/IMG_0001.JPG', { group_id: 'g1' });
  const vc = makeFile('/a/IMG_0001_VIRT.JPG', { group_id: 'g1', is_virtual_copy: true });
  const other = makeFile('/a/other.JPG', { group_id: 'g2' });

  it('returns matching variants excluding virtual copies', () => {
    expect(findGroupVariants([raw, jpg, vc, other], 'g1')).toEqual([raw, jpg]);
  });

  it('returns an empty array for a null or undefined group id', () => {
    expect(findGroupVariants([raw, jpg], null)).toEqual([]);
    expect(findGroupVariants([raw, jpg], undefined)).toEqual([]);
  });
});
