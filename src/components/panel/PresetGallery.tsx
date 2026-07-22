import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Loader2, Plus, RefreshCw, Trash2, X, ImageIcon,
  ChevronLeft, ChevronRight, Globe, Tag, Info, Camera, User,
  Maximize2, Grid3X3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Text from '../ui/Text';
import { TextColors, TextVariants, TextWeights } from '../../types/typography';
import { usePresetGalleryStore, GalleryPreset, GallerySource } from '../../store/usePresetGalleryStore';

/* ────────── Animation Variants ────────── */

const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { y: 16, opacity: 0, scale: 0.97 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
};

const skeletonVariants = {
  hidden: { opacity: 0.3 },
  visible: {
    opacity: 1,
    transition: { repeat: Infinity, repeatType: 'reverse' as const, duration: 1.2 },
  },
};

/* ────────── Constants ────────── */

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
  if (label.startsWith('@string/')) return label.replace('@string/', '').replace(/_/g, ' ');
  return label;
};

/* ────────── Skeleton Card ────────── */

const SkeletonCard = () => (
  <motion.div variants={skeletonVariants} className="rounded-xl overflow-hidden">
    <div className="aspect-[3/2] bg-surface/60 rounded-xl" />
    <div className="mt-2.5 space-y-1.5 px-0.5">
      <div className="h-3.5 bg-surface/60 rounded w-3/4" />
      <div className="h-3 bg-surface/40 rounded w-1/2" />
    </div>
  </motion.div>
);

/* ────────── PresetCard ────────── */

interface PresetCardProps {
  preset: GalleryPreset;
  index: number;
}

