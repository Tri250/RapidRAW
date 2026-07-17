import React, { useCallback, useState } from 'react';
import { RotateCcw, Copy, ClipboardPaste, User, Users, Baby, PersonStanding } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import DetailsPanel from '../../adjustments/Details';
import EffectsPanel from '../../adjustments/Effects';
import CollapsibleSection from '../../ui/CollapsibleSection';
import { Adjustments, SectionVisibility, INITIAL_ADJUSTMENTS, ADJUSTMENT_SECTIONS } from '../../../utils/adjustments';
import { useContextMenu } from '../../../context/ContextMenuContext';
import { OPTION_SEPARATOR } from '../../ui/AppProperties';
import Text from '../../ui/Text';
import { TextVariants } from '../../../types/typography';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../../store/useEditorStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useUIStore } from '../../../store/useUIStore';
import { useEditorActions } from '../../../hooks/useEditorActions';

export default function PortraitPanelSwitcher() {
  const { t } = useTranslation();
  const { showContextMenu } = useContextMenu();
  const [personAttribute, setPersonAttribute] = useState<'single' | 'male' | 'female' | 'child' | 'elderMale' | 'elderFemale' | 'all'>('all');

  const attributes = [
    { key: 'single', label: '单人', icon: User },
    { key: 'male', label: '男', icon: PersonStanding },
    { key: 'female', label: '女', icon: PersonStanding },
    { key: 'child', label: '儿童', icon: Baby },
    { key: 'elderMale', label: '长辈男', icon: PersonStanding },
    { key: 'elderFemale', label: '长辈女', icon: PersonStanding },
    { key: 'all', label: '所有人', icon: Users },
  ] as const;
  const { setAdjustments, handleLutSelect, setLutPreviewOverride } = useEditorActions();

  const { appSettings, theme } = useSettingsStore(
    useShallow((state) => ({
      appSettings: state.appSettings,
      theme: state.theme,
    })),
  );

  const { collapsibleSectionsState, setUI } = useUIStore(
    useShallow((state) => ({
      collapsibleSectionsState: state.collapsibleSectionsState,
      setUI: state.setUI,
    })),
  );

  const {
    adjustments,
    copiedSectionAdjustments,
    histogram,
    isWbPickerActive,
    setEditor,
  } = useEditorStore(
    useShallow((state) => ({
      adjustments: state.adjustments,
      copiedSectionAdjustments: state.copiedSectionAdjustments,
      histogram: state.histogram,
      isWbPickerActive: state.isWbPickerActive,
      setEditor: state.setEditor,
    })),
  );

  const setCollapsibleState = useCallback(
    (updater: any) =>
      setUI((state) => ({
        collapsibleSectionsState: typeof updater === 'function' ? updater(state.collapsibleSectionsState) : updater,
      })),
    [setUI],
  );

  const toggleWbPicker = useCallback(
    () => setEditor((state) => ({ isWbPickerActive: !state.isWbPickerActive })),
    [setEditor],
  );

  const onDragStateChange = useCallback(
    (isDragging: boolean) => setEditor({ isSliderDragging: isDragging }),
    [setEditor],
  );

  const handleToggleVisibility = (sectionName: string) => {
    setAdjustments((prev: Adjustments) => {
      const currentVisibility: SectionVisibility = prev.sectionVisibility || INITIAL_ADJUSTMENTS.sectionVisibility;
      return {
        ...prev,
        sectionVisibility: {
          ...currentVisibility,
          [sectionName]: !currentVisibility[sectionName],
        },
      };
    });
  };

  const handleToggleSection = (section: string) => {
    setCollapsibleState((prev: any) => {
      const isOpening = !prev[section];
      if (appSettings?.enableFocusMode && isOpening) {
        const newState = { ...prev };
        Object.keys(newState).forEach((key) => {
          newState[key] = false;
        });
        newState[section] = true;
        return newState;
      }
      return { ...prev, [section]: !prev[section] };
    });
  };

  const handleSectionContextMenu = (event: any, sectionName: string) => {
    event.preventDefault();
    event.stopPropagation();

    const sectionKeys = ADJUSTMENT_SECTIONS[sectionName as keyof typeof ADJUSTMENT_SECTIONS];
    if (!sectionKeys) return;

    const handleCopy = () => {
      const adjustmentsToCopy: any = {};
      for (const key of sectionKeys) {
        if (Object.prototype.hasOwnProperty.call(adjustments, key)) {
          adjustmentsToCopy[key] = JSON.parse(JSON.stringify(adjustments[key as keyof Adjustments]));
        }
      }
      setEditor({ copiedSectionAdjustments: { section: sectionName, values: adjustmentsToCopy } });
    };

    const handlePaste = () => {
      const copiedSection = useEditorStore.getState().copiedSectionAdjustments;
      if (!copiedSection || copiedSection.section !== sectionName) return;
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        ...copiedSection.values,
        sectionVisibility: {
          ...(prev.sectionVisibility || INITIAL_ADJUSTMENTS.sectionVisibility),
          [sectionName]: true,
        },
      }));
    };

    const handleReset = () => {
      const resetValues: any = {};
      for (const key of sectionKeys) {
        resetValues[key] = JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS[key as keyof Adjustments]));
      }
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        ...resetValues,
        sectionVisibility: {
          ...(prev.sectionVisibility || INITIAL_ADJUSTMENTS.sectionVisibility),
          [sectionName]: true,
        },
      }));
    };

    const currentCopiedSection = useEditorStore.getState().copiedSectionAdjustments;
    const isPasteAllowed = currentCopiedSection && currentCopiedSection.section === sectionName;
    const translatedSection = t(`editor.adjustments.sections.${sectionName}`);

    const pasteLabel = currentCopiedSection
      ? t('editor.adjustments.actions.pasteLabel', { section: translatedSection })
      : t('editor.adjustments.actions.pasteSettings');

    const options: any = [
      { label: t('editor.adjustments.actions.copySectionSettings', { section: translatedSection }), icon: Copy, onClick: handleCopy },
      { label: pasteLabel, icon: ClipboardPaste, onClick: handlePaste, disabled: !isPasteAllowed },
      { type: OPTION_SEPARATOR },
      { label: t('editor.adjustments.actions.resetSectionSettings', { section: translatedSection }), icon: RotateCcw, onClick: handleReset },
    ];

    showContextMenu(event.clientX, event.clientY, options);
  };

  const portraitSections = ['details', 'effects'];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex justify-between items-center shrink-0 border-b border-surface">
        <Text variant={TextVariants.title}>{t('editor.portraitPanel.title')}</Text>
      </div>
      <div className="px-4 pt-3 pb-1 shrink-0 border-b border-surface/50">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {attributes.map((attr) => {
            const Icon = attr.icon;
            return (
              <button
                key={attr.key}
                onClick={() => setPersonAttribute(attr.key)}
                className={clsx(
                  'shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  personAttribute === attr.key
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-transparent border-border-color text-text-secondary hover:text-text-primary',
                )}
              >
                <Icon size={12} />
                {attr.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grow overflow-y-scroll p-4 flex flex-col gap-2">
        {portraitSections.map((sectionName: string) => {
          const SectionComponent: any = {
            details: DetailsPanel,
            effects: EffectsPanel,
          }[sectionName];

          const title = t(`editor.adjustments.sections.${sectionName}`);
          const sectionVisibility = adjustments.sectionVisibility || INITIAL_ADJUSTMENTS.sectionVisibility;

          return (
            <div className="shrink-0 group" key={sectionName}>
              <CollapsibleSection
                isContentVisible={sectionVisibility[sectionName as keyof SectionVisibility]}
                isOpen={collapsibleSectionsState[sectionName as keyof typeof collapsibleSectionsState]}
                onContextMenu={(e: any) => handleSectionContextMenu(e, sectionName)}
                onToggle={() => handleToggleSection(sectionName)}
                onToggleVisibility={() => handleToggleVisibility(sectionName)}
                title={title}
              >
                <SectionComponent
                  adjustments={adjustments}
                  setAdjustments={setAdjustments}
                  histogram={histogram}
                  theme={theme}
                  handleLutSelect={handleLutSelect}
                  onLutHover={setLutPreviewOverride}
                  appSettings={appSettings}
                  isWbPickerActive={isWbPickerActive}
                  toggleWbPicker={toggleWbPicker}
                  onDragStateChange={onDragStateChange}
                />
              </CollapsibleSection>
            </div>
          );
        })}
      </div>
    </div>
  );
}
