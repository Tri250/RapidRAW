import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/useEditorStore';

const AUTOSAVE_KEY = 'raw_workshop_autosave_adjustments';
const AUTOSAVE_PATH_KEY = 'raw_workshop_autosave_path';
const AUTOSAVE_INTERVAL = 3000; // 3 seconds

export function useAdjustmentAutoSave() {
  const adjustments = useEditorStore((s) => s.adjustments);
  const selectedImage = useEditorStore((s) => s.selectedImage);
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    const data = JSON.stringify({ adjustments, path: selectedImage?.path });
    if (data === lastSavedRef.current) return;

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(adjustments));
        localStorage.setItem(AUTOSAVE_PATH_KEY, selectedImage?.path || '');
        lastSavedRef.current = data;
      } catch (e) {
        console.warn('Auto-save failed:', e);
      }
    }, AUTOSAVE_INTERVAL);

    return () => clearTimeout(timer);
  }, [adjustments, selectedImage?.path]);
}

export function getAutoSavedAdjustments(): { adjustments: any; path: string } | null {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    const path = localStorage.getItem(AUTOSAVE_PATH_KEY);
    if (saved && path) {
      return { adjustments: JSON.parse(saved), path };
    }
  } catch (e) {
    console.warn('Failed to load auto-saved adjustments:', e);
  }
  return null;
}

export function clearAutoSavedAdjustments() {
  localStorage.removeItem(AUTOSAVE_KEY);
  localStorage.removeItem(AUTOSAVE_PATH_KEY);
}
