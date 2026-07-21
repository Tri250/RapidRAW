import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { PresetSubscription, GalleryPreset, SubscriptionUpdateInfo } from '../types/subscription';

const DEFAULT_SUBSCRIPTION: PresetSubscription = {
  id: 'default-github',
  url: 'https://raw.githubusercontent.com/CyberTimon/RapidRAW-Presets/main/presets.json',
  name: 'RapidRAW Official',
  author: '@CyberTimon',
  build: 1,
  isEnabled: true,
  isDefault: true,
  presetCount: 0,
  lastUpdateTime: 0,
  updateStatus: 'idle',
};

interface SubscriptionState {
  subscriptions: PresetSubscription[];
  galleryPresets: GalleryPreset[];
  isGalleryLoading: boolean;
  isAutoUpdateEnabled: boolean;
  lastAutoUpdateDate: string | null;
  selectedPresetId: string | null;
  galleryFilter: string;
  galleryTag: string | null;

  // Actions
  initSubscriptions: () => Promise<void>;
  addSubscription: (url: string) => Promise<boolean>;
  removeSubscription: (id: string) => void;
  toggleSubscription: (id: string) => void;
  editSubscriptionUrl: (id: string, newUrl: string) => Promise<boolean>;
  checkSubscriptionUpdate: (id: string) => Promise<void>;
  checkAllUpdates: () => Promise<void>;
  updateSubscription: (id: string) => Promise<void>;
  setAutoUpdate: (enabled: boolean) => void;
  setLastAutoUpdateDate: (date: string) => void;
  loadGalleryPresets: () => Promise<void>;
  setSelectedPresetId: (id: string | null) => void;
  setGalleryFilter: (filter: string) => void;
  setGalleryTag: (tag: string | null) => void;
  downloadPreset: (preset: GalleryPreset) => Promise<void>;
  getFilteredPresets: () => GalleryPreset[];
}

const STORAGE_KEY = 'rapidraw-subscriptions-v1';

