import React, { useCallback } from 'react';
import { User, Users, Baby, PersonStanding, Eraser, Sparkles, CircleDot, Eye, Smile, Palette, Scissors, Move } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import CollapsibleSection from '../../ui/CollapsibleSection';
import Slider from '../../ui/Slider';
import Switch from '../../ui/Switch';
import Text from '../../ui/Text';
import { TextColors, TextVariants } from '../../../types/typography';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../../store/useEditorStore';
import { useUIStore } from '../../../store/useUIStore';
import { useEditorActions } from '../../../hooks/useEditorActions';
import {
  Adjustments,
  PortraitAdjustments,
  INITIAL_PORTRAIT_ADJUSTMENTS,
  PersonAttribute,
} from '../../../utils/adjustments';

function PortraitSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onDragStateChange,
  fillOrigin,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  fillOrigin?: 'min' | 'default';
  onChange: (value: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}) {
  return (
    <Slider
      label={label}
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => onChange(Number(e.target.value))}
      onDragStateChange={onDragStateChange}
      fillOrigin={fillOrigin}
    />
  );
}

function ColorPickerRow({
  label,
  color,
  opacity,
  onColorChange,
  onOpacityChange,
  onDragStateChange,
}: {
  label: string;
  color: string;
  opacity: number;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-8 h-8 rounded border border-surface cursor-pointer bg-transparent"
        />
        <span className="text-sm text-text-secondary grow">{label}</span>
      </div>
      <Slider
        label={`${label} ${opacity}%`}
        value={opacity}
        min={0}
        max={100}
        step={1}
        onChange={(e) => onOpacityChange(Number(e.target.value))}
        onDragStateChange={onDragStateChange}
        fillOrigin="min"
      />
    </div>
  );
}

