import { Home, SlidersHorizontal, Palette, UserCircle, FileInput, Crop, Layers, Wand2, Sparkles } from 'lucide-react';
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
}

const navItems: NavItem[] = [
  { panel: null, icon: Home, labelKey: 'editor.android.bottomNav.library' },
  { panel: Panel.Adjustments, icon: SlidersHorizontal, labelKey: 'editor.android.bottomNav.basic' },
  { panel: Panel.Color, icon: Palette, labelKey: 'editor.android.bottomNav.color' },
  { panel: Panel.Portrait, icon: UserCircle, labelKey: 'editor.android.bottomNav.portrait' },
  { panel: Panel.Crop, icon: Crop, labelKey: 'editor.android.bottomNav.crop' },
  { panel: Panel.Masks, icon: Layers, labelKey: 'editor.android.bottomNav.masks' },
  { panel: Panel.Ai, icon: Wand2, labelKey: 'editor.android.bottomNav.ai' },
  { panel: Panel.Presets, icon: Sparkles, labelKey: 'editor.android.bottomNav.presets' },
  { panel: Panel.Export, icon: FileInput, labelKey: 'editor.android.bottomNav.export' },
];

export default function AndroidBottomNav({ isAndroid }: AndroidBottomNavProps) {
  const { t } = useTranslation();
  const activeRightPanel = useUIStore((s) => s.activeRightPanel);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  if (!isAndroid) return null;

  return (
    <div className="flex items-center justify-around shrink-0 h-14 bg-bg-secondary border-t border-border-color">
      {navItems.map(({ panel, icon: Icon, labelKey }) => {
        const isActive = panel ? activeRightPanel === panel : activeRightPanel === null;
        return (
          <button
            key={labelKey}
            className={clsx(
              'flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-md transition-colors',
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
            <Icon size={20} />
            <span className="text-[10px] leading-tight">{t(labelKey as any)}</span>
          </button>
        );
      })}
    </div>
  );
}
