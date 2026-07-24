import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, ImageIcon, Loader2, RefreshCw, Search, Users, Layers, Crop, Tag, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { siGithub } from 'simple-icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Invokes, SupportedTypes, ImageFile } from '../ui/AppProperties';
import { INITIAL_ADJUSTMENTS } from '../../utils/adjustments';
import Text from '../ui/Text';
import { TextColors, TextVariants, TextWeights } from '../../types/typography';
import Dropdown from '../ui/Dropdown';

const DEFAULT_PREVIEW_IMAGE_URL = 'https://raw.githubusercontent.com/CyberTimon/RapidRAW-Presets/main/sample-image.jpg';

interface CommunityPreset {
  name: string;
  creator: string;
  adjustments: Record<string, any>;
  includeMasks?: boolean;
  includeCropTransform?: boolean;
  presetType?: 'tool' | 'style';
  sourceName?: string;
  source?: string;
  coverPath?: string;
  galleryImages?: string[];
  tags?: string[];
  description?: { title: string; content: string };
  sections?: { title: string; items: { label: string; value: string; span: number }[] }[];
}

const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
};

interface CommunityPageProps {
  onBackToLibrary: () => void;
  supportedTypes: SupportedTypes | null;
  imageList: ImageFile[];
  currentFolderPath: string | null;
}

