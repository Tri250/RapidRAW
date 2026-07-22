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
  isGalleryOpen: boolean;

  // Actions
  setGalleryOpen: (open: boolean) => void;
  addSource: (url: string, name?: string) => void;
  removeSource: (url: string) => void;
  toggleSource: (url: string) => void;
  updateSourceName: (url: string, name: string) => void;
  fetchSourcePresets: (url: string) => Promise<void>;
  fetchAllEnabledSources: () => Promise<void>;
  setSources: (sources: GallerySource[]) => void;
}

const DEFAULT_SOURCES: GallerySource[] = [
  {
    url: 'https://cdn.jsdelivr.net/gh/fengyec2/OMaster-Community@main/presets/v2/oppo.json',
    name: 'OPPO / 一加 大师预设',
    enabled: true,
    presets: [],
    isLoading: false,
    error: null,
  },
];

export const usePresetGalleryStore = create<PresetGalleryState>((set, get) => ({
  sources: DEFAULT_SOURCES,
  isGalleryOpen: false,

  setGalleryOpen: (open) => set({ isGalleryOpen: open }),

  addSource: (url, name) => {
    const { sources } = get();
    if (sources.some((s) => s.url === url)) return;
    set({
      sources: [
        ...sources,
        { url, name: name || url, enabled: true, presets: [], isLoading: false, error: null },
      ],
    });
  },

  removeSource: (url) => {
    set((state) => ({ sources: state.sources.filter((s) => s.url !== url) }));
  },

  toggleSource: (url) => {
    set((state) => ({
      sources: state.sources.map((s) => (s.url === url ? { ...s, enabled: !s.enabled } : s)),
    }));
  },

  updateSourceName: (url, name) => {
    set((state) => ({
      sources: state.sources.map((s) => (s.url === url ? { ...s, name } : s)),
    }));
  },

  fetchSourcePresets: async (url) => {
    set((state) => ({
      sources: state.sources.map((s) => (s.url === url ? { ...s, isLoading: true, error: null } : s)),
    }));

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const presets: GalleryPreset[] = data.presets || [];
      const sourceName = data.name || url;

      set((state) => ({
        sources: state.sources.map((s) =>
          s.url === url
            ? { ...s, presets, name: sourceName, isLoading: false, error: null }
            : s,
        ),
      }));
    } catch (err: any) {
      set((state) => ({
        sources: state.sources.map((s) =>
          s.url === url ? { ...s, isLoading: false, error: err.message } : s,
        ),
      }));
    }
  },

  fetchAllEnabledSources: async () => {
    const { sources } = get();
    const enabledSources = sources.filter((s) => s.enabled);
    await Promise.all(enabledSources.map((s) => get().fetchSourcePresets(s.url)));
  },

  setSources: (sources) => set({ sources }),
}));
