import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageLRUCache, globalImageCache, type ImageCacheEntry } from '../ImageLRUCache';

const createMockEntry = (overrides: Partial<ImageCacheEntry> = {}): ImageCacheEntry => ({
  adjustments: {} as any,
  histogram: null,
  waveform: null,
  finalPreviewUrl: null,
  uncroppedPreviewUrl: null,
  selectedImage: null,
  originalSize: { width: 100, height: 100 },
  previewSize: { width: 100, height: 100 },
  ...overrides,
});

describe('ImageLRUCache', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('默认 maxSize 为 20', () => {
      const cache = new ImageLRUCache();
      for (let i = 0; i < 20; i++) {
        cache.set(`key${i}`, createMockEntry());
      }
      cache.set('key20', createMockEntry());
      expect(cache.get('key0')).toBeUndefined();
      expect(cache.get('key1')).toBeDefined();
    });

    it('可以自定义 maxSize', () => {
      const cache = new ImageLRUCache(3);
      cache.set('key1', createMockEntry());
      cache.set('key2', createMockEntry());
      cache.set('key3', createMockEntry());
      cache.set('key4', createMockEntry());
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeDefined();
      expect(cache.get('key3')).toBeDefined();
      expect(cache.get('key4')).toBeDefined();
    });
  });

  describe('get()', () => {
    it('不存在的 key 返回 undefined', () => {
      const cache = new ImageLRUCache();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('存在的 key 返回正确的值', () => {
      const cache = new ImageLRUCache();
      const entry = createMockEntry({ finalPreviewUrl: 'blob:test123' });
      cache.set('key1', entry);
      expect(cache.get('key1')).toBe(entry);
    });

    it('get 操作会将条目移到最近使用位置（LRU 更新）', () => {
      const cache = new ImageLRUCache(3);
      const entry1 = createMockEntry();
      const entry2 = createMockEntry();
      const entry3 = createMockEntry();
      cache.set('key1', entry1);
      cache.set('key2', entry2);
      cache.set('key3', entry3);

      cache.get('key1');

      cache.set('key4', createMockEntry());

      expect(cache.get('key1')).toBeDefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBeDefined();
      expect(cache.get('key4')).toBeDefined();
    });

    it('get 会从 protectedBlobUrls 中移除对应的 finalPreviewUrl', () => {
      const cache = new ImageLRUCache();
      const blobUrl = 'blob:final-url';
      const entry = createMockEntry({ finalPreviewUrl: blobUrl });
      cache.set('key1', entry);
      expect(cache.isProtected(blobUrl)).toBe(true);

      cache.get('key1');
      expect(cache.isProtected(blobUrl)).toBe(false);
    });

    it('get 会从 protectedBlobUrls 中移除对应的 uncroppedPreviewUrl', () => {
      const cache = new ImageLRUCache();
      const blobUrl = 'blob:uncropped-url';
      const entry = createMockEntry({ uncroppedPreviewUrl: blobUrl });
      cache.set('key1', entry);
      expect(cache.isProtected(blobUrl)).toBe(true);

      cache.get('key1');
      expect(cache.isProtected(blobUrl)).toBe(false);
    });

    it('get 会同时移除 finalPreviewUrl 和 uncroppedPreviewUrl', () => {
      const cache = new ImageLRUCache();
      const finalUrl = 'blob:final-url';
      const uncroppedUrl = 'blob:uncropped-url';
      const entry = createMockEntry({ finalPreviewUrl: finalUrl, uncroppedPreviewUrl: uncroppedUrl });
      cache.set('key1', entry);
      expect(cache.isProtected(finalUrl)).toBe(true);
      expect(cache.isProtected(uncroppedUrl)).toBe(true);

      cache.get('key1');
      expect(cache.isProtected(finalUrl)).toBe(false);
      expect(cache.isProtected(uncroppedUrl)).toBe(false);
    });
  });

  describe('set()', () => {
    it('可以设置新条目', () => {
      const cache = new ImageLRUCache();
      const entry = createMockEntry();
      cache.set('key1', entry);
      expect(cache.get('key1')).toBe(entry);
    });

    it('覆盖已有条目时会清理旧条目', () => {
      const cache = new ImageLRUCache();
      const oldBlobUrl = 'blob:old-url';
      const oldEntry = createMockEntry({ finalPreviewUrl: oldBlobUrl });
      cache.set('key1', oldEntry);
      expect(cache.isProtected(oldBlobUrl)).toBe(true);

      const newEntry = createMockEntry({ finalPreviewUrl: 'blob:new-url' });
      cache.set('key1', newEntry);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldBlobUrl);
      expect(cache.get('key1')).toBe(newEntry);
    });

    it('覆盖已有条目时如果新条目复用了旧的 blob url 则不撤销', () => {
      const cache = new ImageLRUCache();
      const sharedBlobUrl = 'blob:shared-url';
      const oldEntry = createMockEntry({ finalPreviewUrl: sharedBlobUrl });
      cache.set('key1', oldEntry);

      const newEntry = createMockEntry({ finalPreviewUrl: sharedBlobUrl });
      vi.clearAllMocks();
      cache.set('key1', newEntry);

      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      expect(cache.get('key1')).toBe(newEntry);
    });

    it('超过 maxSize 时淘汰最久未使用的条目', () => {
      const cache = new ImageLRUCache(2);
      const entry1 = createMockEntry({ finalPreviewUrl: 'blob:1' });
      const entry2 = createMockEntry({ finalPreviewUrl: 'blob:2' });
      cache.set('key1', entry1);
      cache.set('key2', entry2);

      const entry3 = createMockEntry({ finalPreviewUrl: 'blob:3' });
      cache.set('key3', entry3);

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeDefined();
      expect(cache.get('key3')).toBeDefined();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    });

    it('blob: 开头的 finalPreviewUrl 会被添加到 protectedBlobUrls', () => {
      const cache = new ImageLRUCache();
      const blobUrl = 'blob:test-url';
      const entry = createMockEntry({ finalPreviewUrl: blobUrl });
      cache.set('key1', entry);
      expect(cache.isProtected(blobUrl)).toBe(true);
    });

    it('blob: 开头的 uncroppedPreviewUrl 会被添加到 protectedBlobUrls', () => {
      const cache = new ImageLRUCache();
      const blobUrl = 'blob:uncropped-url';
      const entry = createMockEntry({ uncroppedPreviewUrl: blobUrl });
      cache.set('key1', entry);
      expect(cache.isProtected(blobUrl)).toBe(true);
    });

    it('非 blob: 开头的 url 不会被添加到 protectedBlobUrls', () => {
      const cache = new ImageLRUCache();
      const httpUrl = 'https://example.com/image.jpg';
      const entry = createMockEntry({ finalPreviewUrl: httpUrl });
      cache.set('key1', entry);
      expect(cache.isProtected(httpUrl)).toBe(false);
    });

    it('null 的 url 不会被添加到 protectedBlobUrls', () => {
      const cache = new ImageLRUCache();
      const entry = createMockEntry({ finalPreviewUrl: null, uncroppedPreviewUrl: null });
      cache.set('key1', entry);
      expect(cache.isProtected('null')).toBe(false);
    });
  });

  describe('isProtected()', () => {
    it('受保护的 url 返回 true', () => {
      const cache = new ImageLRUCache();
      const blobUrl = 'blob:protected-url';
      cache.set('key1', createMockEntry({ finalPreviewUrl: blobUrl }));
      expect(cache.isProtected(blobUrl)).toBe(true);
    });

    it('不受保护的 url 返回 false', () => {
      const cache = new ImageLRUCache();
      expect(cache.isProtected('blob:unprotected')).toBe(false);
    });
  });

  describe('delete()', () => {
    it('删除存在的条目并清理资源', () => {
      const cache = new ImageLRUCache();
      const blobUrl = 'blob:to-delete';
      const entry = createMockEntry({ finalPreviewUrl: blobUrl });
      cache.set('key1', entry);
      expect(cache.get('key1')).toBeDefined();

      cache.delete('key1');
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.isProtected(blobUrl)).toBe(false);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
    });

    it('删除不存在的条目不报错', () => {
      const cache = new ImageLRUCache();
      expect(() => cache.delete('nonexistent')).not.toThrow();
    });

    it('删除时会清理 finalPreviewUrl 和 uncroppedPreviewUrl', () => {
      const cache = new ImageLRUCache();
      const finalUrl = 'blob:final-delete';
      const uncroppedUrl = 'blob:uncropped-delete';
      const entry = createMockEntry({ finalPreviewUrl: finalUrl, uncroppedPreviewUrl: uncroppedUrl });
      cache.set('key1', entry);

      cache.delete('key1');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(finalUrl);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(uncroppedUrl);
    });
  });

  describe('deleteByPrefix()', () => {
    it('删除匹配前缀的条目', () => {
      const cache = new ImageLRUCache();
      cache.set('prefix1', createMockEntry());
      cache.set('prefix2', createMockEntry());
      cache.set('other', createMockEntry());

      cache.deleteByPrefix('prefix1');

      expect(cache.get('prefix1')).toBeUndefined();
      expect(cache.get('prefix2')).toBeDefined();
      expect(cache.get('other')).toBeDefined();
    });

    it('删除匹配前缀加 ?vc= 的条目', () => {
      const cache = new ImageLRUCache();
      cache.set('image.jpg', createMockEntry());
      cache.set('image.jpg?vc=123', createMockEntry());
      cache.set('image.jpg?vc=456', createMockEntry());
      cache.set('other.jpg', createMockEntry());

      cache.deleteByPrefix('image.jpg');

      expect(cache.get('image.jpg')).toBeUndefined();
      expect(cache.get('image.jpg?vc=123')).toBeUndefined();
      expect(cache.get('image.jpg?vc=456')).toBeUndefined();
      expect(cache.get('other.jpg')).toBeDefined();
    });

    it('不删除不匹配的条目', () => {
      const cache = new ImageLRUCache();
      cache.set('key1', createMockEntry());
      cache.set('key2', createMockEntry());
      cache.set('other', createMockEntry());

      cache.deleteByPrefix('nomatch');

      expect(cache.get('key1')).toBeDefined();
      expect(cache.get('key2')).toBeDefined();
      expect(cache.get('other')).toBeDefined();
    });

    it('删除时会清理资源', () => {
      const cache = new ImageLRUCache();
      const blobUrl1 = 'blob:prefix1';
      const blobUrl2 = 'blob:prefix1-vc';
      cache.set('prefix1', createMockEntry({ finalPreviewUrl: blobUrl1 }));
      cache.set('prefix1?vc=1', createMockEntry({ finalPreviewUrl: blobUrl2 }));

      cache.deleteByPrefix('prefix1');

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl2);
    });
  });

  describe('clear()', () => {
    it('清空所有条目', () => {
      const cache = new ImageLRUCache();
      cache.set('key1', createMockEntry());
      cache.set('key2', createMockEntry());
      cache.set('key3', createMockEntry());

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBeUndefined();
    });

    it('清空所有受保护的 url', () => {
      const cache = new ImageLRUCache();
      cache.set('key1', createMockEntry({ finalPreviewUrl: 'blob:1' }));
      cache.set('key2', createMockEntry({ finalPreviewUrl: 'blob:2' }));

      cache.clear();

      expect(cache.isProtected('blob:1')).toBe(false);
      expect(cache.isProtected('blob:2')).toBe(false);
    });

    it('清空时会撤销所有 blob url', () => {
      const cache = new ImageLRUCache();
      const blobUrl1 = 'blob:clear-1';
      const blobUrl2 = 'blob:clear-2';
      cache.set('key1', createMockEntry({ finalPreviewUrl: blobUrl1 }));
      cache.set('key2', createMockEntry({ finalPreviewUrl: blobUrl2 }));

      vi.clearAllMocks();
      cache.clear();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl2);
    });
  });
});

describe('globalImageCache', () => {
  it('是 ImageLRUCache 的实例', () => {
    expect(globalImageCache).toBeInstanceOf(ImageLRUCache);
  });

  it('单例存在', () => {
    expect(globalImageCache).toBeDefined();
  });
});
