import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Plus, RefreshCw, Trash2, X, ImageIcon, ChevronLeft, ChevronRight, Globe, Tag, Info, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Text from '../ui/Text';
import { TextColors, TextVariants, TextWeights } from '../../types/typography';
import { usePresetGalleryStore, GalleryPreset, GallerySource } from '../../store/usePresetGalleryStore';

const containerVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { y: 12, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

/** String resource label translations map */
const SECTION_TITLES: Record<string, string> = {
  '@string/section_color_grading': '色彩调整',
  '@string/param_pro_adjust': '专业参数',
};

const PARAM_LABELS: Record<string, string> = {
  '@string/param_filter': '滤镜',
  '@string/param_soft_light': '柔光',
  '@string/param_tone_curve': '色调曲线',
  '@string/param_saturation': '饱和度',
  '@string/param_warm_cool': '冷暖',
  '@string/param_cyan_magenta': '青品',
  '@string/param_sharpness': '锐度',
  '@string/param_vignette': '暗角',
  '@string/param_iso': 'ISO',
  '@string/param_shutter': '快门',
  '@string/param_exposure': '曝光',
  '@string/param_color_temp': '色温',
  '@string/param_tone': '色调',
};

const translateLabel = (label: string): string => {
  if (!label) return '';
  if (PARAM_LABELS[label]) return PARAM_LABELS[label];
  if (SECTION_TITLES[label]) return SECTION_TITLES[label];
  // Strip @string/ prefix for display
  if (label.startsWith('@string/')) return label.replace('@string/', '').replace(/_/g, ' ');
  return label;
};

interface PresetCardProps {
  preset: GalleryPreset;
}

const PresetCard = ({ preset }: PresetCardProps) => {
  const { t } = useTranslation();
  const [showGallery, setShowGallery] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [coverError, setCoverError] = useState(false);
  const [galleryImageErrors, setGalleryImageErrors] = useState<Set<number>>(new Set());
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    setCoverError(false);
    setCurrentImageIndex(0);
    setGalleryImageErrors(new Set());
  }, [preset.coverPath]);

  // All images for gallery viewing (cover + gallery images), all resolved to absolute URLs
  const allImages = [preset.coverPath, ...preset.galleryImages].filter(Boolean);
  const hasImages = allImages.length > 0;

  // Filter out images that failed to load in gallery
  const viewableImages = allImages.filter((_, i) => !galleryImageErrors.has(i));
  const viewableIndex = Math.min(currentImageIndex, Math.max(0, viewableImages.length - 1));

  const getOriginalIndex = (viewIdx: number): number => {
    let count = 0;
    for (let i = 0; i < allImages.length; i++) {
      if (!galleryImageErrors.has(i)) {
        if (count === viewIdx) return i;
        count++;
      }
    }
    return viewIdx;
  };

  const nextImage = useCallback(() => {
    if (viewableImages.length <= 1) return;
    setCurrentImageIndex((i) => (i + 1) % viewableImages.length);
  }, [viewableImages.length]);

  const prevImage = useCallback(() => {
    if (viewableImages.length <= 1) return;
    setCurrentImageIndex((i) => (i - 1 + viewableImages.length) % viewableImages.length);
  }, [viewableImages.length]);

  const handleGalleryImageError = (originalIndex: number) => {
    setGalleryImageErrors((prev) => new Set(prev).add(originalIndex));
  };

  const closeGallery = () => {
    setShowGallery(false);
    setCurrentImageIndex(0);
  };

  // Keyboard navigation for gallery
  useEffect(() => {
    if (!showGallery) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'd') nextImage();
      else if (e.key === 'ArrowLeft' || e.key === 'a') prevImage();
      else if (e.key === 'Escape') closeGallery();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showGallery, nextImage, prevImage]);

  return (
    <motion.div variants={itemVariants} className="group relative">
      <div
        className="relative aspect-[4/3] rounded-lg overflow-hidden bg-bg-primary border border-border-color cursor-pointer"
        onClick={() => hasImages && setShowGallery(true)}
      >
        {preset.coverPath && !coverError ? (
          <img
            src={preset.coverPath}
            alt={preset.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setCoverError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-surface p-3">
            <ImageIcon size={32} className="text-text-secondary mb-2" />
            <Text variant={TextVariants.label} weight={TextWeights.medium} className="text-center text-text-secondary">
              {preset.name}
            </Text>
          </div>
        )}

        {/* Tags overlay */}
        {preset.tags && preset.tags.length > 0 && (
          <div className="absolute top-2 left-2 flex gap-1">
            {preset.tags.map((tag) => (
              <span key={tag} className="text-xs px-1.5 py-0.5 bg-black/50 text-white rounded backdrop-blur-sm">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* New badge */}
        {preset.isNew && (
          <span className="absolute top-2 right-2 bg-accent text-button-text text-xs font-bold px-2 py-0.5 rounded-full">
            NEW
          </span>
        )}

        {/* Hover overlay */}
        {hasImages && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-between">
              <div className="flex items-center gap-1 text-white text-xs">
                <ImageIcon size={12} />
                <span>{allImages.length} {t('presetGallery.images', { defaultValue: '张' })}</span>
              </div>
              {(preset.description || (preset.sections && preset.sections.length > 0)) && (
                <Info size={14} className="text-white/70" />
              )}
            </div>
          </>
        )}
      </div>

      {/* Preset info below card */}
      <div className="mt-1.5 px-0.5">
        <Text variant={TextVariants.label} weight={TextWeights.medium} className="truncate block">
          {preset.name}
        </Text>
        {preset.author && (
          <Text variant={TextVariants.small} color={TextColors.secondary} className="truncate block">
            {preset.author}
          </Text>
        )}
      </div>

      {/* Detail modal (sections, description) */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-bg-primary rounded-xl border border-border-color p-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <Text variant={TextVariants.heading}>{preset.name}</Text>
                <button onClick={() => setShowDetail(false)} className="text-text-secondary hover:text-text-primary">
                  <X size={20} />
                </button>
              </div>
              {preset.author && (
                <Text variant={TextVariants.small} color={TextColors.secondary} className="mb-3 block">
                  {t('presetGallery.byAuthor', { defaultValue: '作者' })}: {preset.author}
                </Text>
              )}
              {preset.tags && preset.tags.length > 0 && (
                <div className="flex gap-1.5 mb-3">
                  {preset.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full flex items-center gap-1">
                      <Tag size={10} />{tag}
                    </span>
                  ))}
                </div>
              )}
              {preset.sections && preset.sections.length > 0 && (
                <div className="space-y-4 mb-4">
                  {preset.sections.map((section: any, si: number) => (
                    <div key={si}>
                      <Text variant={TextVariants.label} weight={TextWeights.semibold} className="mb-2 block text-accent">
                        {translateLabel(section.title)}
                      </Text>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {section.items && section.items.map((item: any, ii: number) => (
                          <div key={ii} className={item.span === 2 ? 'col-span-2' : ''}>
                            <span className="text-text-secondary text-xs">{translateLabel(item.label)}</span>
                            <span className="text-text-primary text-xs ml-1 font-medium">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {preset.description && (
                <div className="p-3 bg-surface rounded-lg border border-border-color">
                  <Text variant={TextVariants.label} weight={TextWeights.semibold} color={TextColors.accent} className="mb-1 block">
                    {preset.description.title}
                  </Text>
                  <Text variant={TextVariants.small} color={TextColors.secondary} className="whitespace-pre-line block">
                    {preset.description.content}
                  </Text>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gallery viewer */}
      <AnimatePresence>
        {showGallery && hasImages && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
            onClick={closeGallery}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full h-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top bar */}
              <div className="flex items-center justify-between p-4 text-white">
                <div>
                  <Text weight={TextWeights.semibold} className="text-white">{preset.name}</Text>
                  {preset.author && <Text variant={TextVariants.small} className="text-white/60">{preset.author}</Text>}
                </div>
                <div className="flex items-center gap-3">
                  {(preset.description || (preset.sections && preset.sections.length > 0)) && (
                    <button
                      onClick={() => setShowDetail(true)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      data-tooltip={t('presetGallery.showDetails', { defaultValue: '查看详情' })}
                    >
                      <Info size={18} />
                    </button>
                  )}
                  <button onClick={closeGallery} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Image area */}
              <div className="flex-1 flex items-center justify-center px-16 relative">
                {viewableImages.length > 0 ? (
                  <img
                    src={viewableImages[viewableIndex]}
                    alt={`${preset.name} - ${viewableIndex + 1}`}
                    className="max-h-full max-w-full object-contain rounded-lg"
                    onError={() => handleGalleryImageError(getOriginalIndex(viewableIndex))}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-white/30">
                    <ImageIcon size={64} />
                    <Text className="text-white/30 mt-2">{t('presetGallery.imageLoadFailed', { defaultValue: '图片加载失败' })}</Text>
                  </div>
                )}

                {/* Navigation arrows */}
                {viewableImages.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors backdrop-blur-sm"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors backdrop-blur-sm"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}
              </div>

              {/* Bottom bar: thumbnails + counter */}
              {viewableImages.length > 1 && (
                <div className="p-3 flex flex-col items-center gap-2">
                  <div className="text-white/60 text-xs">
                    {viewableIndex + 1} / {viewableImages.length}
                  </div>
                  <div className="flex gap-2 overflow-x-auto max-w-full px-2 custom-scrollbar">
                    {viewableImages.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentImageIndex(i)}
                        className={`shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-all ${
                          i === viewableIndex ? 'border-accent scale-105' : 'border-transparent opacity-60 hover:opacity-80'
                        }`}
                      >
                        <img
                          src={img}
                          alt={`thumb-${i}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface SourceSectionProps {
  source: GallerySource;
}

const SourceSection = ({ source }: SourceSectionProps) => {
  const { t } = useTranslation();
  const removeSource = usePresetGalleryStore((s) => s.removeSource);
  const fetchSourcePresets = usePresetGalleryStore((s) => s.fetchSourcePresets);

  if (!source.enabled) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-accent" />
          <Text variant={TextVariants.heading}>{source.name}</Text>
          <Text variant={TextVariants.small} color={TextColors.secondary}>
            ({source.presets.length} {t('presetGallery.presets', { defaultValue: '个预设' })})
          </Text>
          {source.isLoading && <Loader2 size={16} className="animate-spin text-accent" />}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="h-7 w-7 p-0 text-text-secondary hover:text-text-primary flex items-center justify-center"
            onClick={() => fetchSourcePresets(source.url)}
            data-tooltip={t('presetGallery.refresh', { defaultValue: '刷新' })}
          >
            <RefreshCw size={14} />
          </Button>
          <Button
            variant="ghost"
            className="h-7 w-7 p-0 text-text-secondary hover:text-red-400 flex items-center justify-center"
            onClick={() => removeSource(source.url)}
            data-tooltip={t('presetGallery.removeSource', { defaultValue: '移除' })}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {source.error && (
        <div className="mb-3 p-3 bg-red-900/10 border border-red-500/50 rounded-lg flex items-center gap-2">
          <X size={16} className="text-red-400 shrink-0" />
          <Text color={TextColors.error} className="text-sm">{source.error}</Text>
          <Button
            variant="ghost"
            className="ml-auto h-7 px-2 text-red-400 hover:text-red-300"
            onClick={() => fetchSourcePresets(source.url)}
          >
            {t('presetGallery.retry', { defaultValue: '重试' })}
          </Button>
        </div>
      )}

      {!source.isLoading && source.presets.length === 0 && !source.error && (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <ImageIcon size={40} className="opacity-30 mb-2" />
          <Text variant={TextVariants.small}>{t('presetGallery.noPresets', { defaultValue: '暂无预设数据' })}</Text>
        </div>
      )}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
      >
        {source.presets.map((preset, index) => (
          <PresetCard key={`${source.url}-${index}`} preset={preset} />
        ))}
      </motion.div>
    </div>
  );
};

interface PresetGalleryProps {
  onBack: () => void;
}

export default function PresetGallery({ onBack }: PresetGalleryProps) {
  const { t } = useTranslation();
  const { sources, addSource, fetchAllEnabledSources, refreshAllSources } = usePresetGalleryStore();
  const [newUrl, setNewUrl] = useState('');
  const [showAddSource, setShowAddSource] = useState(false);

  useEffect(() => {
    fetchAllEnabledSources();
  }, [fetchAllEnabledSources]);

  const handleAddSource = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    addSource(trimmed);
    setNewUrl('');
    setShowAddSource(false);
  };

  const enabledSources = sources.filter((s) => s.enabled);
  const allPresetsCount = enabledSources.reduce((sum, s) => sum + s.presets.length, 0);
  const anyLoading = enabledSources.some((s) => s.isLoading);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-bg-secondary rounded-lg overflow-hidden">
      <header className="p-3 shrink-0 flex items-center justify-between border-b border-surface gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            className="h-9 w-9 bg-surface text-text-primary shadow-none p-0 flex items-center justify-center"
            onClick={onBack}
            data-tooltip={t('presetGallery.backToLibrary', { defaultValue: '返回图库' })}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <Text variant={TextVariants.headline}>{t('presetGallery.title', { defaultValue: '在线样张' })}</Text>
            <Text variant={TextVariants.small} color={TextColors.secondary}>
              {allPresetsCount} {t('presetGallery.presets', { defaultValue: '个预设' })}
              {anyLoading && <Loader2 size={12} className="inline ml-1 animate-spin" />}
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            className="h-8 px-2 text-text-secondary hover:text-text-primary flex items-center gap-1"
            onClick={() => setShowAddSource(!showAddSource)}
          >
            <Plus size={14} />
            <span className="text-xs">{t('presetGallery.addSource', { defaultValue: '添加源' })}</span>
          </Button>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 text-text-secondary hover:text-text-primary flex items-center justify-center"
            onClick={refreshAllSources}
            data-tooltip={t('presetGallery.refreshAll', { defaultValue: '刷新所有源' })}
          >
            <RefreshCw size={14} className={anyLoading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      {/* Add source bar */}
      <AnimatePresence>
        {showAddSource && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-surface overflow-hidden"
          >
            <div className="p-3 flex items-center gap-2">
              <Input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSource()}
                placeholder={t('presetGallery.addSourcePlaceholder', { defaultValue: '输入 JSON URL...' })}
                className="flex-1"
                bgClassName="bg-bg-primary"
              />
              <Button onClick={handleAddSource} className="h-9 px-3 text-sm">
                {t('presetGallery.add', { defaultValue: '添加' })}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowAddSource(false)}
                className="h-9 px-2 text-text-secondary"
              >
                <X size={14} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {enabledSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary">
            <Globe className="h-16 w-16 mb-4 opacity-20" />
            <Text variant={TextVariants.heading} color={TextColors.secondary}>
              {t('presetGallery.noSources', { defaultValue: '暂无在线样张源' })}
            </Text>
            <Text className="mt-2 text-sm">
              {t('presetGallery.noSourcesDesc', { defaultValue: '点击"添加源"添加 JSON 链接' })}
            </Text>
          </div>
        ) : (
          enabledSources.map((source) => (
            <SourceSection key={source.url} source={source} />
          ))
        )}
      </div>
    </div>
  );
}
