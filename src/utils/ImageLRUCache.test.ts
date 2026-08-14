import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageLRUCache, type ImageCacheEntry } from './ImageLRUCache';
import { INITIAL_ADJUSTMENTS } from './adjustments';

function makeEntry(url: string | null, keySuffix = '') {
  return {
    adjustments: INITIAL_ADJUSTMENTS,
    histogram: null,
    waveform: null,
    finalPreviewUrl: url ? `blob:mock${keySuffix}/${url}` : null,
    uncroppedPreviewUrl: null,
    selectedImage: null,
    originalSize: { width: 100, height: 100 },
    previewSize: { width: 50, height: 50 },
  };
}

describe('ImageLRUCache', () => {
  let revokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    revokeSpy = vi.fn();
    (globalThis as unknown as { URL: { revokeObjectURL: typeof revokeSpy } }).URL = {
      revokeObjectURL: revokeSpy,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and retrieves entries', () => {
    const cache = new ImageLRUCache(10);
    const entry = makeEntry('a');
    cache.set('a', entry);
    expect(cache.get('a')).toBe(entry);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts least-recently-used entry when exceeding maxSize', () => {
    const cache = new ImageLRUCache(2);
    cache.set('a', makeEntry('a'));
    cache.set('b', makeEntry('b'));
    // touch 'a' so 'b' becomes LRU
    cache.get('a');
    cache.set('c', makeEntry('c'));
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('evicts oldest (not touched) entry first', () => {
    const cache = new ImageLRUCache(2);
    cache.set('a', makeEntry('a'));
    cache.set('b', makeEntry('b'));
    cache.set('c', makeEntry('c'));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('revokes blob URLs of evicted entries', () => {
    const cache = new ImageLRUCache(1);
    cache.set('a', makeEntry('a'));
    cache.set('b', makeEntry('b'));
    // 'a' evicted -> its blob URL revoked
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock/a');
    expect(revokeSpy).not.toHaveBeenCalledWith('blob:mock/b');
  });

  it('does not revoke a blob URL reused by the replacement entry', () => {
    const cache = new ImageLRUCache(5);
    const url = 'blob:mock/reused';
    const entry1 = makeEntry('reused');
    const entry2 = { ...makeEntry('x'), finalPreviewUrl: url };
    cache.set('k', entry1);
    cache.set('k', entry2);
    expect(revokeSpy).not.toHaveBeenCalledWith(url);
  });

  it('marks blob URLs as protected while cached', () => {
    const cache = new ImageLRUCache(5);
    cache.set('a', makeEntry('a'));
    expect(cache.isProtected('blob:mock/a')).toBe(true);
    // get should not unprotect the URL
    cache.get('a');
    expect(cache.isProtected('blob:mock/a')).toBe(true);
    cache.delete('a');
    expect(cache.isProtected('blob:mock/a')).toBe(false);
  });

  it('deleteByPrefix removes keys with matching prefix and ?vc= suffix', () => {
    const cache = new ImageLRUCache(10);
    cache.set('path/img1.jpg', makeEntry('1'));
    cache.set('path/img1.jpg?vc=123', makeEntry('2'));
    cache.set('path/img2.jpg', makeEntry('3'));
    cache.deleteByPrefix('path/img1.jpg');
    expect(cache.get('path/img1.jpg')).toBeUndefined();
    expect(cache.get('path/img1.jpg?vc=123')).toBeUndefined();
    expect(cache.get('path/img2.jpg')).toBeDefined();
  });

  it('deleteByPrefix does not delete unrelated keys sharing a prefix substring', () => {
    const cache = new ImageLRUCache(10);
    cache.set('img1', makeEntry('1'));
    cache.set('img10', makeEntry('2'));
    cache.deleteByPrefix('img1');
    // only exact or ?vc= variants removed; img10 is a different key
    expect(cache.get('img1')).toBeUndefined();
    expect(cache.get('img10')).toBeDefined();
  });

  it('clear revokes all blob URLs and resets state', () => {
    const cache = new ImageLRUCache(10);
    cache.set('a', makeEntry('a'));
    cache.set('b', makeEntry('b'));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock/a');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock/b');
  });

  it('does not grow beyond maxSize', () => {
    const cache = new ImageLRUCache(3);
    for (let i = 0; i < 100; i++) cache.set(`k${i}`, makeEntry(`${i}`));
    expect(cache.size).toBeLessThanOrEqual(3);
  });

  it('does not track non-blob URLs as protected', () => {
    const cache = new ImageLRUCache(5);
    const entry = makeEntry('a');
    entry.finalPreviewUrl = 'https://example.com/img.png';
    cache.set('a', entry);
    expect(cache.isProtected('https://example.com/img.png')).toBe(false);
  });

  it('revokes both finalPreviewUrl and uncroppedPreviewUrl when evicted', () => {
    const cache = new ImageLRUCache(1);
    const entry1: ImageCacheEntry = makeEntry('a');
    entry1.finalPreviewUrl = 'blob:mock/final';
    entry1.uncroppedPreviewUrl = 'blob:mock/uncropped';
    cache.set('a', entry1);
    cache.set('b', makeEntry('b'));
    // Both URLs from 'a' should be revoked because 'a' is evicted
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock/final');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock/uncropped');
  });
});