const shuffleArray = (array: any[]) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const CommunityPage = React.memo(({ onBackToLibrary, imageList, currentFolderPath }: CommunityPageProps) => {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<CommunityPreset[]>([]);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewImagePaths, setPreviewImagePaths] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'idle' | 'downloading' | 'success'>>({});
  const [allPreviewsLoaded, setAllPreviewsLoaded] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [expandedPresets, setExpandedPresets] = useState<Record<string, boolean>>({});
  const [galleryState, setGalleryState] = useState<{ images: string[]; currentIndex: number } | null>(null);
  const [coverErrors, setCoverErrors] = useState<Record<string, number>>({});

  const sortMethods = useMemo(() => [{ value: 'name', label: t('library.community.sortMethods.name') }], [t]);

  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  const fetchDefaultPreviewImage = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(DEFAULT_PREVIEW_IMAGE_URL);
      const blob = await response.blob();
      const tempPath: string = await invoke(Invokes.SaveTempFile, {
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      });
      return tempPath;
    } catch (error) {
      console.error('Failed to fetch default preview image:', error);
      return null;
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const communityPresets: CommunityPreset[] = await invoke(Invokes.FetchCommunityPresets);
      setPresets(communityPresets);
    } catch (error) {
      console.error('Failed to fetch community presets:', error);
      setFetchError(String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();

    return () => {
      Object.values(previewsRef.current).forEach((url) => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [fetchPresets]);

  useEffect(() => {
    const setupPreviewImages = async () => {
      setPreviews({});
      setPreviewError(null);

      if (!currentFolderPath || imageList.length === 0) {
        setPreviewImagePaths([]);
        return;
      }

      const shuffled = shuffleArray(imageList);

      if (imageList.length === 1) {
        setPreviewImagePaths([imageList[0].path]);
      } else if (imageList.length >= 2 && imageList.length <= 3) {
        setPreviewImagePaths(shuffled.slice(0, 2).map((img) => img.path));
      } else if (imageList.length >= 4) {
        setPreviewImagePaths(shuffled.slice(0, 4).map((img) => img.path));
      }
    };

    setupPreviewImages();
  }, [imageList, currentFolderPath]);

  useEffect(() => {
    if (presets.length === 0 || previewImagePaths.length === 0) {
      setAllPreviewsLoaded(true);
      return;
    }

    const presetHasCover = (p: CommunityPreset) => !!p.coverPath;
    const presetsNeedingPreview = presets.filter((p) => !presetHasCover(p));
    if (presetsNeedingPreview.length === 0) {
      setAllPreviewsLoaded(true);
      return;
    }

    const generateAllPreviews = async () => {
      setAllPreviewsLoaded(false);
      try {
        const previewDataMap: Record<string, number[]> = await invoke(Invokes.GenerateAllCommunityPreviews, {
          imagePaths: previewImagePaths,
          presets: presetsNeedingPreview.map((p) => ({
            ...p,
            adjustments: { ...INITIAL_ADJUSTMENTS, ...p.adjustments },
          })),
        });

        const newPreviews: Record<string, string | null> = {};
        for (const [presetName, imageData] of Object.entries(previewDataMap)) {
          const blob = new Blob([new Uint8Array(imageData)], { type: 'image/jpeg' });
          newPreviews[presetName] = URL.createObjectURL(blob);
        }

        setPreviews((prev) => {
          Object.values(prev).forEach((url) => url?.startsWith('blob:') && URL.revokeObjectURL(url));
          return newPreviews;
        });
      } catch (error) {
        console.error(`Failed to generate previews:`, error);
      } finally {
        setAllPreviewsLoaded(true);
      }
    };

    generateAllPreviews();
  }, [presets, previewImagePaths]);

  const handleDownloadPreset = useCallback(async (preset: CommunityPreset) => {
    setDownloadStatus((prev) => ({ ...prev, [preset.name]: 'downloading' }));
    try {
      if (!preset.adjustments) {
        throw new Error('Preset adjustments are missing.');
      }

      await invoke(Invokes.SaveCommunityPreset, {
        name: preset.name,
        adjustments: preset.adjustments,
        includeMasks: preset.includeMasks,
        includeCropTransform: preset.includeCropTransform,
        presetType: preset.presetType || 'style',
      });
      setDownloadStatus((prev) => ({ ...prev, [preset.name]: 'success' }));
    } catch (error) {
      console.error(`Failed to download preset ${preset.name}:`, error);
      setDownloadStatus((prev) => ({ ...prev, [preset.name]: 'idle' }));
    }
  }, []);

  const filteredAndSortedPresets = useMemo(() => {
    return presets
      .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [presets, searchTerm, sortBy]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-bg-secondary rounded-lg overflow-hidden p-4">
      <header className="shrink-0 flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            className="hover:bg-surface text-text-primary rounded-full"
            onClick={onBackToLibrary}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft size={18} />
          </Button>
          <div>
            <Text variant={TextVariants.heading} className="flex items-center gap-1.5 text-sm">
              <Users size={16} /> {t('library.community.headerTitle')}
            </Text>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchPresets}
          disabled={isLoading}
          className="flex items-center gap-1.5 h-8"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{t('library.community.refresh') || 'Refresh'}</span>
        </Button>
      </header>

      {previewError && !isLoading && presets.length > 0 && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <Text variant={TextVariants.small} color={TextColors.secondary}>
            {previewError}
          </Text>
        </div>
      )}

      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="relative flex-1 min-w-[120px] max-w-[200px]">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('library.community.searchPlaceholder')}
            className="pl-8 h-8 text-sm"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Text variant={TextVariants.label}>{t('library.community.sortBy')}</Text>
          <Dropdown options={sortMethods} value={sortBy} onChange={(value) => setSortBy(value)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
        {fetchError && !isLoading && (
          <div className="flex flex-col items-center justify-center h-48 gap-4">
            <Text variant={TextVariants.heading} color={TextColors.secondary}>
              {t('library.community.fetchError') || 'Failed to load presets'}
            </Text>
            <Text variant={TextVariants.small} color={TextColors.secondary}>
              {fetchError}
            </Text>
            <Button variant="secondary" size="sm" onClick={fetchPresets}>
              <RefreshCw size={14} className="mr-1.5" />
              {t('library.community.retry') || 'Retry'}
            </Button>
          </div>
        )}
        {!fetchError && !isLoading && presets.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Users size={32} className="text-text-secondary" />
            <Text variant={TextVariants.heading} color={TextColors.secondary}>
              {t('library.community.noPresets') || 'No community presets available'}
            </Text>
          </div>
        )}
        {isLoading ? (
          <Text
            variant={TextVariants.heading}
            color={TextColors.secondary}
            weight={TextWeights.normal}
            className="flex items-center justify-center h-full "
          >
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            {t('library.community.fetchingPresets')}
          </Text>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {filteredAndSortedPresets.map((preset) => {
                const previewUrl = previews[preset.name];
                const status = downloadStatus[preset.name] || 'idle';
                const isExpanded = expandedPresets[preset.name] || false;
                const coverErrorCount = coverErrors[preset.name] || 0;
                const coverRetryLimit = 2;
                const coverPath =
                  preset.coverPath && coverErrorCount <= coverRetryLimit
                    ? `${preset.coverPath}${preset.coverPath.includes('?') ? '&' : '?'}retry=${coverErrorCount}`
                    : undefined;
                const hasCoverImage = !!coverPath;
                const hasGallery = !!(preset.galleryImages && preset.galleryImages.length > 0);
                const hasTags = !!(preset.tags && preset.tags.length > 0);
                const hasDescription = !!(preset.description && preset.description.content);

                const coverInlineStyle: React.CSSProperties | undefined = coverPath
                  ? {
                      backgroundImage: `url("${coverPath}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }
                  : undefined;

                return (
                  <motion.div
                    key={preset.name}
                    layout
                    variants={itemVariants}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-surface rounded-lg overflow-hidden group border border-border-color flex flex-col"
                  >
                    <div
                      className="relative w-full aspect-square bg-bg-primary flex items-center justify-center cursor-pointer overflow-hidden"
                      style={coverInlineStyle}
                      onClick={() => {
                        if (hasGallery) {
                          setGalleryState({ images: preset.galleryImages!, currentIndex: 0 });
                        }
                      }}
                    >
                      {hasCoverImage ? (
                        <img
                          src={coverPath}
                          alt={preset.name}
                          className="w-full h-full object-cover transition-all duration-300 group-hover:blur-xs group-hover:brightness-75"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            const img = e.currentTarget;
                            // Fallback to default preview image on first error
                            if (coverErrorCount === 0 && !img.dataset.fallbackTried) {
                              img.dataset.fallbackTried = '1';
                              img.src = DEFAULT_PREVIEW_IMAGE_URL;
                              return;
                            }
                            setCoverErrors((prev) => ({
                              ...prev,
                              [preset.name]: (prev[preset.name] || 0) + 1,
                            }));
                          }}
                        />
                      ) : null}
                      {(!hasCoverImage && previewUrl) ? (
                        <img
                          src={previewUrl}
                          alt={preset.name}
                          className="w-full h-full object-cover transition-all duration-300 group-hover:blur-xs group-hover:brightness-75"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                      {(!hasCoverImage && !previewUrl && allPreviewsLoaded) ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-text-secondary bg-bg-primary/60 backdrop-blur-sm w-full h-full">
                          <div className="text-3xl font-bold tracking-wider opacity-70">
                            {preset.name.slice(0, 2)}
                          </div>
                          <Text variant={TextVariants.small} color={TextColors.secondary} className="opacity-70">
                            {preset.sourceName || t('library.community.noPreview', { defaultValue: 'No preview' })}
                          </Text>
                        </div>
                      ) : null}
                      {(!hasCoverImage && !previewUrl && !allPreviewsLoaded) ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-text-secondary">
                          <Loader2 className="h-8 w-8 animate-spin text-text-secondary" />
                        </div>
                      ) : null}

                      {hasGallery && (
                        <div className="absolute top-2 right-2 bg-black/50 rounded-full px-2 py-0.5 text-white text-xs flex items-center gap-1">
                          <ImageIcon size={12} />
                          {preset.galleryImages!.length}
                        </div>
                      )}

                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDownloadPreset(preset);
                          }}
                          disabled={status !== 'idle'}
                          className="shadow-lg"
                        >
                          {status === 'idle' && <>{t('library.community.actionSave')}</>}
                          {status === 'downloading' && (
                            <>
                              <Loader2 size={14} className="mr-2 animate-spin" /> {t('library.community.actionSaving')}
                            </>
                          )}
                          {status === 'success' && (
                            <>
                              <CheckCircle2 size={14} className="mr-2" /> {t('library.community.actionSaved')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="p-4 text-center">
                      {preset.sourceName && (
                        <Text variant={TextVariants.small} color={TextColors.secondary} className="mb-1 opacity-60">
                          {preset.sourceName}
                        </Text>
                      )}
                      <Text variant={TextVariants.heading} className="truncate mb-1">
                        {preset.name}
                      </Text>
                      <Text variant={TextVariants.small} className="font-['cursive'] italic">
                        {t('library.community.presetBy', { creator: preset.creator })}
                      </Text>

                      {hasTags && (
                        <div className="flex flex-wrap justify-center gap-1 mt-2">
                          {preset.tags!.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs"
                            >
                              <Tag size={10} />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {hasDescription && (
                        <div className="mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPresets((prev) => ({ ...prev, [preset.name]: !isExpanded }));
                            }}
                            className="flex items-center gap-1 mx-auto text-xs text-text-secondary hover:text-text-primary transition-colors"
                          >
                            {preset.description!.title}
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-2 text-xs text-text-secondary text-left leading-relaxed"
                            >
                              {preset.description!.content}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-8 py-4"
        >
          <Text>
            {t('library.community.footerHeading')}
            <br />
            <a
              href="https://github.com/CyberTimon/RapidRAW-Presets/issues/new?assignees=&labels=preset-submission&template=preset_submission.md&title=Preset+Submission%3A+%5BYour+Preset+Name%5D"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-2"
            >
              <span
                dangerouslySetInnerHTML={{
                  __html: siGithub.svg.replace(
                    'xmlns="http://www.w3.org/2000/svg"',
                    'xmlns="http://www.w3.org/2000/svg" fill="currentColor"',
                  ),
                }}
                style={{ display: 'inline-block', width: 14, height: 14 }}
              />
              {t('library.community.footerLinkText')}
            </a>
          </Text>
        </motion.div>

        {/* Gallery Modal */}
        <AnimatePresence>
          {galleryState && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              onClick={() => setGalleryState(null)}
            >
              <button
                className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                onClick={() => setGalleryState(null)}
              >
                <X size={28} />
              </button>

              {galleryState.images.length > 1 && (
                <>
                  <button
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors bg-black/30 rounded-full p-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGalleryState((prev) => prev && {
                        ...prev,
                        currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length,
                      });
                    }}
                  >
                    <ChevronLeft size={28} />
                  </button>
                  <button
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors bg-black/30 rounded-full p-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGalleryState((prev) => prev && {
                        ...prev,
                        currentIndex: (prev.currentIndex + 1) % prev.images.length,
                      });
                    }}
                  >
                    <ChevronRight size={28} />
                  </button>
                </>
              )}

              <div
                className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={galleryState.images[galleryState.currentIndex]}
                  alt={`Gallery image ${galleryState.currentIndex + 1}`}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg"
                />
              </div>

              {galleryState.images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                  {galleryState.currentIndex + 1} / {galleryState.images.length}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

export default CommunityPage;
