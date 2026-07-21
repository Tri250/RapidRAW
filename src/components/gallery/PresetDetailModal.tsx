import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Wand2, Tag, User, FileText } from 'lucide-react';
import { PresetImageCarousel } from './PresetImageCarousel';
import type { GalleryPreset } from '../../types/subscription';
import { resolvePresetString } from '../../utils/presetStringResolver';

interface PresetDetailModalProps {
  preset: GalleryPreset | null;
  onClose: () => void;
  onDownload: (preset: GalleryPreset) => void;
}

export function PresetDetailModal({ preset, onClose, onDownload }: PresetDetailModalProps) {
  const handleDownload = useCallback(() => {
    if (preset) onDownload(preset);
  }, [preset, onDownload]);

  return (
    <AnimatePresence>
      {preset && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Image Carousel */}
            <PresetImageCarousel images={preset.galleryUrls} />

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">{preset.name}</h2>
                    {preset.isNew && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase">
                        NEW
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-zinc-400">
                    <User className="w-3.5 h-3.5" />
                    <span className="text-sm">{preset.creator}</span>
                  </div>
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>

              {/* Description */}
              {preset.description && (
                <div className="flex items-start gap-2 text-zinc-300">
                  <FileText className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
                  <p className="text-sm leading-relaxed">{preset.description}</p>
                </div>
              )}

              {/* Tags */}
              {preset.tags && preset.tags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Tag className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
                  <div className="flex flex-wrap gap-1.5">
                    {preset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-xs border border-zinc-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Adjustments Preview */}
              {preset.adjustments && typeof preset.adjustments === 'object' && (
                <div className="border-t border-zinc-800 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Wand2 className="w-4 h-4 text-zinc-500" />
                    <h3 className="text-sm font-semibold text-zinc-300">Adjustment Parameters</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(preset.adjustments as Record<string, unknown>)
                      .filter(([key]) => !['masks', 'lutPath', 'aiPatches', 'toneCurve', 'geometry'].includes(key))
                      .slice(0, 9)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="px-2.5 py-1.5 rounded-md bg-zinc-800/50 border border-zinc-800"
                        >
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wide truncate">
                            {resolvePresetString(key.replace(/([A-Z])/g, ' $1').trim(), 'en')}
                          </div>
                          <div className="text-xs text-zinc-300 font-mono truncate">
                            {typeof value === 'number' ? value.toFixed(2) : resolvePresetString(String(value), 'en')}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
