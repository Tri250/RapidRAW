import {
  Home,
  SlidersHorizontal,
  Palette,
  UserCircle,
  Crop,
  Layers,
  Paintbrush,
  Info,
  SwatchBook,
  FileInput,
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

import { Panel } from './AppProperties';
import { useUIStore } from '../../store/useUIStore';

interface AndroidBottomNavProps {
  isAndroid: boolean;
}

interface NavItem {
  panel: Panel | null;
  icon: typeof Home;
  labelKey: string;
  a11yKey: string;
}

const navItems: NavItem[] = [
  { panel: null, icon: Home, labelKey: 'editor.android.bottomNav.library', a11yKey: 'editor.android.openLibrary' },
  {
    panel: Panel.Adjustments,
    icon: SlidersHorizontal,
    labelKey: 'editor.android.bottomNav.basic',
    a11yKey: 'editor.android.openBasicPanel',
  },
  {
    panel: Panel.Color,
    icon: Palette,
    labelKey: 'editor.android.bottomNav.color',
    a11yKey: 'editor.android.openColorPanel',
  },
  {
    panel: Panel.Portrait,
    icon: UserCircle,
    labelKey: 'editor.android.bottomNav.portrait',
    a11yKey: 'editor.android.openPortraitPanel',
  },
  { panel: Panel.Crop, icon: Crop, labelKey: 'editor.android.bottomNav.crop', a11yKey: 'editor.android.openCropPanel' },
  {
    panel: Panel.Masks,
    icon: Layers,
    labelKey: 'editor.android.bottomNav.masks',
    a11yKey: 'editor.android.openMasksPanel',
  },
  { panel: Panel.Ai, icon: Paintbrush, labelKey: 'editor.android.bottomNav.ai', a11yKey: 'editor.android.openAiPanel' },
  {
    panel: Panel.Metadata,
    icon: Info,
    labelKey: 'editor.android.bottomNav.metadata',
    a11yKey: 'editor.android.openMetadataPanel',
  },
  {
    panel: Panel.Presets,
    icon: SwatchBook,
    labelKey: 'editor.android.bottomNav.presets',
    a11yKey: 'editor.android.openPresetsPanel',
  },
  {
    panel: Panel.Export,
    icon: FileInput,
    labelKey: 'editor.android.bottomNav.export',
    a11yKey: 'editor.android.openExportPanel',
  },
];

export default function AndroidBottomNav({ isAndroid }: AndroidBottomNavProps) {
  const { t } = useTranslation();
  const activeRightPanel = useUIStore((s) => s.activeRightPanel);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  if (!isAndroid) return null;

  return (
    <div className="flex items-center shrink-0 h-14 bg-bg-secondary border-t border-border-color overflow-x-auto scrollbar-hide">
      <div className="flex items-center justify-around min-w-full px-1">
        {navItems.map(({ panel, icon: Icon, labelKey, a11yKey }) => {
          const isActive = panel ? activeRightPanel === panel : activeRightPanel === null;
          return (
            <button
              key={labelKey}
              aria-label={t(a11yKey as any)}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors flex-1 min-w-[64px]',
                isActive ? 'text-accent' : 'text-text-secondary',
              )}
              onClick={() => {
                if (panel === null) {
                  setRightPanel(null);
                } else {
                  setRightPanel(activeRightPanel === panel ? null : panel);
                }
              }}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span className="text-[10px] leading-tight font-medium tracking-wide whitespace-nowrap">
                {t(labelKey as any)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
