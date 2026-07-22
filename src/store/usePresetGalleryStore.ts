import { create } from 'zustand';

export interface GalleryPreset {
  name: string;
  coverPath: string;
  galleryImages: string[];
  author?: string;
  isNew?: boolean;
  sections?: any[];
  tags?: string[];
  description?: { title: string; content: string };
}

export interface GallerySource {
  url: string;
  name: string;
  enabled: boolean;
  presets: GalleryPreset[];
  isLoading: boolean;
  error: string | null;
}

interface PresetGalleryState {
  sources: GallerySource[];

  // Actions
  addSource: (url: string, name?: string) => void;
  removeSource: (url: string) => void;
  toggleSource: (url: string) => void;
  updateSourceName: (url: string, name: string) => void;
  fetchSourcePresets: (url: string) => Promise<void>;
  fetchAllEnabledSources: () => Promise<void>;
  refreshAllSources: () => Promise<void>;
  setSources: (sources: GallerySource[]) => void;
}

const DEFAULT_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/fengyec2/OMaster-Community@main/presets/v2/oppo.json';

const DEFAULT_SOURCES: GallerySource[] = [
  {
    url: DEFAULT_SOURCE_URL,
    name: 'OPPO / 一加 大师预设',
    enabled: true,
    presets: [],
    isLoading: false,
    error: null,
  },
];

const STORAGE_KEY = 'preset-gallery-sources';

const loadSources = (): GallerySource[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: any) => ({
          url: s.url || '',
          name: s.name || s.url || '',
          enabled: s.enabled !== false,
          presets: [],
          isLoading: false,
          error: null,
        }));
      }
    }
  } catch {}
  return DEFAULT_SOURCES;
};