const PresetCard = ({ preset, index }: PresetCardProps) => {
  const { t } = useTranslation();
  const [showGallery, setShowGallery] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [coverError, setCoverError] = useState(false);
  const [coverUrl, setCoverUrl] = useState(preset.coverPath);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [galleryImageErrors, setGalleryImageErrors] = useState<Set<number>>(new Set());
  const [galleryUrlMap, setGalleryUrlMap] = useState<Map<number, string>>(new Map());
  const [showDetail, setShowDetail] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setCoverError(false);
    setCoverUrl(preset.coverPath);
    setCoverLoaded(false);
    setCurrentImageIndex(0);
    setGalleryImageErrors(new Set());
    setGalleryUrlMap(new Map());
  }, [preset.coverPath, preset.galleryImages]);

  const allImages = [preset.coverPath, ...preset.galleryImages].filter(Boolean);
  const hasImages = allImages.length > 0;

  const getImageUrl = (imgIndex: number): string => {
    if (imgIndex === 0) return coverUrl;
    if (galleryUrlMap.has(imgIndex)) return galleryUrlMap.get(imgIndex)!;
    return allImages[imgIndex];
  };

  const handleImageError = (imgIndex: number) => {
    if (imgIndex === 0) {
      if (coverUrl === preset.coverPath && preset.coverFallback) {
        setCoverUrl(preset.coverFallback);
        return;
      }
      setCoverError(true);
      return;
    }
    const primaryUrl = imgIndex < allImages.length ? allImages[imgIndex] : '';
    const currentUrl = galleryUrlMap.has(imgIndex) ? galleryUrlMap.get(imgIndex)! : primaryUrl;
    if (currentUrl === primaryUrl && preset.galleryFallback) {
      const fallbackIdx = preset.coverPath ? imgIndex - 1 : imgIndex;
      if (fallbackIdx >= 0 && fallbackIdx < preset.galleryFallback.length) {
        setGalleryUrlMap((prev) => new Map(prev).set(imgIndex, preset.galleryFallback![fallbackIdx]));
        return;
      }
    }
    setGalleryImageErrors((prev) => {
      const updated = new Set(prev).add(imgIndex);
      return updated;
    });
  };

  const viewableImages = allImages.filter((_, i) => !galleryImageErrors.has(i));
  const viewableIndex = Math.min(currentImageIndex, Math.max(0, viewableImages.length - 1));

  // Sync currentImageIndex when viewableImages changes to prevent index drift
  useEffect(() => {
    if (currentImageIndex >= viewableImages.length && viewableImages.length > 0) {
      setCurrentImageIndex(viewableImages.length - 1);
    }
  }, [viewableImages.length, currentImageIndex]);

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

  const closeGallery = () => {
    setShowGallery(false);
    setCurrentImageIndex(0);
  };

  // Keyboard navigation
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
    <motion.div
      variants={itemVariants}
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card */}
      <div
        className="relative aspect-[3/2] rounded-xl overflow-hidden bg-surface border border-border-color/50
                   cursor-pointer shadow-sm hover:shadow-lg hover:border-accent/30
                   transition-all duration-400 ease-out"
        onClick={() => hasImages && setShowGallery(true)}
      >
        {/* Cover Image */}
        {preset.coverPath && !coverError ? (
          <>
            {/* Blur-up placeholder */}
            {!coverLoaded && (
              <div className="absolute inset-0 bg-surface animate-pulse" />
            )}
            <img
              src={coverUrl}
              alt={preset.name}
              className={`w-full h-full object-cover transition-all duration-500 ease-out
                ${coverLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}
                group-hover:scale-110`}
              loading="lazy"
              onLoad={() => setCoverLoaded(true)}
              onError={() => handleImageError(0)}
            />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-surface p-4">
            <Camera size={28} className="text-text-secondary/40 mb-2" />
            <Text variant={TextVariants.label} weight={TextWeights.medium} className="text-center text-text-secondary/60">
              {preset.name}
            </Text>
          </div>
        )}

        {/* Top-left: Tags */}
        {preset.tags && preset.tags.length > 0 && (
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1 max-w-[70%]">
            {preset.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 bg-black/55 text-white/90 rounded-full
                           backdrop-blur-md font-medium tracking-wide"
              >
                {tag}
              </span>
            ))}
            {preset.tags.length > 2 && (
              <span className="text-[10px] px-2 py-0.5 bg-black/55 text-white/70 rounded-full backdrop-blur-md">
                +{preset.tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Top-right: NEW badge */}
        {preset.isNew && (
          <div className="absolute top-2.5 right-2.5">
            <span className="text-[10px] px-2 py-0.5 bg-accent text-white font-bold rounded-full
                             shadow-lg shadow-accent/25 tracking-wider">
              NEW
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <AnimatePresence>
          {isHovered && hasImages && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              {/* Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              {/* Bottom info bar */}
              <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
                <div className="flex items-center gap-1.5 text-white/90">
                  <Grid3X3 size={13} />
                  <span className="text-xs font-medium tracking-wide">
                    {allImages.length} {t('presetGallery.images', '张')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {(preset.description || (preset.sections && preset.sections.length > 0)) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80
                                 transition-colors backdrop-blur-sm"
                      title={t('presetGallery.showDetails', '查看详情')}
                    >
                      <Info size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowGallery(true); }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80
                               transition-colors backdrop-blur-sm"
                    title={t('presetGallery.viewGallery', '查看样张')}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Card info */}
      <div className="mt-2 px-0.5">
        <Text
          variant={TextVariants.label}
          weight={TextWeights.semibold}
          className="truncate block leading-snug"
        >
          {preset.name}
        </Text>
        {preset.author && (
          <div className="flex items-center gap-1 mt-0.5">
            <User size={10} className="text-text-secondary/60 shrink-0" />
            <Text variant={TextVariants.small} color={TextColors.secondary} className="truncate block">
              {preset.author}
            </Text>
          </div>
        )}
      </div>

      {/* ──── Detail Modal ──── */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-bg-primary rounded-2xl border border-border-color p-6 max-w-lg w-full mx-4
                         max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Camera size={18} className="text-accent" />
                  </div>
                  <Text variant={TextVariants.heading} weight={TextWeights.semibold}>{preset.name}</Text>
                </div>
                <button
                  onClick={() => setShowDetail(false)}
                  className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {preset.author && (
                <div className="flex items-center gap-2 mb-4 px-1">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                    <User size={12} className="text-accent" />
                  </div>
                  <Text variant={TextVariants.small} color={TextColors.secondary}>
                    {preset.author}
                  </Text>
                </div>
              )}

              {preset.tags && preset.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {preset.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2.5 py-1 bg-accent/8 text-accent rounded-full
                                 flex items-center gap-1 font-medium"
                    >
                      <Tag size={10} />{tag}
                    </span>
                  ))}
                </div>
              )}

              {preset.sections && preset.sections.length > 0 && (
                <div className="space-y-5 mb-5">
                  {preset.sections.map((section: any, si: number) => (
                    <div key={si}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-0.5 flex-1 bg-border-color/50" />
                        <Text variant={TextVariants.label} weight={TextWeights.semibold} className="text-accent shrink-0">
                          {translateLabel(section.title)}
                        </Text>
                        <div className="h-0.5 flex-1 bg-border-color/50" />
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
                        {section.items?.map((item: any, ii: number) => (
                          <div key={ii} className={item.span === 2 ? 'col-span-2' : ''}>
                            <span className="text-text-secondary text-xs">{translateLabel(item.label)}</span>
                            <span className="text-text-primary text-xs ml-1.5 font-semibold">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {preset.description && (
                <div className="p-4 bg-surface rounded-xl border border-border-color/50">
                  <Text variant={TextVariants.label} weight={TextWeights.semibold} color={TextColors.accent} className="mb-2 block">
                    {preset.description.title}
                  </Text>
                  <Text variant={TextVariants.small} color={TextColors.secondary} className="whitespace-pre-line leading-relaxed block">
                    {preset.description.content}
                  </Text>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ──── Gallery Viewer (Lightbox) ──── */}
      <AnimatePresence>
        {showGallery && hasImages && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[120] bg-black/96 flex items-center justify-center"
            onClick={closeGallery}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className="relative w-full h-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4
                              bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex items-center gap-4">
                  <div>
                    <Text weight={TextWeights.semibold} className="text-white text-sm">{preset.name}</Text>
                    {preset.author && (
                      <Text variant={TextVariants.small} className="text-white/50">{preset.author}</Text>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(preset.description || (preset.sections && preset.sections.length > 0)) && (
                    <button
                      onClick={() => setShowDetail(true)}
                      className="p-2.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-all"
                      title={t('presetGallery.showDetails', '查看详情')}
                    >
                      <Info size={18} />
                    </button>
                  )}
                  <button
                    onClick={closeGallery}
                    className="p-2.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Image area */}
              <div className="flex-1 flex items-center justify-center px-20 relative">
                <AnimatePresence mode="wait">
                  {viewableImages.length > 0 ? (
                    <motion.img
                      key={viewableIndex}
                      src={getImageUrl(getOriginalIndex(viewableIndex))}
                      alt={`${preset.name} - ${viewableIndex + 1}`}
                      className="max-h-[85vh] max-w-full object-contain rounded-sm select-none"
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.25 }}
                      onError={() => handleImageError(getOriginalIndex(viewableIndex))}
                      draggable={false}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-white/20">
                      <ImageIcon size={64} strokeWidth={1} />
                      <Text className="text-white/20 mt-3">
                        {t('presetGallery.imageLoadFailed', '图片加载失败')}
                      </Text>
                    </div>
                  )}
                </AnimatePresence>

                {/* Navigation */}
                {viewableImages.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); prevImage(); }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-3.5 rounded-2xl
                                 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white
                                 transition-all backdrop-blur-md border border-white/10
                                 active:scale-95"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); nextImage(); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3.5 rounded-2xl
                                 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white
                                 transition-all backdrop-blur-md border border-white/10
                                 active:scale-95"
                      aria-label="Next image"
                    >
                      <ChevronRight size={22} />
                    </button>
                  </>
                )}
              </div>

              {/* Bottom: thumbnails + counter */}
              {viewableImages.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 z-10
                                bg-gradient-to-t from-black/70 to-transparent pt-8 pb-4">
                  <div className="flex flex-col items-center gap-3">
                    {/* Counter */}
                    <div className="text-white/50 text-xs font-medium tracking-widest tabular-nums">
                      {String(viewableIndex + 1).padStart(2, '0')}
                      <span className="mx-1 text-white/20">/</span>
                      {String(viewableImages.length).padStart(2, '0')}
                    </div>
                    {/* Thumbnails */}
                    <div className="flex gap-2 overflow-x-auto max-w-[90vw] px-4 pb-1 custom-scrollbar">
                      {viewableImages.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentImageIndex(i)}
                          className={`shrink-0 w-16 h-10 rounded-lg overflow-hidden transition-all duration-200
                            ${i === viewableIndex
                              ? 'ring-2 ring-accent ring-offset-1 ring-offset-black/0 scale-105 opacity-100'
                              : 'opacity-45 hover:opacity-75'
                            }`}
                        >
                          <img
                            src={getImageUrl(getOriginalIndex(i))}
                            alt={`thumb-${i}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
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

/* ────────── SourceSection ────────── */

interface SourceSectionProps {
  source: GallerySource;
}

const SourceSection = ({ source }: SourceSectionProps) => {
  const { t } = useTranslation();
  const removeSource = usePresetGalleryStore((s) => s.removeSource);
  const fetchSourcePresets = usePresetGalleryStore((s) => s.fetchSourcePresets);

  if (!source.enabled) return null;

  const isLoading = source.isLoading;
  const hasPresets = source.presets.length > 0;

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4 px-0.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
            <Globe size={16} className="text-accent" />
          </div>
          <div>
            <Text variant={TextVariants.heading} weight={TextWeights.semibold}>
              {source.name}
            </Text>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1 h-1 rounded-full bg-accent/60" />
              <Text variant={TextVariants.small} color={TextColors.secondary}>
                {source.presets.length} {t('presetGallery.presets', '个预设')}
              </Text>
              {isLoading && <Loader2 size={12} className="animate-spin text-accent ml-1" />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 rounded-xl text-text-secondary hover:text-text-primary
                       hover:bg-surface flex items-center justify-center transition-all"
            onClick={() => fetchSourcePresets(source.url)}
            title={t('presetGallery.refresh', '刷新')}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </Button>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 rounded-xl text-text-secondary hover:text-red-400
                       hover:bg-red-400/5 flex items-center justify-center transition-all"
            onClick={() => removeSource(source.url)}
            title={t('presetGallery.removeSource', '移除')}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Error state */}
      {source.error && (
        <div className="mb-4 p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <X size={14} className="text-red-400" />
          </div>
          <Text color={TextColors.error} className="text-sm flex-1">{source.error}</Text>
          <Button
            variant="ghost"
            className="h-8 px-3 text-red-400 hover:text-red-300 hover:bg-red-400/5 rounded-lg text-xs"
            onClick={() => fetchSourcePresets(source.url)}
          >
            {t('presetGallery.retry', '重试')}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasPresets && !source.error && (
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary/40">
          <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-3">
            <ImageIcon size={28} />
          </div>
          <Text variant={TextVariants.small}>{t('presetGallery.noPresets', '暂无预设数据')}</Text>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && !hasPresets && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </motion.div>
      )}

      {/* Preset grid */}
      {hasPresets && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        >
          {source.presets.map((preset, idx) => (
            <PresetCard key={`${source.url}-${idx}`} preset={preset} index={idx} />
          ))}
        </motion.div>
      )}
    </div>
  );
};

/* ────────── PresetGallery ────────── */

interface PresetGalleryProps {
  onBack: () => void;
}

export default function PresetGallery({ onBack }: PresetGalleryProps) {
  const { t } = useTranslation();
  const { sources, addSource, fetchAllEnabledSources, refreshAllSources } = usePresetGalleryStore();
  const [newUrl, setNewUrl] = useState('');
  const [showAddSource, setShowAddSource] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAllEnabledSources();
  }, [fetchAllEnabledSources]);

  useEffect(() => {
    if (showAddSource && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showAddSource]);

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
    <div className="flex-1 flex flex-col h-full min-w-0 bg-bg-secondary rounded-xl overflow-hidden">
      {/* Header */}
      <header className="p-4 shrink-0 flex items-center justify-between border-b border-border-color/40 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            className="h-10 w-10 rounded-xl bg-surface hover:bg-hover-color text-text-primary
                       shadow-none p-0 flex items-center justify-center transition-all"
            onClick={onBack}
            title={t('presetGallery.backToLibrary', '返回图库')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <Text variant={TextVariants.headline} weight={TextWeights.semibold}>
              {t('presetGallery.title', '在线样张')}
            </Text>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1 h-1 rounded-full bg-accent/60" />
              <Text variant={TextVariants.small} color={TextColors.secondary}>
                {allPresetsCount} {t('presetGallery.presets', '个预设')}
              </Text>
              {anyLoading && <Loader2 size={12} className="animate-spin text-accent ml-1" />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            className="h-9 px-3 rounded-xl text-text-secondary hover:text-text-primary
                       hover:bg-surface flex items-center gap-1.5 transition-all text-xs"
            onClick={() => setShowAddSource(!showAddSource)}
          >
            <Plus size={14} />
            <span>{t('presetGallery.addSource', '添加源')}</span>
          </Button>
          <Button
            variant="ghost"
            className="h-9 w-9 p-0 rounded-xl text-text-secondary hover:text-text-primary
                       hover:bg-surface flex items-center justify-center transition-all"
            onClick={refreshAllSources}
            title={t('presetGallery.refreshAll', '刷新所有源')}
          >
            <RefreshCw size={14} className={anyLoading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      {/* Add source panel */}
      <AnimatePresence>
        {showAddSource && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-b border-border-color/40 overflow-hidden"
          >
            <div className="p-4 flex items-center gap-3">
              <div className="flex-1 relative">
                <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/50" />
                <input
                  ref={inputRef}
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSource()}
                  placeholder={t('presetGallery.addSourcePlaceholder', '输入 JSON URL...')}
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-bg-primary border border-border-color/50
                             text-sm text-text-primary placeholder:text-text-secondary/40
                             focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20
                             transition-all"
                />
              </div>
              <Button onClick={handleAddSource} className="h-10 px-4 rounded-xl text-sm font-medium">
                {t('presetGallery.add', '添加')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowAddSource(false)}
                className="h-10 w-10 p-0 rounded-xl text-text-secondary hover:text-text-primary
                           hover:bg-surface flex items-center justify-center transition-all"
              >
                <X size={16} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {enabledSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary/40">
            <div className="w-20 h-20 rounded-3xl bg-surface flex items-center justify-center mb-4">
              <Globe size={36} />
            </div>
            <Text variant={TextVariants.heading} color={TextColors.secondary} weight={TextWeights.medium}>
              {t('presetGallery.noSources', '暂无在线样张源')}
            </Text>
            <Text variant={TextVariants.small} color={TextColors.secondary} className="mt-2 opacity-60">
              {t('presetGallery.noSourcesDesc', '点击"添加源"添加 JSON 链接')}
            </Text>
            <Button
              onClick={() => setShowAddSource(true)}
              className="mt-6 h-10 px-5 rounded-xl text-sm font-medium"
            >
              <Plus size={14} className="mr-1.5" />
              {t('presetGallery.addSource', '添加源')}
            </Button>
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