import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Invokes } from '../components/ui/AppProperties';

export interface GalleryPresetSectionItem {
  label: string;
  value: string;
  span?: number;
}

export interface GalleryPresetSection {
  title: string;
  items: GalleryPresetSectionItem[];
}

export interface GalleryPreset {
  name: string;
  coverPath: string;
  coverFallback?: string;
  galleryImages: string[];
  galleryFallback?: string[];
  author?: string;
  isNew?: boolean;
  sections?: GalleryPresetSection[];
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
  /** Per-preset download status, keyed by `${sourceUrl}::${presetName}`. */
  downloadStatus: Record<string, 'idle' | 'downloading' | 'success' | 'error'>;
  downloadError: Record<string, string | null>;

  // Actions
  addSource: (url: string, name?: string) => boolean;
  removeSource: (url: string) => void;
  toggleSource: (url: string) => void;
  updateSourceName: (url: string, name: string) => void;
  fetchSourcePresets: (url: string) => Promise<void>;
  fetchAllEnabledSources: () => Promise<void>;
  refreshAllSources: () => Promise<void>;
  setSources: (sources: GallerySource[]) => void;
  downloadPreset: (sourceUrl: string, preset: GalleryPreset) => Promise<boolean>;
}

/**
 * Convert OMaster v2 `sections` (label/value pairs) into a RapidRAW
 * `adjustments` object. Mirrors the Rust `convert_params_to_adjustments`
 * + `param_label_to_key` logic in lib.rs so gallery presets land in the
 * local library with the same numeric normalization as CommunityPage.
 */
