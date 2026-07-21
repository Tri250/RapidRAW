import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { dirname } from '@tauri-apps/api/path';
import debounce from 'lodash.debounce';
import { Adjustments, COPYABLE_ADJUSTMENT_KEYS, ADJUSTMENT_GROUPS, INITIAL_ADJUSTMENTS } from '../utils/adjustments';
import { Folder, Invokes, Preset } from '../components/ui/AppProperties';

export enum PresetListType {
  Folder = 'folder',
  Preset = 'preset',
}

export interface UserPreset {
  folder?: Folder;
  id?: string | undefined;
  name?: string | undefined;
  preset?: Preset;
}

function arrayMove(array: any, from: any, to: any) {
  const newArray = array.slice();
  const [item] = newArray.splice(from, 1);
  newArray.splice(to, 0, item);
  return newArray;
}

export function usePresets(currentAdjustments: Adjustments) {
  const [presets, setPresets] = useState<Array<UserPreset>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPresets = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedPresets: Array<UserPreset> = await invoke(Invokes.LoadPresets);
      setPresets(loadedPresets);
    } catch (error) {
      console.error('Failed to load presets:', error);
      setPresets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const savePresetsToBackend = useCallback(
    debounce((presetsToSave: Array<UserPreset>) => {
      invoke(Invokes.SavePresets, { presets: presetsToSave }).catch((err) =>
        console.error('Failed to save presets:', err),
      );
    }, 500),
    [],
  );

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const safeUuid = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch {
        // fall through to the fallback below
      }
    }
    // RFC4122 v4 fallback when crypto.randomUUID is unavailable.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const addPreset = (
    name: string,
    folderId: string | null = null,
    includeMasks: boolean = false,
    includeCropTransform: boolean = false,
    presetType: Preset['presetType'] = 'style',
  ) => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return null;
    }

    const GEOMETRY_KEYS = ADJUSTMENT_GROUPS.geometry.flatMap((group) => group.keys);
    const MASK_KEYS = ADJUSTMENT_GROUPS.masks.flatMap((group) => group.keys);

    const presetAdjustments: Record<string, any> = {};

    for (const key of COPYABLE_ADJUSTMENT_KEYS) {
      if (!includeMasks && MASK_KEYS.includes(key)) continue;
      if (!includeCropTransform && GEOMETRY_KEYS.includes(key)) continue;

      if (Object.prototype.hasOwnProperty.call(currentAdjustments, key)) {
        const currentValue = currentAdjustments[key as keyof Adjustments];
        const defaultValue = INITIAL_ADJUSTMENTS[key as keyof Adjustments];

        if (presetType === 'tool') {
          if (JSON.stringify(currentValue) !== JSON.stringify(defaultValue)) {
            presetAdjustments[key] = currentValue;
          }
        } else {
          presetAdjustments[key] = currentValue;
        }
      }
    }

    // Generate a unique preset name within the destination folder (or root).
    const targetNames = new Set<string>();
    for (const item of presets) {
      if (folderId && item.folder?.id === folderId) {
        for (const child of item.folder.children) targetNames.add(child.name);
      } else if (item.preset) {
        targetNames.add(item.preset.name);
      } else if (item.folder) {
        for (const child of item.folder.children) targetNames.add(child.name);
      }
    }
    let finalName = trimmedName;
    if (targetNames.has(finalName)) {
      let counter = 2;
      while (targetNames.has(`${finalName} (${counter})`)) {
        counter += 1;
      }
      finalName = `${finalName} (${counter})`;
    }

    const newPresetData: Preset = {
      adjustments: presetAdjustments,
      id: safeUuid(),
      name: finalName,
      includeMasks,
      includeCropTransform,
      presetType,
    };

    let updatedPresets: Array<UserPreset>;
    if (folderId) {
      let folderFound = false;
      updatedPresets = presets.map((item: UserPreset) => {
        if (item.folder && item.folder.id === folderId) {
          folderFound = true;
          return {
            folder: {
              ...item.folder,
              children: [...item.folder.children, newPresetData],
            },
          };
        }
        return item;
      });
      // If folderId was specified but no matching folder exists, fall back
      // to adding at the root rather than silently dropping the preset.
      if (!folderFound) {
        updatedPresets = [...updatedPresets, { preset: newPresetData }];
      }
    } else {
      updatedPresets = [...presets, { preset: newPresetData }];
    }

    setPresets(updatedPresets);
    savePresetsToBackend(updatedPresets);
    return newPresetData;
  };

  const addFolder = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return;
    }

    setPresets((currentPresets: Array<any>) => {
      // Ensure folder names are unique. If a folder with the same name (case
      // insensitive) already exists, append " (n)" to keep the list usable.
      const usedNames = new Set(
        currentPresets
          .filter((p: UserPreset) => !!p.folder)
          .map((p: UserPreset) => (p.folder?.name || '').toLowerCase()),
      );
      let finalName = trimmed;
      if (usedNames.has(finalName.toLowerCase())) {
        let counter = 2;
        while (usedNames.has(`${finalName} (${counter})`.toLowerCase())) {
          counter += 1;
        }
        finalName = `${finalName} (${counter})`;
      }

      const newFolder = {
        folder: {
          id: safeUuid(),
          name: finalName,
          children: [],
        },
      };

      const updatedPresets = [...currentPresets];
      const firstPresetIndex = updatedPresets.findIndex((p: UserPreset) => p.preset);

      if (firstPresetIndex === -1) {
        updatedPresets.push(newFolder);
      } else {
        updatedPresets.splice(firstPresetIndex, 0, newFolder);
      }

      savePresetsToBackend(updatedPresets);
      return updatedPresets;
    });
  };

  const deleteItem = (id: string) => {
    let updatedPresets = presets.filter((item: UserPreset) => item.preset?.id !== id && item.folder?.id !== id);
    updatedPresets = updatedPresets.map((item: UserPreset) => {
      if (item.folder) {
        return {
          folder: {
            ...item.folder,
            children: item.folder.children.filter((child: any) => child.id !== id),
          },
        };
      }
      return item;
    });
    setPresets(updatedPresets);
    savePresetsToBackend(updatedPresets);
  };

  const deleteItems = (ids: string[]) => {
    const idSet = new Set(ids.filter(Boolean));
    if (idSet.size === 0) {
      return;
    }
    let updatedPresets = presets.filter(
      (item: UserPreset) => item.preset?.id === undefined || !idSet.has(item.preset.id),
    );
    updatedPresets = updatedPresets
      .map((item: UserPreset) => {
        if (!item.folder) return item;
        if (item.folder.id && idSet.has(item.folder.id)) return null;
        return {
          folder: {
            ...item.folder,
            children: item.folder.children.filter((child: any) => !idSet.has(child.id)),
          },
        };
      })
      .filter((item): item is UserPreset => item !== null);
    setPresets(updatedPresets);
    savePresetsToBackend(updatedPresets);
  };

  const renameItem = (id: string | null, newName: string) => {
    if (!id) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) return;

    // Check if anything actually changes; if not, skip the save to avoid
    // spamming the backend with no-op writes.
    let didChange = false;
    for (const item of presets) {
      if (item.preset?.id === id && item.preset.name !== trimmed) {
        didChange = true;
        break;
      }
      if (item.folder?.id === id && item.folder.name !== trimmed) {
        didChange = true;
        break;
      }
      if (item.folder) {
        const child = item.folder.children.find((c: any) => c.id === id);
        if (child && child.name !== trimmed) {
          didChange = true;
          break;
        }
      }
    }
    if (!didChange) return;

    const updatedPresets = presets.map((item: UserPreset) => {
      if (item.preset?.id === id) {
        return { preset: { ...item.preset, name: trimmed } };
      }
      if (item.folder?.id === id) {
        return { folder: { ...item.folder, name: trimmed } };
      }
      if (item.folder) {
        return {
          folder: {
            ...item.folder,
            children: item.folder.children.map((child: any) =>
              child.id === id ? { ...child, name: trimmed } : child,
            ),
          },
        };
      }
      return item;
    });
    setPresets(updatedPresets);
    savePresetsToBackend(updatedPresets);
  };

  const configurePreset = (
    id: string | null,
    name: string,
    includeMasks: boolean,
    includeCropTransform: boolean,
    presetType: Preset['presetType'],
  ) => {
    let existingPreset: Preset | null = null;

    for (const item of presets) {
      if (item.preset?.id === id) {
        existingPreset = item.preset;
        break;
      }
      if (item.folder) {
        const found = item.folder.children.find((p: Preset) => p.id === id);
        if (found) {
          existingPreset = found;
          break;
        }
      }
    }

    if (!existingPreset) return null;

    let newAdjustments: Record<string, any> = { ...existingPreset.adjustments };
    const oldType = existingPreset.presetType || 'style';

    const GEOMETRY_KEYS = ADJUSTMENT_GROUPS.geometry.flatMap((group) => group.keys);
    const MASK_KEYS = ADJUSTMENT_GROUPS.masks.flatMap((group) => group.keys);

    if (oldType !== presetType) {
      if (presetType === 'tool') {
        for (const key of Object.keys(newAdjustments)) {
          if (JSON.stringify(newAdjustments[key]) === JSON.stringify(INITIAL_ADJUSTMENTS[key as keyof Adjustments])) {
            delete newAdjustments[key];
          }
        }
      } else {
        for (const key of COPYABLE_ADJUSTMENT_KEYS) {
          if (!includeMasks && MASK_KEYS.includes(key)) continue;
          if (!includeCropTransform && GEOMETRY_KEYS.includes(key)) continue;
          if (newAdjustments[key] === undefined) {
            newAdjustments[key] = INITIAL_ADJUSTMENTS[key as keyof Adjustments];
          }
        }
      }
    }

    if (!includeMasks) {
      for (const k of MASK_KEYS) delete newAdjustments[k];
    }
    if (!includeCropTransform) {
      for (const k of GEOMETRY_KEYS) delete newAdjustments[k];
    }

    let updatedPreset: Preset | null = null;
    const updatedPresets = presets.map((item: UserPreset) => {
      if (item.preset?.id === id) {
        updatedPreset = {
          ...item.preset,
          name,
          adjustments: newAdjustments,
          includeMasks,
          includeCropTransform,
          presetType,
        };
        return { preset: updatedPreset };
      }
      if (item.folder) {
        let found = false;
        const newChildren = item.folder.children.map((child: Preset) => {
          if (child.id === id) {
            found = true;
            updatedPreset = {
              ...child,
              name,
              adjustments: newAdjustments,
              includeMasks,
              includeCropTransform,
              presetType,
            };
            return updatedPreset;
          }
          return child;
        });
        if (found) {
          return { folder: { ...item.folder, children: newChildren } };
        }
      }
      return item;
    });

    setPresets(updatedPresets);
    savePresetsToBackend(updatedPresets);
    return updatedPreset;
  };

  const overwritePreset = (id: string | null) => {
    let existingPreset: Preset | null = null;

    for (const item of presets) {
      if (item.preset?.id === id) {
        existingPreset = item.preset;
        break;
      }
      if (item.folder) {
        const found = item.folder.children.find((p: Preset) => p.id === id);
        if (found) {
          existingPreset = found;
          break;
        }
      }
    }

    if (!existingPreset) return null;

    const GEOMETRY_KEYS = ADJUSTMENT_GROUPS.geometry.flatMap((group) => group.keys);
    const MASK_KEYS = ADJUSTMENT_GROUPS.masks.flatMap((group) => group.keys);

    const includeMasks =
      existingPreset.includeMasks ??
      !!(existingPreset.adjustments?.masks && existingPreset.adjustments.masks.length > 0);
    const includeCropTransform =
      existingPreset.includeCropTransform ??
      GEOMETRY_KEYS.some((key) => existingPreset.adjustments?.[key] !== undefined);
    const presetType = existingPreset.presetType || 'style';

    const presetAdjustments: Record<string, any> = {};

    for (const key of COPYABLE_ADJUSTMENT_KEYS) {
      if (!includeMasks && MASK_KEYS.includes(key)) continue;
      if (!includeCropTransform && GEOMETRY_KEYS.includes(key)) continue;

      if (Object.prototype.hasOwnProperty.call(currentAdjustments, key)) {
        const currentValue = currentAdjustments[key as keyof Adjustments];

        if (presetType === 'tool') {
          const defaultValue = INITIAL_ADJUSTMENTS[key as keyof Adjustments];
          if (JSON.stringify(currentValue) !== JSON.stringify(defaultValue)) {
            presetAdjustments[key] = currentValue;
          }
        } else {
          presetAdjustments[key] = currentValue;
        }
      }
    }

    let updatedPreset: Preset | null = null;
    const updatedPresets = presets.map((item: UserPreset) => {
      if (item.preset?.id === id) {
        updatedPreset = {
          ...item.preset,
          adjustments: presetAdjustments,
          includeMasks,
          includeCropTransform,
          presetType,
        };
        return { preset: updatedPreset };
      }
      if (item.folder) {
        let found = false;
        const newChildren = item.folder.children.map((child: Preset) => {
          if (child.id === id) {
            found = true;
            updatedPreset = {
              ...child,
              adjustments: presetAdjustments,
              includeMasks,
              includeCropTransform,
              presetType,
            };
            return updatedPreset;
          }
          return child;
        });
        if (found) {
          return { folder: { ...item.folder, children: newChildren } };
        }
      }
      return item;
    });

    setPresets(updatedPresets);
    savePresetsToBackend(updatedPresets);
    return updatedPreset;
  };

  const duplicatePreset = useCallback(
    (presetId: string | null) => {
      if (!presetId) {
        return null;
      }

      let presetToDuplicate: Preset | null = null;
      let sourceFolderId = null;

      for (const item of presets) {
        if (item.preset?.id === presetId) {
          presetToDuplicate = item.preset;
          break;
        }
        if (item.folder) {
          const found = item.folder.children.find((p: any) => p.id === presetId);
          if (found) {
            presetToDuplicate = found;
            sourceFolderId = item.folder.id;
            break;
          }
        }
      }

      if (!presetToDuplicate) {
        return null;
      }

      // Generate a unique name to avoid collisions with existing presets.
      const existingNames = new Set<string>();
      for (const item of presets) {
        if (item.preset) existingNames.add(item.preset.name);
        if (item.folder) {
          if (item.folder.name) existingNames.add(item.folder.name);
          for (const c of item.folder.children) existingNames.add(c.name);
        }
      }

      const baseName = presetToDuplicate.name || 'Preset';
      let candidate = `${baseName} Copy`;
      let counter = 2;
      while (existingNames.has(candidate)) {
        candidate = `${baseName} Copy ${counter}`;
        counter += 1;
      }

      const newPreset: Preset = {
        adjustments: JSON.parse(JSON.stringify(presetToDuplicate.adjustments || {})),
        id: safeUuid(),
        name: candidate,
        includeMasks: presetToDuplicate.includeMasks,
        includeCropTransform: presetToDuplicate.includeCropTransform,
        presetType: presetToDuplicate.presetType || 'style',
      };

      let updatedPresets;
      if (sourceFolderId) {
        updatedPresets = presets.map((item: UserPreset) => {
          if (item.folder?.id === sourceFolderId) {
            const originalIndex = item.folder.children.findIndex((p: any) => p.id === presetId);
            const newChildren = [...item.folder.children];
            // Insert right after the original if found, otherwise append.
            const insertAt = originalIndex >= 0 ? originalIndex + 1 : newChildren.length;
            newChildren.splice(insertAt, 0, newPreset);
            return { folder: { ...item.folder, children: newChildren } };
          }
          return item;
        });
      } else {
        const originalIndex = presets.findIndex((item: UserPreset) => item.preset?.id === presetId);
        const updatedList = [...presets];
        const insertAt = originalIndex >= 0 ? originalIndex + 1 : updatedList.length;
        updatedList.splice(insertAt, 0, { preset: newPreset });
        updatedPresets = updatedList;
      }

      setPresets(updatedPresets);
      savePresetsToBackend(updatedPresets);
      return newPreset;
    },
    [presets, savePresetsToBackend],
  );

  const movePreset = useCallback(
    (presetId: string, targetFolderId: string | null, overId = null) => {
      // Determine the source item – it may be either a top-level preset, a
      // preset inside a folder, or a top-level folder.
      let presetToMove: Preset | null = null;
      let folderToMove: { id: string; name: string; children: Preset[] } | null = null;
      let sourceFolderId: string | null = null;

      for (const item of presets) {
        if (item.preset?.id === presetId) {
          presetToMove = item.preset;
          break;
        }
        if (item.folder) {
          const found = item.folder.children.find((p: any) => p.id === presetId);
          if (found) {
            presetToMove = found;
            sourceFolderId = item.folder.id ?? null;
            break;
          }
          if (item.folder.id === presetId) {
            folderToMove = {
              id: item.folder.id ?? '',
              name: item.folder.name ?? '',
              children: [...item.folder.children],
            };
            break;
          }
        }
      }

      if (!presetToMove && !folderToMove) {
        return;
      }

      // Prevent moving a folder into itself or one of its descendants.
      if (folderToMove) {
        if (targetFolderId === folderToMove.id) {
          return;
        }
        if (targetFolderId) {
          const isDescendant = (folderId: string): boolean => {
            const folder = presets.find((p) => p.folder?.id === folderId)?.folder;
            if (!folder) return false;
            if (folder.children.some((c: Preset) => c.id === folderToMove!.id)) return true;
            return false;
          };
          if (isDescendant(targetFolderId)) {
            return;
          }
        }
      }

      let updatedPresets = [...presets];

      if (sourceFolderId) {
        updatedPresets = updatedPresets.map((item: UserPreset) =>
          item.folder?.id === sourceFolderId
            ? { folder: { ...item.folder, children: item.folder.children.filter((p: any) => p.id !== presetId) } }
            : item,
        );
      } else if (folderToMove) {
        updatedPresets = updatedPresets.filter((item: UserPreset) => item.folder?.id !== presetId);
      } else {
        updatedPresets = updatedPresets.filter((item: UserPreset) => item.preset?.id !== presetId);
      }

      if (targetFolderId) {
        updatedPresets = updatedPresets.map((item: UserPreset) => {
          if (item.folder?.id === targetFolderId) {
            const newChildren = [...item.folder.children];
            if (overId) {
              const overIndex = newChildren.findIndex((p) => p.id === overId);
              if (overIndex !== -1) {
                if (presetToMove) {
                  newChildren.splice(overIndex, 0, presetToMove);
                } else if (folderToMove) {
                  // Folders cannot be nested inside other folders; fall back to
                  // appending at the root level below the target folder.
                  return item;
                }
              } else if (presetToMove) {
                newChildren.push(presetToMove);
              }
            } else if (presetToMove) {
              newChildren.push(presetToMove);
            }
            return { folder: { ...item.folder, children: newChildren } };
          }
          return item;
        });

        // If the drop target folder was not found (or moving a folder onto
        // a folder), ensure the moved item still appears somewhere.
        const stillMissing =
          (presetToMove &&
            !updatedPresets.some(
              (p) =>
                p.preset?.id === presetToMove!.id ||
                p.folder?.children.some((c: Preset) => c.id === presetToMove!.id),
            )) ||
          (folderToMove && !updatedPresets.some((p) => p.folder?.id === folderToMove!.id));
        if (stillMissing) {
          if (folderToMove) {
            const insertIndex = updatedPresets.findIndex((p) => p.folder?.id === targetFolderId);
            if (insertIndex >= 0) {
              updatedPresets.splice(insertIndex + 1, 0, { folder: folderToMove });
            } else {
              updatedPresets.push({ folder: folderToMove });
            }
          } else if (presetToMove) {
            updatedPresets.push({ preset: presetToMove });
          }
        }
      } else {
        if (overId) {
          const overIndex = updatedPresets.findIndex(
            (item) => item.preset?.id === overId || item.folder?.id === overId,
          );
          if (overIndex !== -1) {
            if (presetToMove) {
              updatedPresets.splice(overIndex, 0, { preset: presetToMove });
            } else if (folderToMove) {
              updatedPresets.splice(overIndex, 0, { folder: folderToMove });
            }
          } else {
            if (presetToMove) updatedPresets.push({ preset: presetToMove });
            else if (folderToMove) updatedPresets.push({ folder: folderToMove });
          }
        } else {
          if (presetToMove) updatedPresets.push({ preset: presetToMove });
          else if (folderToMove) updatedPresets.push({ folder: folderToMove });
        }
      }

      setPresets(updatedPresets);
      savePresetsToBackend(updatedPresets);
    },
    [presets, savePresetsToBackend],
  );

  const reorderItems = useCallback(
    (activeId: string, overId: string) => {
      setPresets((currentPresets: Array<UserPreset>) => {
        const getIndex = (arr: Array<UserPreset>, id: string) =>
          arr.findIndex((item: UserPreset) => item.preset?.id === id || item.folder?.id === id || item?.id === id);

        const activeRootIndex = getIndex(currentPresets, activeId);
        const overRootIndex = getIndex(currentPresets, overId);

        if (activeRootIndex !== -1 && overRootIndex !== -1) {
          const newPresets: Array<UserPreset> = arrayMove(currentPresets, activeRootIndex, overRootIndex);
          savePresetsToBackend(newPresets);
          return newPresets;
        }

        for (const item of currentPresets) {
          if (item.folder) {
            const activeChildIndex = getIndex(item.folder.children, activeId);
            const overChildIndex = getIndex(item.folder.children, overId);

            if (activeChildIndex !== -1 && overChildIndex !== -1) {
              const newPresets = currentPresets.map((p: UserPreset) => {
                if (p.folder?.id === item.folder?.id) {
                  return {
                    folder: {
                      ...p?.folder,
                      children: arrayMove(p.folder?.children, activeChildIndex, overChildIndex),
                    },
                  };
                }
                return p;
              });
              savePresetsToBackend(newPresets);
              return newPresets;
            }
          }
        }

        return currentPresets;
      });
    },
    [savePresetsToBackend],
  );

  const sortAllPresetsAlphabetically = useCallback(() => {
    setPresets((currentPresets) => {
      const newPresets: Array<UserPreset> = JSON.parse(JSON.stringify(currentPresets));
      const sortOptions = { numeric: true, sensitivity: 'base' };

      newPresets.forEach((item: UserPreset) => {
        if (item.folder && item.folder.children) {
          item.folder.children.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, sortOptions));
        }
      });

      const folders = newPresets.filter((item: UserPreset) => item.folder);
      const rootPresets = newPresets.filter((item: UserPreset) => item.preset);

      folders.sort((a: any, b: any) => a.folder.name.localeCompare(b.folder.name, undefined, sortOptions));
      rootPresets.sort((a: any, b: any) => a.preset.name.localeCompare(b.preset.name, undefined, sortOptions));

      const sortedPresets = [...folders, ...rootPresets];

      savePresetsToBackend(sortedPresets);
      return sortedPresets;
    });
  }, [savePresetsToBackend]);

  const importPresetsFromFile = useCallback(
    async (filePath: string) => {
      setIsLoading(true);
      try {
        const updatedPresetList: Array<any> = await invoke(Invokes.HandleImportPresetsFromFile, { filePath });
        setPresets(updatedPresetList);
      } catch (error) {
        console.error('Failed to import presets from file:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [setPresets],
  );

  const importLegacyPresetsFromFile = useCallback(
    async (filePath: string) => {
      setIsLoading(true);
      try {
        const updatedPresetList: Array<UserPreset> = await invoke(Invokes.HandleImportLegacyPresetsFromFile, {
          filePath,
        });
        setPresets(updatedPresetList);
      } catch (error) {
        console.error('Failed to import legacy presets from file:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [setPresets],
  );

  const exportPresetsToFile = useCallback(async (presetsToExport: Array<UserPreset>, filePath: string) => {
    // Validate the file path
    if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('File path is required for exporting presets');
    }

    // Ensure the file has the correct .rrpreset extension
    let resolvedPath = filePath.trim();
    if (!resolvedPath.endsWith('.rrpreset')) {
      resolvedPath = resolvedPath + '.rrpreset';
    }

    // Verify the destination directory exists
    const directoryPath = await dirname(resolvedPath);
    if (!directoryPath) {
      throw new Error('Invalid file path: unable to resolve destination directory');
    }

    try {
      await invoke(Invokes.HandleExportPresetsToFile, { presetsToExport, filePath: resolvedPath });
    } catch (error) {
      console.error('Failed to export presets to file:', error);
      throw error;
    }
  }, []);

  return {
    addFolder,
    addPreset,
    configurePreset,
    deleteItem,
    deleteItems,
    duplicatePreset,
    exportPresetsToFile,
    importPresetsFromFile,
    importLegacyPresetsFromFile,
    isLoading,
    movePreset,
    overwritePreset,
    presets,
    refreshPresets: loadPresets,
    renameItem,
    reorderItems,
    sortAllPresetsAlphabetically,
  };
}
