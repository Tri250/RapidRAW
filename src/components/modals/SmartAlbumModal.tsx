import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import Text from '../ui/Text';
import { TextVariants, TextColors } from '../../types/typography';
import { useLibraryStore, SmartAlbum, SmartAlbumCondition } from '../../store/useLibraryStore';
import { ImageFile } from '../ui/AppProperties';

interface SmartAlbumModalProps {
  isOpen: boolean;
  onClose(): void;
  images: ImageFile[];
}

const FIELD_OPTIONS: { value: SmartAlbumCondition['field']; labelKey: string }[] = [
  { value: 'rating', labelKey: 'library.smartAlbum.fieldRating' },
  { value: 'colorLabel', labelKey: 'library.smartAlbum.fieldColorLabel' },
  { value: 'tag', labelKey: 'library.smartAlbum.fieldTag' },
  { value: 'dateModified', labelKey: 'library.smartAlbum.fieldDateModified' },
  { value: 'dateTaken', labelKey: 'library.smartAlbum.fieldDateTaken' },
  { value: 'cameraModel', labelKey: 'library.smartAlbum.fieldCameraModel' },
  { value: 'isEdited', labelKey: 'library.smartAlbum.fieldIsEdited' },
];

const OPERATOR_OPTIONS: { value: SmartAlbumCondition['operator']; labelKey: string }[] = [
  { value: 'equals', labelKey: 'library.smartAlbum.opEquals' },
  { value: 'greaterThan', labelKey: 'library.smartAlbum.opGreaterThan' },
  { value: 'lessThan', labelKey: 'library.smartAlbum.opLessThan' },
  { value: 'contains', labelKey: 'library.smartAlbum.opContains' },
  { value: 'between', labelKey: 'library.smartAlbum.opBetween' },
];