export const convertSectionsToAdjustments = (sections?: GalleryPresetSection[]): Record<string, number> => {
  if (!sections || !Array.isArray(sections)) return {};
  const adjustments: Record<string, number> = {};

  // Professional/camera parameters that should be skipped (not image adjustments)
  const PROFESSIONAL_LABELS = new Set([
    'ISO',
    'ISO感光度',
    '快门',
    '快门速度',
    'EV',
    '白平衡',
    'WB白平衡',
    'AF对焦模式',
    'M测光模式',
    '曝光补偿',
  ]);

  for (const section of sections) {
    if (!section?.items) continue;
    for (const param of section.items) {
      const valueStr = String(param.value ?? '').trim();
      // Skip professional labels that aren't image adjustments
      if (PROFESSIONAL_LABELS.has(param.label)) continue;
      // Skip non-numeric values like "Auto", "MF", "AF-S", "矩阵测光", "开", "无"
      // and fractional values like "1/200" (shutter speed leaks)
      if (!/^-?\d+(\.\d+)?$/.test(valueStr)) continue;
      const num = parseFloat(valueStr);
      if (Number.isNaN(num)) continue;

      // Normalize based on the parameter type (mirror Rust logic)
      let normalized: number;
      switch (param.label) {
        // Basic adjustments: scale from [-5, +5] to [-1, 1]
        case 'saturation':
        case 'hue':
        case 'contrast':
        case 'brightness':
        case 'sharpness':
        case 'clarity':
        case 'tone_curve':
          normalized = Math.max(-1, Math.min(1, num / 5));
          break;
        // Highlight/shadow: scale from [-5, +5] to [-100, 100]
        case 'contrast_highlight':
        case 'contrast_shadow':
          normalized = Math.max(-100, Math.min(100, num * 20));
          break;
        // Grain: scale from [-5, +5] to [0, 100]
        case 'grain':
        case 'grain_size':
          normalized = Math.max(0, Math.min(100, ((num + 5) / 10) * 100));
          break;
        // Chinese labels from vivo/honor/OPPO: scale from [-100, +100] range
        // (vivo/OPPO use ±20 for basic, ±100 for shadow/highlight)
        case '曝光':
        case '亮度':
          normalized = Math.max(-1, Math.min(1, num / 100));
          break;
        case '对比度':
          normalized = Math.max(-1, Math.min(1, num / 100));
          break;
        case '高光':
          normalized = Math.max(-100, Math.min(100, num));
          break;
        case '阴影':
          normalized = Math.max(-100, Math.min(100, num));
          break;
        case '饱和度':
          normalized = Math.max(-1, Math.min(1, num / 100));
          break;
        case '色温':
        case '冷暖':
          normalized = Math.max(-100, Math.min(100, num));
          break;
        case '锐度':
          normalized = Math.max(-1, Math.min(1, num / 100));
          break;
        case '光感':
        case '柔光':
          normalized = Math.max(-1, Math.min(1, num / 100));
          break;
        case '暗角':
          normalized = Math.max(-100, Math.min(100, num));
          break;
        // vivo extra labels
        case '色调':
          normalized = Math.max(-100, Math.min(100, num));
          break;
        case '青品':
          normalized = Math.max(-100, Math.min(100, num));
          break;
        default:
          normalized = num;
      }

      // Map label to adjustment key (mirror Rust param_label_to_key)
      let key: string;
      switch (param.label) {
        case 'saturation':
          key = 'saturation';
          break;
        case 'hue':
          key = 'hue';
          break;
        case 'contrast':
          key = 'contrast';
          break;
        case 'brightness':
          key = 'brightness';
          break;
        case 'sharpness':
          key = 'sharpness';
          break;
        case 'clarity':
          key = 'clarity';
          break;
        case 'tone_curve':
          key = 'toneCurve';
          break;
        case 'contrast_highlight':
          key = 'highlights';
          break;
        case 'contrast_shadow':
          key = 'shadows';
          break;
        case 'grain':
          key = 'grainAmount';
          break;
        case 'grain_size':
          key = 'grainSize';
          break;
        case 'filter':
          key = 'filter';
          break;
        // Chinese labels from vivo/honor/OPPO community presets
        case '曝光':
          key = 'brightness';
          break;
        case '亮度':
          key = 'brightness';
          break;
        case '对比度':
          key = 'contrast';
          break;
        case '高光':
          key = 'highlights';
          break;
        case '阴影':
          key = 'shadows';
          break;
        case '饱和度':
          key = 'saturation';
          break;
        case '色温':
          key = 'temperature';
          break;
        case '锐度':
          key = 'sharpness';
          break;
        case '光感':
          key = 'clarity';
          break;
        case '色调曲线':
          key = 'toneCurve';
          break;
        case '暗角':
          key = 'vignette';
          break;
        case '柔光':
          key = 'clarity';
          break;
        case '冷暖':
          key = 'temperature';
          break;
        case '色调':
          key = 'tint';
          break;
        case '青品':
          key = 'tint';
          break;
        default:
          key = param.label.toLowerCase().replace(/\s+/g, '_');
      }

      adjustments[key] = Math.round(normalized * 100) / 100;
    }
  }

  return adjustments;
};

const DEFAULT_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/fengyec2/OMaster-Community@main/presets/v2/oppo.json';

/** Fallback CDN for images not available on jsDelivr (e.g. relative paths like images/xxx.webp) */
const FALLBACK_CDN_BASE = 'https://cdn.fky.ltd/';

/**
 * Generate a fallback URL on the fallback CDN by extracting just the filename from the path.
 * Example: images/fsjp_01.webp  →  https://cdn.fky.ltd/fsjp_01.webp
 */
const resolveFallbackPath = (path: string): string => {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  // Already absolute URLs don't need a fallback
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) return '';
  // Extract just the filename from the path
  const lastSlash = trimmed.lastIndexOf('/');
  const filename = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  if (!filename) return '';
  return FALLBACK_CDN_BASE + filename;
};

