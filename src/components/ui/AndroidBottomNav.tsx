import { Home, SlidersHorizontal, Palette, UserCircle, FileInput } from 'lucide-react';
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
  { panel: Panel.Export, icon: FileInput, labelKey: 'editor.android.bottomNav.export' },
];

export default function AndroidBottomNav({ isAndroid }: AndroidBottomNavProps) {
  const { t } = useTranslation();
  const activeRightPanel = useUIStore((s) => s.activeRightPanel);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const isAndroidLandscape = useUIStore((s) => s.isAndroidLandscape);

  if (!isAndroid) return null;

  // Landscape: vertical side rail on the left edge
  if (isAndroidLandscape) {
    return (
      <div className="flex flex-col items-center justify-around shrink-0 w-12 bg-bg-secondary border-r border-border-color">
        {navItems.map(({ panel, icon: Icon, labelKey }) => {
          const isActive = panel ? activeRightPanel === panel : activeRightPanel === null;
          return (
            <button
              key={labelKey}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-md transition-colors',
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
              <span className="text-[9px] leading-tight font-medium tracking-wide">{t(labelKey as any)}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Portrait: horizontal bottom bar
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
            <Icon size={22} strokeWidth={1.8} />
            <span className="text-[11px] leading-tight font-medium tracking-wide">{t(labelKey as any)}</span>
          </button>
        );
      })}
    </div>
  );
}
