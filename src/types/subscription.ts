export interface PresetSubscription {
  id: string;
  url: string;
  name: string;
  author: string;
  build: number;
  remoteBuild?: number;
  isEnabled: boolean;
  isDefault: boolean;
  presetCount: number;
  lastUpdateTime: number;
  lastCheckTime?: number;
  updateStatus: 'idle' | 'checking' | 'available' | 'updating' | 'error';
  errorMessage?: string;
}

export interface PresetSubscriptionList {
  version: number;
  name: string;
  author: string;
  build: number;
  presets: SubscriptionPreset[];
}

export interface SubscriptionPreset {
  id?: string;
  name: string;
  coverPath?: string;
  galleryImages?: string[];
  author: string;
  creator?: string;
  mode?: string;
  adjustments: Record<string, unknown>;
  includeMasks?: boolean;
  includeCropTransform?: boolean;
  presetType?: 'tool' | 'style' | 'portrait' | 'color' | 'ai-color' | 'combined';
  description?: string;
  tags?: string[];
  isNew?: boolean;
  sourceUrl?: string;
  build?: number;
}

export interface SubscriptionUpdateInfo {
  hasUpdate: boolean;
  remoteBuild: number;
  localBuild: number;
  presetCount: number;
}

export interface GalleryPreset {
  id: string;
  name: string;
  creator: string;
  coverUrl: string | null;
  galleryUrls: string[];
  adjustments: Record<string, unknown>;
  includeMasks?: boolean;
  includeCropTransform?: boolean;
  presetType?: 'tool' | 'style' | 'portrait' | 'color' | 'ai-color' | 'combined';
  description?: string;
  tags?: string[];
  isNew?: boolean;
  sourceSubscriptionId?: string;
}