const DEFAULT_SOURCES: GallerySource[] = [
  {
    url: DEFAULT_SOURCE_URL,
    name: 'OPPO / 一加 大师预设',
    enabled: true,
    presets: [],
    isLoading: false,
    error: null,
  },
  {
    url: 'https://cdn.jsdelivr.net/gh/fengyec2/OMaster-Community@main/presets/v2/vivo.json',
    name: 'vivo 大师预设',
    enabled: true,
    presets: [],
    isLoading: false,
    error: null,
  },
  {
    url: 'https://cdn.jsdelivr.net/gh/fengyec2/OMaster-Community@main/presets/v2/honor.json',
    name: 'honor 大师预设',
    enabled: true,
    presets: [],
    isLoading: false,
    error: null,
  },
  {
    url: 'https://cdn.jsdelivr.net/gh/fengyec2/OMaster-Community@main/presets/v2/realme.json',
    name: 'realme 大师预设',
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
        const storedSources = parsed.map((s: any) => ({
          url: s.url || '',
          name: s.name || s.url || '',
          enabled: s.enabled !== false,
          presets: [],
          isLoading: false,
          error: null,
        }));
        // Merge in any DEFAULT_SOURCES that are missing from localStorage
        // so new sources added in app updates automatically appear.
        const storedUrls = new Set(storedSources.map((s) => s.url));
        const missingDefaults = DEFAULT_SOURCES.filter((d) => !storedUrls.has(d.url));
        if (missingDefaults.length > 0) {
          return [...storedSources, ...missingDefaults];
        }
        return storedSources;
      }
    }
  } catch {
    console.warn('Failed to load gallery sources, using defaults');
  }
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
  } catch {
    console.warn('Failed to save gallery sources');
  }
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
export interface PresetParseResult {
  presets: GalleryPreset[];
  sourceName: string;
  /** Number of entries skipped due to schema validation failure. */
  skipped: number;
  /** Human-readable validation warnings for the first few skipped entries. */
  warnings: string[];
}

/**
 * Whitelist of allowed hostnames for preset source URLs. Mirrors the
 * `connect-src` directive in tauri.conf.json CSP. Prevents SSRF by rejecting
 * private/loopback addresses and unknown hosts before fetch.
 */
const ALLOWED_SOURCE_HOSTS = new Set<string>([
  'raw.githubusercontent.com',
  'cdn.jsdelivr.net',
  'huggingface.co',
  'cdn.fky.ltd',
  'getrapidraw.com',
  'www.getrapidraw.com',
]);

const isAllowedSourceUrl = (url: string): boolean => {
  if (typeof url !== 'string' || url.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // Only HTTPS allowed (no http, no file, no data)
  if (parsed.protocol !== 'https:') return false;
  // Reject userinfo (embedded credentials)
  if (parsed.username || parsed.password) return false;
  // Reject explicit port numbers (only standard 443 implicit)
  if (parsed.port !== '') return false;
  // Hostname must be in whitelist (subdomain matching for getrapidraw.com)
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_SOURCE_HOSTS.has(host)) return true;
  if (host.endsWith('.getrapidraw.com')) return true;
  return false;
};

const isNonEmptyString = (v: any): v is string => typeof v === 'string' && v.trim().length > 0;
const isStringArray = (v: any): v is any[] => Array.isArray(v);

/**
 * Normalize a raw `sections` value into the typed `GalleryPresetSection[]`
 * shape. Drops items that don't match the `{ title, items: [{ label, value }] }`
 * schema, so downstream consumers (download, detail panel) can trust the
 * structure without re-validating.
 */
const normalizeSections = (raw: any): GalleryPresetSection[] | undefined => {
  if (!isStringArray(raw)) return undefined;
  const out: GalleryPresetSection[] = [];
  for (const sec of raw) {
    if (!sec || typeof sec !== 'object') continue;
    const items = Array.isArray(sec.items) ? sec.items : [];
    const normItems: GalleryPresetSectionItem[] = [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const label = isNonEmptyString(it.label) ? it.label : isNonEmptyString(it.name) ? it.name : null;
      const value = isNonEmptyString(it.value) ? it.value : it.value == null ? '' : String(it.value);
      if (!label) continue;
      normItems.push({ label, value, span: typeof it.span === 'number' ? it.span : undefined });
    }
    if (normItems.length === 0) continue;
    out.push({
      title: isNonEmptyString(sec.title) ? sec.title! : '',
      items: normItems,
    });
  }
  return out.length > 0 ? out : undefined;
};

