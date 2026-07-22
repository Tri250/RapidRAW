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
          ...s,
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
    set((state) => ({
      sources: state.sources.map((s) => (s.url === url ? { ...s, isLoading: true, error: null } : s)),
    }));

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Get base directory for resolving relative paths
      const baseDir = url.substring(0, url.lastIndexOf('/') + 1);

      const rawPresets: GalleryPreset[] = data.presets || [];

      // Resolve all paths to absolute URLs
      const presets: GalleryPreset[] = rawPresets.map((p) => {
        const resolvePath = (path: string) => {
          if (!path) return '';
          if (path.startsWith('http://') || path.startsWith('https://')) return path;
          return baseDir + path;
        };

        return {
          ...p,
          coverPath: resolvePath(p.coverPath),
          galleryImages: p.galleryImages.map(resolvePath).filter(Boolean),
        };
      });

      const sourceName = data.name || url;

      set((state) => {
        const newSources = state.sources.map((s) =>
          s.url === url
            ? { ...s, presets, name: sourceName, isLoading: false, error: null }
            : s,
        );
        saveSources(newSources);
        return { sources: newSources };
      });
    } catch (err: any) {
      set((state) => {
        const newSources = state.sources.map((s) =>
          s.url === url ? { ...s, isLoading: false, error: err.message } : s,
        );
        saveSources(newSources);
        return { sources: newSources };
      });
    }
  },

  fetchAllEnabledSources: async () => {
    const { sources } = get();
    const enabledSources = sources.filter((s) => s.enabled);
    await Promise.all(enabledSources.map((s) => get().fetchSourcePresets(s.url)));
  },

  setSources: (sources) => {
    set({ sources });
    saveSources(sources);
  },
}));
