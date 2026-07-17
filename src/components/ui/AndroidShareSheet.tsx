import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Share2, MessageCircle, X } from 'lucide-react';
import { Invokes } from './AppProperties';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import Text from './Text';
import { TextVariants } from '../../types/typography';

interface AndroidShareSheetProps {
  filePath: string;
  mimeType: string;
  visible: boolean;
  onClose: () => void;
}

interface ShareTarget {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
}

const SHARE_TARGETS: ShareTarget[] = [
  { id: 'wechat', labelKey: 'androidShare.wechat', icon: <MessageCircle size={20} /> },
  { id: 'qq', labelKey: 'androidShare.qq', icon: <MessageCircle size={20} /> },
  { id: 'weibo', labelKey: 'androidShare.weibo', icon: <MessageCircle size={20} /> },
  { id: 'more', labelKey: 'androidShare.more', icon: <Share2 size={20} /> },
];

export default function AndroidShareSheet({
  filePath,
  mimeType,
  visible,
  onClose,
}: AndroidShareSheetProps) {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(
    async (targetId: string) => {
      if (sharing) return;
      setSharing(true);
      try {
        await invoke(Invokes.ShareImage, {
          filePath,
          mimeType,
          title: t('androidShare.title' as any, { target: t(`androidShare.${targetId}` as any) }),
        });
      } catch (err) {
        console.error('Share failed:', err);
      } finally {
        setSharing(false);
        onClose();
      }
    },
    [filePath, mimeType, sharing, t, onClose],
  );

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-bg-primary rounded-t-2xl z-50 shadow-lg border-t border-surface"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface">
              <Text variant={TextVariants.title}>{t('androidShare.titleDefault' as any)}</Text>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-surface transition-colors"
              >
                <X size={20} className="text-text-secondary" />
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-4 gap-4">
                {SHARE_TARGETS.map((target) => (
                  <button
                    key={target.id}
                    onClick={() => handleShare(target.id)}
                    disabled={sharing}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-surface transition-colors disabled:opacity-50"
                  >
                    <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-text-primary">
                      {target.icon}
                    </div>
                    <Text variant={TextVariants.small} className="text-text-secondary">
                      {t(target.labelKey as any)}
                    </Text>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 pt-0">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-surface text-text-secondary font-medium text-sm hover:bg-card-active transition-colors"
              >
                {t('androidShare.cancel' as any)}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