const buildPreset = (p: any, baseDir: string): GalleryPreset | null => {
  if (!p || typeof p !== 'object') return null;

  const name = isNonEmptyString(p.name) ? p.name! : null;
  if (!name) return null; // name is mandatory

  const rawCover = p.coverPath || p.cover_path || p.cover_image || '';
  const rawGallery: any[] = p.galleryImages || p.gallery_images || p.samples || [];
  const sections = normalizeSections(p.sections);

  // Must have at least a cover or sections to be useful
  if (!rawCover && !sections && rawGallery.length === 0) return null;

  // Detect common placeholder filenames that won't resolve to real images
  const isPlaceholder = (p: string) => typeof p === 'string' && /placeholder\.(webp|png|jpg|jpeg|gif)/i.test(p.trim());

  const galleryImages = rawGallery
    .map((img: any) => resolvePath(typeof img === 'string' ? img : img?.url || '', baseDir))
    .filter(Boolean);
  const galleryFallback = rawGallery
    .map((img: any) => resolveFallbackPath(typeof img === 'string' ? img : img?.url || ''))
    .filter(Boolean);

  const resolvedCover = resolvePath(rawCover, baseDir);
  const coverIsPlaceholder = isPlaceholder(rawCover);

  // If cover is a placeholder, try fallback CDN; if that also fails, set empty
  // so the UI can show the fallback text/initial rendering instead of a broken image
  const effectiveCoverPath = coverIsPlaceholder ? '' : resolvedCover;
  const effectiveCoverFallback = coverIsPlaceholder
    ? resolveFallbackPath(rawCover) || undefined
    : resolveFallbackPath(rawCover) || undefined;

  // Filter out placeholder gallery images too
  const effectiveGalleryImages =
    galleryImages.length > 0 &&
    !rawGallery.every((img: any) => isPlaceholder(typeof img === 'string' ? img : img?.url || ''))
      ? galleryImages
      : [];
  const effectiveGalleryFallback = effectiveGalleryImages.length > 0 ? galleryFallback : [];

  return {
    name,
    coverPath: effectiveCoverPath,
    coverFallback: effectiveCoverFallback,
    galleryImages: effectiveGalleryImages,
    galleryFallback: effectiveGalleryFallback,
    author: isNonEmptyString(p.author) ? p.author! : isNonEmptyString(p.creator) ? p.creator! : undefined,
    isNew: p.isNew === true || p.is_new === true || undefined,
    sections,
    tags: Array.isArray(p.tags) ? p.tags.filter(isNonEmptyString) : undefined,
    description:
      p.description && typeof p.description === 'object' && isNonEmptyString(p.description.title)
        ? { title: p.description.title, content: String(p.description.content || '') }
        : undefined,
  };
};

const parsePresetsFromJson = (data: any, baseDir: string): PresetParseResult => {
  if (!data) return { presets: [], sourceName: '', skipped: 0, warnings: [] };

  let rawPresets: any[] = [];
  let sourceName = '';

  if (Array.isArray(data)) {
    rawPresets = data;
  } else if (typeof data === 'object') {
    rawPresets = data.presets || data.data || [];
    if (!Array.isArray(rawPresets)) rawPresets = [];
    sourceName = isNonEmptyString(data.name) ? data.name! : isNonEmptyString(data.title) ? data.title! : '';
  } else {
    return { presets: [], sourceName: '', skipped: 0, warnings: [] };
  }

  const presets: GalleryPreset[] = [];
  let skipped = 0;
  const warnings: string[] = [];

  rawPresets.forEach((p, idx) => {
    const built = buildPreset(p, baseDir);
    if (built) {
      presets.push(built);
    } else {
      skipped++;
      if (warnings.length < 5) {
        const hint = p && typeof p === 'object' && isNonEmptyString(p.name) ? p.name : `#${idx}`;
        warnings.push(`跳过无效预设：${hint}`);
      }
    }
  });

  if (skipped > 0 && warnings.length > 0) {
    console.warn(`[PresetGallery] ${skipped} preset(s) skipped due to schema validation:`, warnings);
  }

  return { presets, sourceName, skipped, warnings };
};

