import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Loader2, Search, Users, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { SupportedTypes, ImageFile } from '../ui/AppProperties';
import Text from '../ui/Text';
import { TextVariants, TextColors } from '../../types/typography';
import { PresetGalleryCard } from '../gallery/PresetGalleryCard';
import { PresetDetailModal } from '../gallery/PresetDetailModal';
import { SubscriptionPanel } from '../gallery/SubscriptionPanel';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';
import type { GalleryPreset } from '../../types/subscription';

interface CommunityPageProps {
  onBackToLibrary: () => void;
  supportedTypes: SupportedTypes | null;
  imageList: ImageFile[];
  currentFolderPath: string | null;
}

const TAB_ALL = 'all';
const TAB_NEW = 'new';
const TAB_DOWNLOADED = 'downloaded';

const CommunityPage = ({ onBackToLibrary }: CommunityPageProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(TAB_ALL);
  const [searchTerm, setSearchTerm] = useState('');
  const [_downloadStatus, setDownloadStatus] = useState<Record<string, 'idle' | 'downloading' | 'success'>>({});
  const [selectedPreset, setSelectedPreset] = useState<GalleryPreset | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    galleryPresets,
    isGalleryLoading,
    initSubscriptions,
    loadGalleryPresets,
    downloadPreset,
    setGalleryFilter,
    getFilteredPresets,
    galleryTag,
    setGalleryTag,
  } = useSubscriptionStore();

  // Initialize subscriptions on mount
  useEffect(() => {
    initSubscriptions();
  }, [initSubscriptions]);

  // Update filter when search changes
  useEffect(() => {
    setGalleryFilter(searchTerm);
  }, [searchTerm, setGalleryFilter]);

  const filteredPresets = useMemo(() => {
    const base = getFilteredPresets();

    switch (activeTab) {
      case TAB_NEW:
        return base.filter((p) => p.isNew);
      case TAB_DOWNLOADED:
        // Downloaded presets would need tracking; for now show all
        return base;
      default:
        return base;
    }
  }, [getFilteredPresets, activeTab]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    galleryPresets.forEach((p) => p.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [galleryPresets]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadGalleryPresets();
    setIsRefreshing(false);
  }, [loadGalleryPresets]);

  const handleDownload = useCallback(async (preset: GalleryPreset) => {
    setDownloadStatus((prev) => ({ ...prev, [preset.id]: 'downloading' }));
    try {
      await downloadPreset(preset);
      setDownloadStatus((prev) => ({ ...prev, [preset.id]: 'success' }));
      setTimeout(() => {
        setDownloadStatus((prev) => ({ ...prev, [preset.id]: 'idle' }));
      }, 2000);
    } catch (error) {
      console.error('Failed to download preset:', error);
      setDownloadStatus((prev) => ({ ...prev, [preset.id]: 'idle' }));
    }
  }, [downloadPreset]);

  const handleCardDownload = useCallback((e: React.MouseEvent, preset: GalleryPreset) => {
    e.stopPropagation();
    handleDownload(preset);
  }, [handleDownload]);

  const tabs = [
    { key: TAB_ALL, label: 'All' },
    { key: TAB_NEW, label: 'New' },
    { key: TAB_DOWNLOADED, label: 'Downloaded' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-bg-secondary rounded-lg overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Button
            className="hover:bg-surface text-text-primary rounded-full"
            onClick={onBackToLibrary}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft />
          </Button>
          <div>
            <Text variant={TextVariants.headline} className="flex items-center gap-2">
              <Users /> {t('library.community.headerTitle')}
            </Text>
            <Text className="text-xs text-zinc-500">
              {galleryPresets.length} presets from subscriptions
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            title="Refresh presets"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Subscription Management */}
        <div className="w-72 shrink-0 border-r border-zinc-800 overflow-y-auto custom-scrollbar">
          <SubscriptionPanel />

          {/* Tag Filter */}
          {allTags.length > 0 && (
            <div className="px-4 py-3">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setGalleryTag(galleryTag === tag ? null : tag)}
                    className={`px-2 py-1 rounded-md text-xs transition-colors ${
                      galleryTag === tag
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-zinc-800 gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-64">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('library.community.searchPlaceholder')}
                className="pl-10 w-full"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            </div>
          </div>

          {/* Gallery Grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            {isGalleryLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-text-secondary mr-3" />
                <Text variant={TextVariants.heading} color={TextColors.secondary}>
                  Loading presets...
                </Text>
              </div>
            ) : filteredPresets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <Sparkles className="w-12 h-12 mb-3 opacity-30" />
                <Text variant={TextVariants.heading} color={TextColors.secondary}>
                  No presets found
                </Text>
                <Text className="text-sm mt-1">
                  Try adjusting your search or add a subscription
                </Text>
              </div>
            ) : (
              <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
                {filteredPresets.map((preset, index) => (
                  <PresetGalleryCard
                    key={preset.id}
                    preset={preset}
                    index={index}
                    onClick={() => setSelectedPreset(preset)}
                    onDownload={(e) => handleCardDownload(e, preset)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <PresetDetailModal
        preset={selectedPreset}
        onClose={() => setSelectedPreset(null)}
        onDownload={handleDownload}
      />
    </div>
  );
};

export default CommunityPage;
