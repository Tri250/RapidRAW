import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Text from '../ui/Text';
import { TextColors, TextVariants, TextWeights } from '../../types/typography';

interface PrivacyConsentModalProps {
  isOpen: boolean;
  onAgree(): void;
  onDecline(): void;
}

export default function PrivacyConsentModal({ isOpen, onAgree, onDecline }: PrivacyConsentModalProps) {
  const { t } = useTranslation();
  const [isMounted, setIsMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const timer = setTimeout(() => setShow(true), 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <div
      aria-labelledby="privacy-consent-title"
      aria-modal="true"
      role="dialog"
      className={`
        fixed inset-0 flex items-center justify-center z-[100]
        bg-black/50 backdrop-blur-sm
        transition-opacity duration-300 ease-in-out
        ${show ? 'opacity-100' : 'opacity-0'}
      `}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`
          bg-surface rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4
          transform transition-all duration-300 ease-out
          ${show ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 -translate-y-4'}
        `}
        onClick={(e: any) => e.stopPropagation()}
      >
        <Text variant={TextVariants.title} id="privacy-consent-title" className="mb-4">
          {t('privacy.title')}
        </Text>

        <div className="max-h-[50vh] overflow-y-auto mb-6 pr-1 space-y-3 text-sm">
          <Text color={TextColors.secondary}>{t('privacy.intro')}</Text>

          <div>
            <Text weight={TextWeights.bold} className="mb-1">
              {t('privacy.permissionsTitle')}
            </Text>
            <Text color={TextColors.secondary}>{t('privacy.permissionsDesc')}</Text>
          </div>

          <div>
            <Text weight={TextWeights.bold} className="mb-1">
              {t('privacy.noCollectionTitle')}
            </Text>
            <Text color={TextColors.secondary}>{t('privacy.noCollectionDesc')}</Text>
          </div>

          <div>
            <Text weight={TextWeights.bold} className="mb-1">
              {t('privacy.aiTitle')}
            </Text>
            <Text color={TextColors.secondary}>{t('privacy.aiDesc')}</Text>
          </div>

          <div>
            <Text weight={TextWeights.bold} className="mb-1">
              {t('privacy.storageTitle')}
            </Text>
            <Text color={TextColors.secondary}>{t('privacy.storageDesc')}</Text>
          </div>

          <Text color={TextColors.secondary} className="text-xs">
            {t('privacy.fullPolicy')}
          </Text>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-divider">
          <Button
            className="bg-bg-primary shadow-transparent hover:bg-bg-primary text-white shadow-none focus:outline-hidden focus:ring-0"
            onClick={onDecline}
            variant="ghost"
            tabIndex={0}
          >
            {t('privacy.decline')}
          </Button>
          <Button
            onClick={onAgree}
            variant="primary"
            autoFocus={true}
            className="focus:outline-hidden focus:ring-0 focus:ring-offset-0"
          >
            {t('privacy.agree')}
          </Button>
        </div>
      </div>
    </div>
  );
}