export const usePresetGalleryStore = create<PresetGalleryState>((set, get) => ({
  sources: loadSources(),
  downloadStatus: {},
  downloadError: {},

  addSource: (url, name) => {
    const { sources } = get();
    if (sources.some((s) => s.url === url)) return false;

    // URL whitelist: only allow HTTPS URLs from known preset CDNs to prevent
    // SSRF (e.g. http://169.254.169.254/ cloud metadata, internal network scan).
    // The CSP also restricts connect-src, but defense in depth is cheap here.
    if (!isAllowedSourceUrl(url)) {
      console.warn(`[PresetGallery] Rejected source URL (not whitelisted): ${url}`);
      return false;
    }

    const newSources = [
      ...sources,
      { url, name: name || url, enabled: true, presets: [], isLoading: false, error: null },
    ];
    set({ sources: newSources });
    saveSources(newSources);
    get().fetchSourcePresets(url);
    return true;
  },

  removeSource: (url) => {
    set((state) => {
      const newSources = state.sources.filter((s) => s.url !== url);
      // Also purge download status/error entries belonging to this source
      // to prevent the Record from growing unbounded over time.
      const prefix = `${url}::`;
      const newDownloadStatus = Object.fromEntries(
        Object.entries(state.downloadStatus).filter(([k]) => !k.startsWith(prefix)),
      );
      const newDownloadError = Object.fromEntries(
        Object.entries(state.downloadError).filter(([k]) => !k.startsWith(prefix)),
      );
      saveSources(newSources);
      return { sources: newSources, downloadStatus: newDownloadStatus, downloadError: newDownloadError };
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
    const stateSources = get().sources;
    const source = stateSources.find((s) => s.url === url);
    // Skip if already loading (prevent concurrent duplicate requests)
    if (source?.isLoading) return;

    // ---------- in-memory sessionStorage cache layer ----------
    // Persisted in sessionStorage so repeat fetches in the same application
    // session (switching tabs / re-mounting PresetGallery) are instant. TTL
    // is 15 minutes and stale entries are kept as a fallback on network
    // failure, so flaky mobile / Android hotspot users still see the last successful
    // result instead of a blank page.
    const CACHE_TTL_MS = 15 * 60 * 1000;
    const cacheKey = `preset-src:${url}`;
    const currentSource = stateSources.find((s) => s.url === url);
    const cachedJson = sessionStorage.getItem(cacheKey);
    let fallbackPresets: GalleryPreset[] | null = null;
    let fallbackName: string | null = null;
    if (cachedJson) {
      try {
        const parsed = JSON.parse(cachedJson);
        const age = Date.now() - (parsed.timestamp || 0);
        if (parsed.presets && Array.isArray(parsed.presets)) {
          if (age < CACHE_TTL_MS) {
            // Fresh cache hit – short-circuit network entirely.
            set((state) => {
              const newSources = state.sources.map((s) =>
                s.url === url
                  ? { ...s, presets: parsed.presets, name: parsed.sourceName || s.name, isLoading: false, error: null }
                  : s,
              );
              saveSources(newSources);
              return { sources: newSources };
            });
            return;
          }
          // Stale entry – remember it as a graceful-degradation fallback if the
          // network request fails.
          fallbackPresets = parsed.presets;
          fallbackName = parsed.sourceName || null;
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }
    // Also use *currentSource.presets as a second fallback (surfaced by the store state
    if (!fallbackPresets && currentSource?.presets?.length) {
      fallbackPresets = currentSource.presets;
      fallbackName = currentSource.name;
    }

    set((state) => ({
      sources: state.sources.map((s) => (s.url === url ? { ...s, isLoading: true, error: null } : s)),
    }));

    // 20s timeout via AbortController so a stalled CDN doesn't hang UI forever
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        mode: 'cors',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-cache',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      clearTimeout(timeoutId);

      // Get base directory for resolving relative paths
      const baseDir = url.substring(0, url.lastIndexOf('/') + 1);

      const { presets, sourceName, skipped, warnings } = parsePresetsFromJson(data, baseDir);
      const finalName = sourceName || source?.name || fallbackName || url;

      // Persist the successful result to session cache.
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ timestamp: Date.now(), presets, sourceName: finalName }),
        );
      } catch {
        /* ignore quota errors */
      }

      // Non-fatal: schema skipped some entries. Surface as a soft error so the
      // UI can inform the user without blocking the successfully parsed presets.
      const softError =
        skipped > 0
          ? warnings.length > 0
            ? `${skipped} 项无效已跳过：${warnings.join('；')}${skipped > warnings.length ? '…' : ''}`
            : `${skipped} 项无效已跳过`
          : null;

      set((state) => {
        const newSources = state.sources.map((s) =>
          s.url === url ? { ...s, presets, name: finalName, isLoading: false, error: softError } : s,
        );
        saveSources(newSources);
        return { sources: newSources };
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err?.name === 'AbortError';
      let message = isAbort ? `请求超时（20 秒），请检查网络或更换数据源` : err?.message || String(err);

      // Graceful degradation: if we have cached presets, surface them so
      // instead of a blank list and annotate the error as "offline cached".
      if (fallbackPresets && fallbackPresets.length > 0) {
        message = `${message}（已显示上次缓存的 ${fallbackPresets.length} 项离线缓存）`;
        set((state) => {
          const newSources = state.sources.map((s) =>
            s.url === url
              ? {
                  ...s,
                  presets: fallbackPresets,
                  name: fallbackName || s.name,
                  isLoading: false,
                  error: message,
                }
              : s,
          );
          saveSources(newSources);
          return { sources: newSources };
        });
        return;
      }

      set((state) => {
        const newSources = state.sources.map((s) => (s.url === url ? { ...s, isLoading: false, error: message } : s));
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
    // Clear existing presets AND download status (since preset identities may change)
    set((state) => ({
      sources: state.sources.map((s) => (s.enabled ? { ...s, presets: [], error: null } : s)),
      downloadStatus: {},
      downloadError: {},
    }));
    await Promise.all(enabledSources.map((s) => get().fetchSourcePresets(s.url)));
  },

  setSources: (sources) => {
    set({ sources });
    saveSources(sources);
  },

  downloadPreset: async (sourceUrl, preset) => {
    const key = `${sourceUrl}::${preset.name}`;
    set((state) => ({
      downloadStatus: { ...state.downloadStatus, [key]: 'downloading' },
      downloadError: { ...state.downloadError, [key]: null },
    }));

    try {
      const adjustments = convertSectionsToAdjustments(preset.sections);

      // If no image adjustment params could be extracted (e.g. honor.json
      // presets only have professional camera settings like ISO/shutter),
      // still allow saving with an empty adjustments object so the preset
      // name + description + tags are preserved as a reference.
      await invoke(Invokes.SaveCommunityPreset, {
        name: preset.name,
        adjustments: Object.keys(adjustments).length > 0 ? adjustments : {},
        includeMasks: false,
        includeCropTransform: false,
        presetType: Object.keys(adjustments).length > 0 ? 'style' : 'reference',
      });

      set((state) => ({
        downloadStatus: { ...state.downloadStatus, [key]: 'success' },
      }));
      return true;
    } catch (err: any) {
      set((state) => ({
        downloadStatus: { ...state.downloadStatus, [key]: 'error' },
        downloadError: { ...state.downloadError, [key]: err?.message || String(err) },
      }));
      return false;
    }
  },
}));
