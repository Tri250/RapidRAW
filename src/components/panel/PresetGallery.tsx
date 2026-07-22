import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Plus, RefreshCw, Trash2, X, ImageIcon, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Text from '../ui/Text';
import { TextColors, TextVariants, TextWeights } from '../../types/typography';
import { usePresetGalleryStore, GalleryPreset, GallerySource } from '../../store/usePresetGalleryStore';

const containerVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

interface PresetCardProps {
  preset: GalleryPreset;
  baseUrl: string;
}

const PresetCard = ({ preset, baseUrl }: PresetCardProps) => {
  const { t } = useTranslation();
  const [showGallery, setShowGallery] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const resolveUrl = (path: string) => {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return base + path;
  };

  const coverUrl = resolveUrl(preset.coverPath);
  const allImages = [coverUrl, ...preset.galleryImages.map(resolveUrl)];

  const nextImage = () => setCurrentImageIndex((i) => (i + 1) % allImages.length);
  const prevImage = () => setCurrentImageIndex((i) => (i - 1 + allImages.length) % allImages.length);

  return (
    <motion.div variants={itemVariants} className="group relative">
      <div
        className="relative aspect-[4/3] rounded-lg overflow-hidden bg-bg-primary border border-border-color cursor-pointer"
        onClick={() => setShowGallery(true)}
      >
        <img
          src={coverUrl}
          alt={preset.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {preset.isNew && (
          <span className="absolute top-2 right-2 bg-accent text-button-text text-xs font-bold px-2 py-0.5 rounded-full">
            NEW
          </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {preset.galleryImages.length > 0 && (
            <div className="flex items-center gap-1 text-white text-xs">
              <ImageIcon size={12} />
              <span>{preset.galleryImages.length + 1} {t('presetGallery.images', { defaultValue: '张图片' })}</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2">
        <Text variant={TextVariants.label} weight={TextWeights.medium} className="truncate block">
          {preset.name}
        </Text>
        {preset.author && (
          <Text variant={TextVariants.small} color={TextColors.secondary} className="truncate block">
            {preset.author}
          </Text>
        )}
      </div>

      <AnimatePresence>
        {showGallery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowGallery(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-[85vh] mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowGallery(false)}
                className="absolute -top-10 right-0 text-white hover:text-accent transition-colors z-10"
              >
                <X size={24} />
              </button>

              <div className="relative bg-bg-primary rounded-xl overflow-hidden border border-border-color">
                <img
                  src={allImages[currentImageIndex]}
                  alt={`${preset.name} - ${currentImageIndex + 1}`}
                  className="max-h-[75vh] w-auto mx-auto object-contain"
                />

                {allImages.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {allImages.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentImageIndex(i)}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            i === currentImageIndex ? 'bg-white' : 'bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 text-center">
                <Text color="white" weight={TextWeights.medium}>{preset.name}</Text>
                {preset.author && (
                  <Text variant={TextVariants.small} className="text-white/70">{preset.author}</Text>
                )}
              </div>

              {preset.description && (
                <div className="mt-3 p-3 bg-bg-primary/90 rounded-lg border border-border-color max-w-md mx-auto">
                  <Text variant={TextVariants.label} color={TextColors.accent} className="mb-1">
                    {preset.description.title}
                  </Text>
                  <Text variant={TextVariants.small} color={TextColors.secondary} className="whitespace-pre-line">
                    {preset.description.content}
                  </Text>
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
  const toggleSource = usePresetGalleryStore((s) => s.toggleSource);
  const fetchSourcePresets = usePresetGalleryStore((s) => s.fetchSourcePresets);

  if (!source.enabled) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-accent" />
          <Text variant={TextVariants.heading}>{source.name}</Text>
          {source.isLoading && <Loader2 size={16} className="animate-spin text-accent" />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="h-8 px-2 text-text-secondary hover:text-text-primary"
            onClick={() => fetchSourcePresets(source.url)}
          >
            <RefreshCw size={14} />
          </Button>
          <Button
            variant="ghost"
            className="h-8 px-2 text-text-secondary hover:text-red-400"
            onClick={() => toggleSource(source.url)}
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      {source.error && (
        <div className="mb-4 p-3 bg-red-900/10 border border-red-500/50 rounded-lg">
          <Text color={TextColors.error}>{source.error}</Text>
        </div>
      )}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
      >
        {source.presets.map((preset, index) => (
          <PresetCard key={`${source.url}-${index}`} preset={preset} baseUrl={source.url} />
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
  const { sources, addSource, fetchAllEnabledSources } = usePresetGalleryStore();
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    fetchAllEnabledSources();
  }, []);

  const handleAddSource = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    addSource(trimmed);
    setNewUrl('');
  };

  const enabledSources = sources.filter((s) => s.enabled);
  const allPresetsCount = enabledSources.reduce((sum, s) => sum + s.presets.length, 0);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-bg-secondary rounded-lg overflow-hidden">
      <header className="p-4 shrink-0 flex items-center justify-between border-b border-surface gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            className="h-10 w-10 bg-surface text-text-primary shadow-none p-0 flex items-center justify-center"
            onClick={onBack}
            data-tooltip={t('presetGallery.backToLibrary', { defaultValue: '返回图库' })}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <Text variant={TextVariants.headline}>{t('presetGallery.title', { defaultValue: '在线样张' })}</Text>
            <Text variant={TextVariants.small} color={TextColors.secondary}>
              {t('presetGallery.subtitle', { count: allPresetsCount, defaultValue: '{{count}} 个预设样张' })}
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSource()}
              placeholder={t('presetGallery.addSourcePlaceholder', { defaultValue: '输入 JSON 链接...' })}
              className="w-64"
              bgClassName="bg-bg-primary"
            />
            <Button onClick={handleAddSource} className="h-10 px-3">
              <Plus size={16} />
            </Button>
          </div>
          <Button
            className="h-10 w-10 bg-surface text-text-primary shadow-none p-0 flex items-center justify-center"
            onClick={fetchAllEnabledSources}
            data-tooltip={t('presetGallery.refresh', { defaultValue: '刷新所有源' })}
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {enabledSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary">
            <Globe className="h-16 w-16 mb-4 opacity-30" />
            <Text variant={TextVariants.heading} color={TextColors.secondary}>
              {t('presetGallery.noSources', { defaultValue: '暂无在线样张源' })}
            </Text>
            <Text className="mt-2">
              {t('presetGallery.noSourcesDesc', { defaultValue: '在上方添加 JSON 链接或前往设置开启默认源' })}
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