const saveSources = (sources: GallerySource[]) => {
  try {
    const toSave = sources.map((s) => ({
      url: s.url,
      name: s.name,
      enabled: s.enabled,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
};

/**
 * Resolve a potentially relative path to an absolute URL using the JSON source base URL.
 * Handles: absolute URLs, relative paths, and protocol-relative URLs.
 */
const resolvePath = (path: string, baseDir: string): string => {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';

  // Already absolute URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

  // Protocol-relative URL (e.g., //cdn.example.com/...)
  if (trimmed.startsWith('//')) return 'https:' + trimmed;

  // Data URIs
  if (trimmed.startsWith('data:')) return trimmed;

  // Relative path - resolve against base directory
  if (trimmed.startsWith('/')) {
    // Absolute path relative to domain root
    try {
      const urlObj = new URL(baseDir);
      return `${urlObj.origin}${trimmed}`;
    } catch {
      return baseDir + trimmed.slice(1);
    }
  }

  // Relative path
  return baseDir + trimmed;
};

/**
 * Parse various JSON formats for preset gallery data.
 * Supports:
 * - { presets: [...] } format (OMaster/OPPO style)
 * - Array format [...] (RapidRAW manifest style)
 */
const parsePresetsFromJson = (data: any, baseDir: string): { presets: GalleryPreset[]; sourceName: string } => {
  if (!data) return { presets: [], sourceName: '' };

  // Array format: data is directly an array of presets
  if (Array.isArray(data)) {
    const presets: GalleryPreset[] = data.map((item: any) => ({
      name: item.name || 'Untitled',
      coverPath: resolvePath(item.coverPath || item.cover_image || '', baseDir),
      galleryImages: (item.galleryImages || item.gallery_images || item.samples || [])
        .map((img: any) => resolvePath(typeof img === 'string' ? img : img.url || '', baseDir))
        .filter(Boolean),
      author: item.author || item.creator || undefined,
      isNew: item.isNew || item.is_new || undefined,
      sections: item.sections || undefined,
      tags: item.tags || undefined,
      description: item.description || undefined,
    }));
    return { presets, sourceName: '' };
  }

  // Object format: { presets: [...], name: ... }
  if (typeof data === 'object') {
    const rawPresets: any[] = data.presets || data.data || [];
    const sourceName = data.name || data.title || '';

    const presets: GalleryPreset[] = rawPresets.map((p: any) => ({
      name: p.name || 'Untitled',
      coverPath: resolvePath(p.coverPath || p.cover_path || p.cover_image || '', baseDir),
      galleryImages: (p.galleryImages || p.gallery_images || p.samples || [])
        .map((img: any) => resolvePath(typeof img === 'string' ? img : img.url || '', baseDir))
        .filter(Boolean),
      author: p.author || p.creator || undefined,
      isNew: p.isNew || p.is_new || undefined,
      sections: p.sections || undefined,
      tags: p.tags || undefined,
      description: p.description || undefined,
    }));

    return { presets, sourceName };
  }

  return { presets: [], sourceName: '' };
};

export const usePresetGalleryStore = create<PresetGalleryState>((set, get) => ({
  sources: loadSources(),

  addSource: (url, name) => {
    const { sources } = get();
    if (sources.some((s) => s.url === url)) return;
    const newSources = [
      ...sources,
      { url, name: name || url, enabled: true, presets: [], isLoading: false, error: null },
    ];
    set({ sources: newSources });
    saveSources(newSources);
    get().fetchSourcePresets(url);
  },

  removeSource: (url) => {
    set((state) => {
      const newSources = state.sources.filter((s) => s.url !== url);
      saveSources(newSources);
      return { sources: newSources };
    });
  },

  toggleSource: (url) => {
    set((state) => {
      const newSources = state.sources.map((s) => (s.url === url ? { ...s, enabled: !s.enabled } : s));
      saveSources(newSources);
      return { sources: newSources };
    });
  },

  updateSourceName: (url, name) => {
    set((state) => {
      const newSources = state.sources.map((s) => (s.url === url ? { ...s, name } : s));
      saveSources(newSources);
      return { sources: newSources };
    });
  },

  fetchSourcePresets: async (url) => {
    const source = get().sources.find((s) => s.url === url);
    // Skip if already loading (prevent concurrent duplicate requests)
    if (source?.isLoading) return;

    set((state) => ({
      sources: state.sources.map((s) => (s.url === url ? { ...s, isLoading: true, error: null } : s)),
    }));

    try {
      const response = await fetch(url, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();

      // Get base directory for resolving relative paths
      const baseDir = url.substring(0, url.lastIndexOf('/') + 1);

      const { presets, sourceName } = parsePresetsFromJson(data, baseDir);
      const finalName = sourceName || source?.name || url;

      set((state) => {
        const newSources = state.sources.map((s) =>
          s.url === url
            ? { ...s, presets, name: finalName, isLoading: false, error: null }
            : s,
        );
        saveSources(newSources);
        return { sources: newSources };
      });
    } catch (err: any) {
      set((state) => {
        const newSources = state.sources.map((s) =>
          s.url === url ? { ...s, isLoading: false, error: err.message || String(err) } : s,
        );
        saveSources(newSources);
        return { sources: newSources };
      });
    }
  },

  fetchAllEnabledSources: async () => {
    const { sources } = get();
    // Only fetch sources that are enabled and haven't loaded data yet
    const needFetch = sources.filter((s) => s.enabled && s.presets.length === 0 && !s.isLoading);
    await Promise.all(needFetch.map((s) => get().fetchSourcePresets(s.url)));
  },

  refreshAllSources: async () => {
    const { sources } = get();
    // Force refresh all enabled sources regardless of existing data
    const enabledSources = sources.filter((s) => s.enabled);
    // Clear existing presets first to allow re-fetch
    set((state) => ({
      sources: state.sources.map((s) => (s.enabled ? { ...s, presets: [], error: null } : s)),
    }));
    await Promise.all(enabledSources.map((s) => get().fetchSourcePresets(s.url)));
  },

  setSources: (sources) => {
    set({ sources });
    saveSources(sources);
  },
}));