export default function SmartAlbumModal({ isOpen, onClose, images }: SmartAlbumModalProps) {
  const { t } = useTranslation();
  const addSmartAlbum = useLibraryStore((s: any) => s.addSmartAlbum);
  const getSmartAlbumImages = useLibraryStore((s: any) => s.getSmartAlbumImages);

  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<SmartAlbumCondition[]>([
    { field: 'rating', operator: 'greaterThan', value: 0 },
  ]);
  const [isMounted, setIsMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const timer = setTimeout(() => setShow(true), 10);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
      const timer = setTimeout(() => {
        setIsMounted(false);
        setName('');
        setConditions([{ field: 'rating', operator: 'greaterThan', value: 0 }]);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const previewAlbum: SmartAlbum = useMemo(
    () => ({ id: '__preview__', name, conditions, isSmart: true }),
    [name, conditions],
  );

  const matchCount = useMemo(
    () => (conditions.length > 0 ? getSmartAlbumImages(images, previewAlbum).length : 0),
    [images, previewAlbum, getSmartAlbumImages, conditions.length],
  );

  const updateCondition = useCallback((index: number, patch: Partial<SmartAlbumCondition>) => {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }, []);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { field: 'rating', operator: 'greaterThan', value: 0 }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreate = useCallback(() => {
    if (!name.trim() || conditions.length === 0) return;
    addSmartAlbum({
      id: `smart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim(),
      conditions: [...conditions],
      isSmart: true,
    });
    onClose();
  }, [name, conditions, addSmartAlbum, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCreate();
      else if (e.key === 'Escape') onClose();
    },
    [handleCreate, onClose],
  );

  if (!isMounted) return null;

  return (
    <div
      aria-modal="true"
      className={`
        fixed inset-0 flex items-center justify-center z-50
        bg-black/30 backdrop-blur-xs
        transition-opacity duration-300 ease-in-out
        ${show ? 'opacity-100' : 'opacity-0'}
      `}
      onClick={onClose}
      role="dialog"
    >
      <div
        className={`
          bg-surface rounded-lg shadow-xl p-6 w-full max-w-md
          max-h-[80vh] overflow-y-auto custom-scrollbar
          transform transition-all duration-300 ease-out
          ${show ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 -translate-y-4'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <Text variant={TextVariants.title} className="mb-4">
          {t('library.smartAlbum.create')}
        </Text>

        <div className="mb-4">
          <Text variant={TextVariants.label} className="mb-1.5">
            {t('library.smartAlbum.name')}
          </Text>
          <input
            autoFocus
            className="w-full bg-bg-primary text-text-primary border border-border rounded-md px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-accent"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('library.smartAlbum.name')}
            type="text"
            value={name}
          />
        </div>

        <div className="mb-4">
          <Text variant={TextVariants.label} className="mb-2">
            {t('library.smartAlbum.conditions')}
          </Text>
          <div className="space-y-2">
            {conditions.map((condition, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className="flex-1 bg-bg-primary text-text-primary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent"
                  value={condition.field}
                  onChange={(e) =>
                    updateCondition(index, { field: e.target.value as SmartAlbumCondition['field'] })
                  }
                >
                  {FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey as any)}
                    </option>
                  ))}
                </select>
                <select
                  className="flex-1 bg-bg-primary text-text-primary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent"
                  value={condition.operator}
                  onChange={(e) =>
                    updateCondition(index, { operator: e.target.value as SmartAlbumCondition['operator'] })
                  }
                >
                  {OPERATOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey as any)}
                    </option>
                  ))}
                </select>
                {condition.operator === 'between' ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      className="w-full bg-bg-primary text-text-primary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent"
                      onChange={(e) => {
                        const val = condition.value || [0, 0];
                        updateCondition(index, { value: [Number(e.target.value), val[1]] });
                      }}
                      placeholder="Min"
                      type="number"
                      value={condition.value?.[0] ?? ''}
                    />
                    <Text variant={TextVariants.small} color={TextColors.secondary}>
                      -
                    </Text>
                    <input
                      className="w-full bg-bg-primary text-text-primary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent"
                      onChange={(e) => {
                        const val = condition.value || [0, 0];
                        updateCondition(index, { value: [val[0], Number(e.target.value)] });
                      }}
                      placeholder="Max"
                      type="number"
                      value={condition.value?.[1] ?? ''}
                    />
                  </div>
                ) : condition.field === 'isEdited' ? (
                  <select
                    className="flex-1 bg-bg-primary text-text-primary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent"
                    value={String(condition.value)}
                    onChange={(e) => updateCondition(index, { value: e.target.value === 'true' })}
                  >
                    <option value="true">{t('library.smartAlbum.valueTrue')}</option>
                    <option value="false">{t('library.smartAlbum.valueFalse')}</option>
                  </select>
                ) : (
                  <input
                    className="flex-1 bg-bg-primary text-text-primary border border-border rounded-md px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent"
                    onChange={(e) => {
                      const val =
                        condition.field === 'rating' ||
                        condition.field === 'dateModified' ||
                        condition.field === 'dateTaken'
                          ? Number(e.target.value)
                          : e.target.value;
                      updateCondition(index, { value: val });
                    }}
                    placeholder={t('library.smartAlbum.valuePlaceholder')}
                    type={
                      condition.field === 'rating' || condition.field === 'dateModified' || condition.field === 'dateTaken'
                        ? 'number'
                        : 'text'
                    }
                    value={condition.value ?? ''}
                  />
                )}
                {conditions.length > 1 && (
                  <button
                    type="button"
                    className="p-1 rounded text-text-secondary hover:text-red-500 hover:bg-surface transition-colors shrink-0"
                    onClick={() => removeCondition(index)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 flex items-center gap-1.5 text-accent hover:text-accent-hover text-sm transition-colors"
            onClick={addCondition}
          >
            <Plus size={14} />
            {t('library.smartAlbum.addField')}
          </button>
        </div>

        <div className="mb-5">
          <Text variant={TextVariants.small} color={TextColors.secondary}>
            {t('library.smartAlbum.preview', { count: matchCount })}
          </Text>
        </div>

        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 rounded-md text-text-secondary hover:bg-surface transition-colors"
            onClick={onClose}
          >
            {t('modals.createFolder.cancel')}
          </button>
          <button
            className="px-4 py-2 rounded-md bg-accent text-button-text font-semibold hover:bg-accent-hover disabled:bg-gray-500 disabled:text-white disabled:cursor-not-allowed transition-colors"
            disabled={!name.trim() || conditions.length === 0}
            onClick={handleCreate}
          >
            {t('library.smartAlbum.createButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
