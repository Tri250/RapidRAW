import { memo } from 'react';
import { motion } from 'framer-motion';
import { Download, Sparkles, Tag } from 'lucide-react';
import type { GalleryPreset } from '../../types/subscription';

interface PresetGalleryCardProps {
  preset: GalleryPreset;
  index: number;
  onClick: () => void;
  onDownload: (e: React.MouseEvent) => void;
}

const HEIGHTS = [200, 240, 220, 260];

function getCardHeight(index: number): number {
  return HEIGHTS[index % 4];
}

export const PresetGalleryCard = memo(function PresetGalleryCard({
  preset,
  index,
  onClick,
  onDownload,
}: PresetGalleryCardProps) {
  const height = getCardHeight(index);
  const coverUrl = preset.coverUrl || preset.galleryUrls[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03, ease: 'easeOut' }}
      className="break-inside-avoid mb-4 group cursor-pointer"
      onClick={onClick}
    >
      <div
        className="relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
        style={{ height }}
      >
        {/* Cover Image */}
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={preset.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800">
            <Sparkles className="w-8 h-8 text-zinc-600" />
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* NEW Badge */}
        {preset.isNew && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wide">
            NEW
          </div>
        )}

        {/* Download Button */}
        <button
          onClick={onDownload}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          title="Download preset"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Bottom Info */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="text-sm font-semibold text-white truncate">{preset.name}</h3>
          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{preset.creator}</p>

          {/* Tags */}
          {preset.tags && preset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {preset.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/10 text-[9px] text-zinc-300"
                >
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
              {preset.tags.length > 2 && (
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] text-zinc-400">
                  +{preset.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});
