import { useState, useRef, useEffect, useCallback } from 'react';
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
  MoreHorizontal,
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

import { Panel } from './AppProperties';
import { useUIStore } from '../../store/useUIStore';

interface AndroidBottomNavProps {
  isAndroid: boolean;
  onBackToLibrary?: () => void;
}

interface NavItem {
  panel: Panel | null;
  icon: typeof Home;
  labelKey: string;
}

// Primary items always visible in the bottom nav (5 items for comfortable touch targets)
const primaryNavItems: NavItem[] = [
  { panel: null, icon: Home, labelKey: 'editor.android.bottomNav.library' },
  { panel: Panel.Adjustments, icon: SlidersHorizontal, labelKey: 'editor.android.bottomNav.basic' },
  { panel: Panel.Crop, icon: Crop, labelKey: 'editor.android.bottomNav.crop' },
  { panel: Panel.Masks, icon: Layers, labelKey: 'editor.android.bottomNav.masks' },
  { panel: Panel.Ai, icon: Paintbrush, labelKey: 'editor.android.bottomNav.ai' },
];

// Secondary items accessible via "More" menu
const secondaryNavItems: NavItem[] = [
  { panel: Panel.Color, icon: Palette, labelKey: 'editor.android.bottomNav.color' },
  { panel: Panel.Portrait, icon: UserCircle, labelKey: 'editor.android.bottomNav.portrait' },
  { panel: Panel.Metadata, icon: Info, labelKey: 'editor.android.bottomNav.metadata' },
  { panel: Panel.Presets, icon: SwatchBook, labelKey: 'editor.android.bottomNav.presets' },
  { panel: Panel.Export, icon: FileInput, labelKey: 'editor.android.bottomNav.export' },
];

const allNavItems = [...primaryNavItems, ...secondaryNavItems];

export default function AndroidBottomNav({ isAndroid, onBackToLibrary }: AndroidBottomNavProps) {
  const { t } = useTranslation();
  const activeRightPanel = useUIStore((s) => s.activeRightPanel);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Check if the active panel is a secondary item (show it as "active" in More button)
  const isSecondaryActive = secondaryNavItems.some((item) => item.panel === activeRightPanel);

  const handlePanelSelect = useCallback(
    (panel: Panel | null) => {
      if (panel === null) {
        if (onBackToLibrary) {
          onBackToLibrary();
        }
        setRightPanel(null);
      } else {
        setRightPanel(activeRightPanel === panel ? null : panel);
      }
      setIsMoreOpen(false);
    },
    [activeRightPanel, onBackToLibrary, setRightPanel],
  );

  // Close "More" menu when tapping outside
  useEffect(() => {
    if (!isMoreOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMoreOpen]);

  if (!isAndroid) return null;

  return (
    <div className="relative shrink-0 h-14 bg-bg-secondary border-t border-border-color">
      <div className="flex items-center justify-around h-full px-1">
        {primaryNavItems.map(({ panel, icon: Icon, labelKey }) => {
          const isActive = panel ? activeRightPanel === panel : activeRightPanel === null;
          return (
            <button
              key={labelKey}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors flex-1 min-w-[56px] min-h-[44px] active:opacity-70',
                isActive ? 'text-accent' : 'text-text-secondary',
              )}
              onClick={() => handlePanelSelect(panel)}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span className="text-[10px] leading-tight font-medium tracking-wide whitespace-nowrap">
                {t(labelKey as any)}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <div ref={moreMenuRef} className="relative flex-1">
          <button
            className={clsx(
              'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[56px] min-h-[44px] w-full active:opacity-70',
              isMoreOpen || isSecondaryActive ? 'text-accent' : 'text-text-secondary',
            )}
            onClick={() => setIsMoreOpen((prev) => !prev)}
          >
            {isSecondaryActive && !isMoreOpen ? (
              // Show the icon of the active secondary panel
              (() => {
                const activeSecondary = secondaryNavItems.find((item) => item.panel === activeRightPanel);
                const ActiveIcon = activeSecondary?.icon || MoreHorizontal;
                return <ActiveIcon size={20} strokeWidth={1.8} />;
              })()
            ) : (
              <MoreHorizontal size={20} strokeWidth={1.8} />
            )}
            <span className="text-[10px] leading-tight font-medium tracking-wide whitespace-nowrap">
              {isSecondaryActive && !isMoreOpen
                ? t(secondaryNavItems.find((item) => item.panel === activeRightPanel)?.labelKey as any)
                : t('editor.android.bottomNav.more')}
            </span>
          </button>

          {/* More menu popup */}
          {isMoreOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-bg-primary border border-border-color rounded-xl shadow-xl shadow-black/40 py-1 min-w-[140px] z-50">
              {secondaryNavItems.map(({ panel, icon: Icon, labelKey }) => {
                const isActive = activeRightPanel === panel;
                return (
                  <button
                    key={labelKey}
                    className={clsx(
                      'flex items-center gap-3 w-full px-4 py-3 text-left transition-colors active:bg-card-active',
                      isActive ? 'text-accent bg-accent/10' : 'text-text-primary',
                    )}
                    onClick={() => handlePanelSelect(panel)}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span className="text-sm font-medium">{t(labelKey as any)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