export default function PortraitPanelSwitcher() {
  const { t } = useTranslation();

  const attributes = [
    { key: 'single' as PersonAttribute, label: t('editor.portraitPanel.attributes.single'), icon: User },
    { key: 'male' as PersonAttribute, label: t('editor.portraitPanel.attributes.male'), icon: PersonStanding },
    { key: 'female' as PersonAttribute, label: t('editor.portraitPanel.attributes.female'), icon: PersonStanding },
    { key: 'child' as PersonAttribute, label: t('editor.portraitPanel.attributes.child'), icon: Baby },
    { key: 'elderMale' as PersonAttribute, label: t('editor.portraitPanel.attributes.elderMale'), icon: PersonStanding },
    { key: 'elderFemale' as PersonAttribute, label: t('editor.portraitPanel.attributes.elderFemale'), icon: PersonStanding },
    { key: 'all' as PersonAttribute, label: t('editor.portraitPanel.attributes.all'), icon: Users },
  ] as const;

  const { setAdjustments } = useEditorActions();

  const { collapsibleSectionsState, setUI } = useUIStore(
    useShallow((state) => ({
      collapsibleSectionsState: state.collapsibleSectionsState,
      setUI: state.setUI,
    })),
  );

  const {
    adjustments,
    isBlemishModeActive,
    setEditor,
  } = useEditorStore(
    useShallow((state) => ({
      adjustments: state.adjustments,
      isBlemishModeActive: state.isBlemishModeActive,
      setEditor: state.setEditor,
    })),
  );

  const portrait = adjustments.portrait || INITIAL_PORTRAIT_ADJUSTMENTS;
  const personAttribute = portrait.personAttribute || 'all';
  const sectionVisibility = adjustments.sectionVisibility || {};

  const setCollapsibleState = useCallback(
    (updater: any) =>
      setUI((state) => ({
        collapsibleSectionsState: typeof updater === 'function' ? updater(state.collapsibleSectionsState) : updater,
      })),
    [setUI],
  );

  const onDragStateChange = useCallback(
    (isDragging: boolean) => setEditor({ isSliderDragging: isDragging }),
    [setEditor],
  );

  const updatePortrait = useCallback(
    (key: keyof PortraitAdjustments, value: any) => {
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        portrait: {
          ...(prev.portrait || INITIAL_PORTRAIT_ADJUSTMENTS),
          [key]: value,
        },
      }));
    },
    [setAdjustments],
  );

  const handleToggleSection = (section: string) => {
    setCollapsibleState((prev: any) => {
      const isOpening = !prev[section];
      return { ...prev, [section]: !prev[section] };
    });
  };

  const handleOneClickBeauty = useCallback(() => {
    setAdjustments((prev: Adjustments) => ({
      ...prev,
      portrait: {
        ...(prev.portrait || INITIAL_PORTRAIT_ADJUSTMENTS),
        skinSmoothingStrength: 35,
        skinSmoothingDetailPreserve: 65,
        faceSlimAmount: 25,
        jawAmount: -10,
        eyeEnlargeAmount: 20,
        eyeBrightenAmount: 25,
        teethWhitenBrightness: 30,
        teethWhitenDesaturate: 25,
        lipstickColor: '#D44D5C',
        lipstickOpacity: 25,
        blushColor: '#E8919C',
        blushOpacity: 20,
        eyebrowColor: '#6B4423',
        eyebrowOpacity: 15,
      },
    }));
  }, [setAdjustments]);

  const handleRemoveLastBlemish = useCallback(() => {
    setAdjustments((prev: Adjustments) => {
      const currentPortrait = prev.portrait || INITIAL_PORTRAIT_ADJUSTMENTS;
      const spots = [...currentPortrait.blemishSpots];
      spots.pop();
      return {
        ...prev,
        portrait: { ...currentPortrait, blemishSpots: spots },
      };
    });
  }, [setAdjustments]);

  const toggleBlemishMode = useCallback(() => {
    setEditor((state) => ({ isBlemishModeActive: !state.isBlemishModeActive }));
  }, [setEditor]);

  const portraitSections = [
    {
      key: 'blemishRemoval',
      title: t('editor.portraitPanel.blemishRemoval'),
      icon: Eraser,
      content: (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={toggleBlemishMode}
              className={clsx(
                'flex-1 text-xs font-medium py-2 rounded-md transition-colors',
                isBlemishModeActive
                  ? 'bg-accent text-button-text'
                  : 'bg-surface text-text-secondary hover:text-text-primary',
              )}
            >
              {isBlemishModeActive ? t('editor.portraitPanel.blemishActive') : t('editor.portraitPanel.blemishStart')}
            </button>
            <button
              onClick={handleRemoveLastBlemish}
              disabled={portrait.blemishSpots.length === 0}
              className="flex-1 text-xs font-medium py-2 rounded-md bg-surface text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              {t('editor.portraitPanel.blemishUndo')}
            </button>
          </div>
          {portrait.blemishSpots.length > 0 && (
            <Text variant={TextVariants.small} className="text-text-secondary">
              {t('editor.portraitPanel.blemishCount', { count: portrait.blemishSpots.length })}
            </Text>
          )}
          {isBlemishModeActive && (
            <div className="w-full py-2 px-3 bg-accent/10 rounded-md border border-dashed border-accent/50">
              <Text variant={TextVariants.small} className="text-accent">
                {t('editor.portraitPanel.blemishHint')}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'skinSmoothing',
      title: t('editor.portraitPanel.skinSmoothing'),
      icon: Sparkles,
      content: (
        <div className="space-y-1">
          <PortraitSlider
            label={t('editor.portraitPanel.skinSmoothingStrength')}
            value={portrait.skinSmoothingStrength}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('skinSmoothingStrength', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
          <PortraitSlider
            label={t('editor.portraitPanel.skinSmoothingDetailPreserve')}
            value={portrait.skinSmoothingDetailPreserve}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('skinSmoothingDetailPreserve', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
        </div>
      ),
    },
    {
      key: 'faceReshape',
      title: t('editor.portraitPanel.faceReshape'),
      icon: CircleDot,
      content: (
        <div className="space-y-1">
          <PortraitSlider
            label={t('editor.portraitPanel.faceSlimAmount')}
            value={portrait.faceSlimAmount}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('faceSlimAmount', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
          <PortraitSlider
            label={t('editor.portraitPanel.jawAmount')}
            value={portrait.jawAmount}
            min={-50}
            max={50}
            onChange={(v) => updatePortrait('jawAmount', v)}
            onDragStateChange={onDragStateChange}
          />
          <PortraitSlider
            label={t('editor.portraitPanel.foreheadAmount')}
            value={portrait.foreheadAmount}
            min={-50}
            max={50}
            onChange={(v) => updatePortrait('foreheadAmount', v)}
            onDragStateChange={onDragStateChange}
          />
        </div>
      ),
    },
    {
      key: 'eyeEnhance',
      title: t('editor.portraitPanel.eyeEnhance'),
      icon: Eye,
      content: (
        <div className="space-y-1">
          <PortraitSlider
            label={t('editor.portraitPanel.eyeEnlargeAmount')}
            value={portrait.eyeEnlargeAmount}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('eyeEnlargeAmount', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
          <PortraitSlider
            label={t('editor.portraitPanel.eyeBrightenAmount')}
            value={portrait.eyeBrightenAmount}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('eyeBrightenAmount', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
        </div>
      ),
    },
    {
      key: 'teethWhiten',
      title: t('editor.portraitPanel.teethWhiten'),
      icon: Smile,
      content: (
        <div className="space-y-1">
          <PortraitSlider
            label={t('editor.portraitPanel.teethWhitenBrightness')}
            value={portrait.teethWhitenBrightness}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('teethWhitenBrightness', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
          <PortraitSlider
            label={t('editor.portraitPanel.teethWhitenDesaturate')}
            value={portrait.teethWhitenDesaturate}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('teethWhitenDesaturate', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
        </div>
      ),
    },
    {
      key: 'makeup',
      title: t('editor.portraitPanel.makeup'),
      icon: Palette,
      content: (
        <div className="space-y-2">
          <ColorPickerRow
            label={t('editor.portraitPanel.lipstick')}
            color={portrait.lipstickColor}
            opacity={portrait.lipstickOpacity}
            onColorChange={(c) => updatePortrait('lipstickColor', c)}
            onOpacityChange={(v) => updatePortrait('lipstickOpacity', v)}
            onDragStateChange={onDragStateChange}
          />
          <ColorPickerRow
            label={t('editor.portraitPanel.blush')}
            color={portrait.blushColor}
            opacity={portrait.blushOpacity}
            onColorChange={(c) => updatePortrait('blushColor', c)}
            onOpacityChange={(v) => updatePortrait('blushOpacity', v)}
            onDragStateChange={onDragStateChange}
          />
          <ColorPickerRow
            label={t('editor.portraitPanel.eyebrow')}
            color={portrait.eyebrowColor}
            opacity={portrait.eyebrowOpacity}
            onColorChange={(c) => updatePortrait('eyebrowColor', c)}
            onOpacityChange={(v) => updatePortrait('eyebrowOpacity', v)}
            onDragStateChange={onDragStateChange}
          />
        </div>
      ),
    },
    {
      key: 'hairAdjust',
      title: t('editor.portraitPanel.hairAdjust'),
      icon: Scissors,
      content: (
        <div className="space-y-1">
          <PortraitSlider
            label={t('editor.portraitPanel.hairHueShift')}
            value={portrait.hairHueShift}
            min={-180}
            max={180}
            onChange={(v) => updatePortrait('hairHueShift', v)}
            onDragStateChange={onDragStateChange}
          />
          <PortraitSlider
            label={t('editor.portraitPanel.hairBrightness')}
            value={portrait.hairBrightness}
            min={-50}
            max={50}
            onChange={(v) => updatePortrait('hairBrightness', v)}
            onDragStateChange={onDragStateChange}
          />
        </div>
      ),
    },
    {
      key: 'bodyReshape',
      title: t('editor.portraitPanel.bodyReshape'),
      icon: Move,
      content: (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1 py-1">
            <Text variant={TextVariants.small} color={TextColors.secondary}>
              {t('editor.portraitPanel.bodySymmetry')}
            </Text>
            <Switch
              label={t('editor.portraitPanel.bodySymmetry')}
              checked={portrait.bodySymmetryEnabled}
              onChange={(checked: boolean) => updatePortrait('bodySymmetryEnabled', checked)}
            />
          </div>
          <PortraitSlider
            label={t('editor.portraitPanel.bodySlimAmount')}
            value={portrait.bodySlimAmount}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('bodySlimAmount', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
          <PortraitSlider
            label={t('editor.portraitPanel.bodyHeightAmount')}
            value={portrait.bodyHeightAmount}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('bodyHeightAmount', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
          <PortraitSlider
            label={t('editor.portraitPanel.legLengthAmount')}
            value={portrait.legLengthAmount}
            min={0}
            max={100}
            onChange={(v) => updatePortrait('legLengthAmount', v)}
            onDragStateChange={onDragStateChange}
            fillOrigin="min"
          />
        </div>
      ),
    },
  ];

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
                onClick={() => updatePortrait('personAttribute', attr.key)}
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
        <button
          onClick={handleOneClickBeauty}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
        >
          <Sparkles size={14} />
          {t('editor.portraitPanel.oneClickBeauty')}
        </button>
      </div>
      <div className="grow overflow-y-scroll p-4 flex flex-col gap-2">
        {portraitSections.map((section) => (
          <div className="shrink-0 group" key={section.key}>
            <CollapsibleSection
              isOpen={collapsibleSectionsState[section.key as keyof typeof collapsibleSectionsState]}
              onToggle={() => handleToggleSection(section.key)}
              title={section.title}
              isContentVisible={sectionVisibility[section.key] !== false}
            >
              {section.content}
            </CollapsibleSection>
          </div>
        ))}
      </div>
    </div>
  );
}