function loadFromStorage(): PresetSubscription[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PresetSubscription[];
      if (parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [DEFAULT_SUBSCRIPTION];
}

function saveToStorage(subs: PresetSubscription[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  } catch {
    // ignore
  }
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptions: loadFromStorage(),
  galleryPresets: [],
  isGalleryLoading: false,
  isAutoUpdateEnabled: true,
  lastAutoUpdateDate: null,
  selectedPresetId: null,
  galleryFilter: '',
  galleryTag: null,

  initSubscriptions: async () => {
    const subs = get().subscriptions;
    if (subs.length === 0) {
      set({ subscriptions: [DEFAULT_SUBSCRIPTION] });
    }
    await get().loadGalleryPresets();
  },

  addSubscription: async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || !trimmed.startsWith('http')) return false;

    const existing = get().subscriptions.find((s) => s.url === trimmed);
    if (existing) return false;

    set((state) => ({
      subscriptions: [
        ...state.subscriptions,
        {
          id: `sub-${Date.now()}`,
          url: trimmed,
          name: trimmed,
          author: '',
          build: 0,
          isEnabled: true,
          isDefault: false,
          presetCount: 0,
          lastUpdateTime: 0,
          updateStatus: 'idle',
        },
      ],
    }));

    saveToStorage(get().subscriptions);

    // Try to fetch metadata
    try {
      const info: SubscriptionUpdateInfo = await invoke('check_subscription_update', {
        url: trimmed,
        localBuild: 0,
      });
      set((state) => ({
        subscriptions: state.subscriptions.map((s) =>
          s.url === trimmed
            ? {
                ...s,
                name: info.presetCount > 0 ? s.name : s.name,
                remoteBuild: info.remoteBuild,
                presetCount: info.presetCount,
                updateStatus: info.hasUpdate ? 'available' : 'idle',
              }
            : s,
        ),
      }));
      saveToStorage(get().subscriptions);
    } catch (e) {
      console.error('Failed to check new subscription:', e);
    }

    return true;
  },

  removeSubscription: (id: string) => {
    set((state) => ({
      subscriptions: state.subscriptions.filter((s) => s.id !== id || s.isDefault),
    }));
    saveToStorage(get().subscriptions);
    get().loadGalleryPresets();
  },

  toggleSubscription: (id: string) => {
    set((state) => ({
      subscriptions: state.subscriptions.map((s) =>
        s.id === id ? { ...s, isEnabled: !s.isEnabled } : s,
      ),
    }));
    saveToStorage(get().subscriptions);
    get().loadGalleryPresets();
  },

  editSubscriptionUrl: async (id: string, newUrl: string) => {
    const trimmed = newUrl.trim();
    if (!trimmed || !trimmed.startsWith('http')) return false;

    set((state) => ({
      subscriptions: state.subscriptions.map((s) =>
        s.id === id ? { ...s, url: trimmed, build: 0, updateStatus: 'idle' as const } : s,
      ),
    }));
    saveToStorage(get().subscriptions);
    await get().checkSubscriptionUpdate(id);
    return true;
  },

  checkSubscriptionUpdate: async (id: string) => {
    const sub = get().subscriptions.find((s) => s.id === id);
    if (!sub || !sub.isEnabled) return;

    set((state) => ({
      subscriptions: state.subscriptions.map((s) =>
        s.id === id ? { ...s, updateStatus: 'checking' as const } : s,
      ),
    }));

    try {
      const info: SubscriptionUpdateInfo = await invoke('check_subscription_update', {
        url: sub.url,
        localBuild: sub.build,
      });

      set((state) => ({
        subscriptions: state.subscriptions.map((s) =>
          s.id === id
            ? {
                ...s,
                remoteBuild: info.remoteBuild,
                presetCount: info.presetCount,
                lastCheckTime: Date.now(),
                updateStatus: info.hasUpdate ? ('available' as const) : ('idle' as const),
                errorMessage: undefined,
              }
            : s,
        ),
      }));
    } catch (e: any) {
      set((state) => ({
        subscriptions: state.subscriptions.map((s) =>
          s.id === id
            ? { ...s, updateStatus: 'error' as const, errorMessage: String(e) }
            : s,
        ),
      }));
    }
    saveToStorage(get().subscriptions);
  },

  checkAllUpdates: async () => {
    const enabledSubs = get().subscriptions.filter((s) => s.isEnabled);
    for (const sub of enabledSubs) {
      await get().checkSubscriptionUpdate(sub.id);
    }
  },

  updateSubscription: async (id: string) => {
    const sub = get().subscriptions.find((s) => s.id === id);
    if (!sub || !sub.isEnabled) return;

    set((state) => ({
      subscriptions: state.subscriptions.map((s) =>
        s.id === id ? { ...s, updateStatus: 'updating' as const } : s,
      ),
    }));

    try {
      await invoke('download_subscription', { url: sub.url, subId: sub.id });

      // Re-check to get new build number
      const info: SubscriptionUpdateInfo = await invoke('check_subscription_update', {
        url: sub.url,
        localBuild: 0,
      });

      set((state) => ({
        subscriptions: state.subscriptions.map((s) =>
          s.id === id
            ? {
                ...s,
                build: info.remoteBuild,
                remoteBuild: info.remoteBuild,
                presetCount: info.presetCount,
                lastUpdateTime: Date.now(),
                updateStatus: 'idle' as const,
                errorMessage: undefined,
              }
            : s,
        ),
      }));

      await get().loadGalleryPresets();
    } catch (e: any) {
      set((state) => ({
        subscriptions: state.subscriptions.map((s) =>
          s.id === id
            ? { ...s, updateStatus: 'error' as const, errorMessage: String(e) }
            : s,
        ),
      }));
    }
    saveToStorage(get().subscriptions);
  },

  setAutoUpdate: (enabled: boolean) => {
    set({ isAutoUpdateEnabled: enabled });
  },

  setLastAutoUpdateDate: (date: string) => {
    set({ lastAutoUpdateDate: date });
  },

  loadGalleryPresets: async () => {
    set({ isGalleryLoading: true });
    try {
      const presets: GalleryPreset[] = await invoke('load_all_subscription_presets');
      set({ galleryPresets: presets, isGalleryLoading: false });
    } catch (e) {
      console.error('Failed to load gallery presets:', e);
      set({ isGalleryLoading: false });
    }
  },

  setSelectedPresetId: (id: string | null) => {
    set({ selectedPresetId: id });
  },

  setGalleryFilter: (filter: string) => {
    set({ galleryFilter: filter });
  },

  setGalleryTag: (tag: string | null) => {
    set({ galleryTag: tag });
  },

  downloadPreset: async (preset: GalleryPreset) => {
    try {
      await invoke('save_community_preset', {
        name: preset.name,
        adjustments: preset.adjustments,
        includeMasks: preset.includeMasks,
        includeCropTransform: preset.includeCropTransform,
        presetType: preset.presetType || 'style',
      });
    } catch (e) {
      console.error('Failed to download preset:', e);
      throw e;
    }
  },

  getFilteredPresets: () => {
    const { galleryPresets, galleryFilter, galleryTag } = get();
    return galleryPresets.filter((p) => {
      const matchesFilter = !galleryFilter ||
        p.name.toLowerCase().includes(galleryFilter.toLowerCase()) ||
        p.creator.toLowerCase().includes(galleryFilter.toLowerCase());
      const matchesTag = !galleryTag || (p.tags?.includes(galleryTag) ?? false);
      return matchesFilter && matchesTag;
    });
  },
}));
