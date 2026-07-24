import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { useEditorStore } from '../store/useEditorStore';
import { useEditorActions } from './useEditorActions';
import { Adjustments, AiPatch, MaskContainer, Coord } from '../utils/adjustments';
import { SubMask } from '../components/panel/right/Masks';
import { Invokes } from '../components/ui/AppProperties';
import { useAuth } from '@clerk/react';
import { useSettingsStore } from '../store/useSettingsStore';

const getTransformAdjustments = (adj: Adjustments) => ({
  transformDistortion: adj.transformDistortion,
  transformVertical: adj.transformVertical,
  transformHorizontal: adj.transformHorizontal,
  transformRotate: adj.transformRotate,
  transformAspect: adj.transformAspect,
  transformScale: adj.transformScale,
  transformXOffset: adj.transformXOffset,
  transformYOffset: adj.transformYOffset,
  lensDistortionAmount: adj.lensDistortionAmount,
  lensVignetteAmount: adj.lensVignetteAmount,
  lensTcaAmount: adj.lensTcaAmount,
  lensDistortionParams: adj.lensDistortionParams,
  lensMaker: adj.lensMaker,
  lensModel: adj.lensModel,
  lensDistortionEnabled: adj.lensDistortionEnabled,
  lensTcaEnabled: adj.lensTcaEnabled,
  lensVignetteEnabled: adj.lensVignetteEnabled,
});

const findSubMask = (adjustments: Adjustments, subMaskId: string): SubMask | undefined => {
  const fromMasks = adjustments.masks
    ?.flatMap((m: MaskContainer) => m.subMasks)
    .find((sm: SubMask) => sm.id === subMaskId);
  if (fromMasks) return fromMasks;
  return adjustments.aiPatches
    ?.flatMap((p: AiPatch) => p.subMasks)
    .find((sm: SubMask) => sm.id === subMaskId);
};

export function useAiMasking() {
  const { setAdjustments } = useEditorActions();
  const setEditor = useEditorStore((state) => state.setEditor);
  const { getToken } = useAuth();

  // Track in-flight requests for cancellation on unmount or re-trigger.
  const quickEraseAbortRef = useRef<AbortController | null>(null);
  const generativeAbortRef = useRef<AbortController | null>(null);
  const cleanupAbortRef = useRef<AbortController | null>(null);

  // AI operation timeout (30s for cleanup, 60s for generative replace).
  const AI_CLEANUP_TIMEOUT_MS = 30_000;
  const AI_GENERATIVE_TIMEOUT_MS = 60_000;

  // Cleanup abort controllers on unmount.
  useEffect(() => {
    return () => {
      quickEraseAbortRef.current?.abort();
      generativeAbortRef.current?.abort();
      cleanupAbortRef.current?.abort();
    };
  }, []);

  const updateSubMask = useCallback(
    (subMaskId: string, updatedData: any) => {
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        masks: prev.masks.map((c: MaskContainer) => ({
          ...c,
          subMasks: c.subMasks.map((sm: SubMask) => (sm.id === subMaskId ? { ...sm, ...updatedData } : sm)),
        })),
        aiPatches: (prev.aiPatches || []).map((p: AiPatch) => ({
          ...p,
          subMasks: p.subMasks.map((sm: SubMask) => (sm.id === subMaskId ? { ...sm, ...updatedData } : sm)),
        })),
      }));
    },
    [setAdjustments],
  );

  const handleManualCleanup = useCallback(
    async (subMaskId: string, sourceX: number, sourceY: number) => {
      const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
      if (!selectedImage?.path) return;

      const patchId = adjustments.aiPatches.find((p: AiPatch) =>
        p.subMasks.some((sm: SubMask) => sm.id === subMaskId),
      )?.id;
      if (!patchId) return;

      setAdjustments((prev: Adjustments) => ({
        ...prev,
        aiPatches: prev.aiPatches?.map((p: AiPatch) => (p.id === patchId ? { ...p, isLoading: true } : p)),
      }));

      // Set up timeout for manual cleanup.
      cleanupAbortRef.current?.abort();
      const cleanupAbort = new AbortController();
      cleanupAbortRef.current = cleanupAbort;
      const cleanupTimeout = setTimeout(() => {
        cleanupAbort.abort();
        toast.error('Cleanup timed out – operation took too long');
      }, AI_CLEANUP_TIMEOUT_MS);

      try {
        const patchDefinitionForBackend = adjustments.aiPatches.find((p: AiPatch) => p.id === patchId);

        const newPatchDataJson: any = await invoke(Invokes.GenerateManualCleanupPatch, {
          currentAdjustments: adjustments,
          patchDefinition: patchDefinitionForBackend,
          sourcePoint: [sourceX, sourceY],
        });

        if (cleanupAbort.signal.aborted) return;

        const newPatchData = JSON.parse(newPatchDataJson);
        patchesSentToBackend.delete(patchId);

        setAdjustments((prev: Adjustments) => ({
          ...prev,
          aiPatches: prev.aiPatches?.map((p: AiPatch) =>
            p.id === patchId ? { ...p, patchData: newPatchData, isLoading: false } : p,
          ),
        }));
      } catch (err: any) {
        if (err.name === 'AbortError' || cleanupAbort.signal.aborted) return;
        toast.error(`Cleanup Failed: ${err.message || String(err)}`);
        setAdjustments((prev: Adjustments) => ({
          ...prev,
          aiPatches: prev.aiPatches?.map((p: AiPatch) => (p.id === patchId ? { ...p, isLoading: false } : p)),
        }));
      } finally {
        clearTimeout(cleanupTimeout);
      }
    },
    [setAdjustments],
  );

  const handleGenerativeReplace = useCallback(
    async (patchId: string, prompt: string, useFastInpaint: boolean) => {
      const { selectedImage, adjustments, isGeneratingAi, patchesSentToBackend } = useEditorStore.getState();
      if (!selectedImage?.path || isGeneratingAi) return;

      const patch: AiPatch | undefined = adjustments.aiPatches.find((p: AiPatch) => p.id === patchId);
      if (!patch) return;

      const patchDefinition = { ...patch, prompt };
      // Device-side fix: for local/cpu mode, token is not needed. Only fetch for cloud mode.
      const aiProvider = useSettingsStore.getState().appSettings?.aiProvider || 'cpu';
      let token: string | null = null;
      if (aiProvider === 'cloud') {
        try {
          token = (await getToken()) || null;
        } catch {
          token = null;
        }
      }

      setAdjustments((prev: Adjustments) => ({
        ...prev,
        aiPatches: prev.aiPatches.map((p: AiPatch) => (p.id === patchId ? { ...p, isLoading: true, prompt } : p)),
      }));

      setEditor({ isGeneratingAi: true });

      // Set up timeout for generative replace.
      generativeAbortRef.current?.abort();
      const genAbort = new AbortController();
      generativeAbortRef.current = genAbort;
      const genTimeout = setTimeout(() => {
        genAbort.abort();
        toast.error('AI Replace timed out – operation took too long');
      }, AI_GENERATIVE_TIMEOUT_MS);

      try {
        const newPatchDataJson: any = await invoke(Invokes.InvokeGenerativeReplaceWithMaskDef, {
          currentAdjustments: adjustments,
          patchDefinition: patchDefinition,
          path: selectedImage.path,
          useFastInpaint: useFastInpaint,
          token: token || null,
        });

        if (genAbort.signal.aborted) return;

        const newPatchData = JSON.parse(newPatchDataJson);
        patchesSentToBackend.delete(patchId);

        setAdjustments((prev: Adjustments) => ({
          ...prev,
          aiPatches: prev.aiPatches.map((p: AiPatch) =>
            p.id === patchId
              ? {
                  ...p,
                  patchData: newPatchData,
                  isLoading: false,
                  name: useFastInpaint ? 'Inpaint' : prompt && prompt.trim() ? prompt.trim() : p.name,
                }
              : p,
          ),
        }));
        setEditor({ activeAiPatchContainerId: null, activeAiSubMaskId: null });
      } catch (err: any) {
        if (err.name === 'AbortError' || genAbort.signal.aborted) return;
        toast.error(`AI Replace Failed: ${err}`);
        setAdjustments((prev: Adjustments) => ({
          ...prev,
          aiPatches: prev.aiPatches.map((p: AiPatch) => (p.id === patchId ? { ...p, isLoading: false } : p)),
        }));
      } finally {
        clearTimeout(genTimeout);
        setEditor({ isGeneratingAi: false });
      }
    },
    [setAdjustments, setEditor],
  );

  const handleQuickErase = useCallback(
    async (subMaskId: string | null, startPoint: Coord, endPoint: Coord) => {
      const { selectedImage, adjustments, isGeneratingAi, patchesSentToBackend } = useEditorStore.getState();
      if (!selectedImage?.path || isGeneratingAi) return;

      // Cancel any previous quick erase request.
      if (quickEraseAbortRef.current) {
        quickEraseAbortRef.current.abort();
      }
      const abortController = new AbortController();
      quickEraseAbortRef.current = abortController;

      // Device-side fix: for local/cpu mode, token is not needed. Only fetch for cloud mode.
      const aiProvider = useSettingsStore.getState().appSettings?.aiProvider || 'cpu';
      let token: string | null = null;
      if (aiProvider === 'cloud') {
        try {
          token = (await getToken()) || null;
        } catch {
          token = null;
        }
      }

      const patchId = adjustments.aiPatches.find((p: AiPatch) =>
        p.subMasks.some((sm: SubMask) => sm.id === subMaskId),
      )?.id;
      if (!patchId) return;

      setEditor({ isGeneratingAi: true });
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        aiPatches: prev.aiPatches?.map((p: AiPatch) => (p.id === patchId ? { ...p, isLoading: true } : p)),
      }));

      try {
        const transformAdjustments = getTransformAdjustments(adjustments);
        const newMaskParams: any = await invoke(Invokes.GenerateAiSubjectMask, {
          jsAdjustments: transformAdjustments,
          endPoint: [endPoint.x, endPoint.y],
          flipHorizontal: adjustments.flipHorizontal,
          flipVertical: adjustments.flipVertical,
          orientationSteps: adjustments.orientationSteps,
          path: selectedImage.path,
          rotation: adjustments.rotation,
          startPoint: [startPoint.x, startPoint.y],
        });

        const subMaskToUpdate = adjustments.aiPatches
          ?.find((p: AiPatch) => p.id === patchId)
          ?.subMasks.find((sm: SubMask) => sm.id === subMaskId);
        const finalSubMaskParams: any = { ...subMaskToUpdate?.parameters, ...newMaskParams };
        const updatedAdjustmentsForBackend = {
          ...adjustments,
          aiPatches: adjustments.aiPatches.map((p: AiPatch) =>
            p.id === patchId
              ? {
                  ...p,
                  subMasks: p.subMasks.map((sm: SubMask) =>
                    sm.id === subMaskId ? { ...sm, parameters: finalSubMaskParams } : sm,
                  ),
                }
              : p,
          ),
        };

        const patchDefinitionForBackend = updatedAdjustmentsForBackend.aiPatches.find((p: AiPatch) => p.id === patchId);
        const newPatchDataJson: any = await invoke(Invokes.InvokeGenerativeReplaceWithMaskDef, {
          currentAdjustments: updatedAdjustmentsForBackend,
          patchDefinition: { ...patchDefinitionForBackend, prompt: '' },
          path: selectedImage.path,
          useFastInpaint: true,
          token: token || null,
        });

        const newPatchData = JSON.parse(newPatchDataJson);
        patchesSentToBackend.delete(patchId);

        setAdjustments((prev: Adjustments) => ({
          ...prev,
          aiPatches: prev.aiPatches?.map((p: AiPatch) =>
            p.id === patchId
              ? {
                  ...p,
                  patchData: newPatchData,
                  isLoading: false,
                  subMasks: p.subMasks.map((sm: SubMask) =>
                    sm.id === subMaskId ? { ...sm, parameters: finalSubMaskParams } : sm,
                  ),
                }
              : p,
          ),
        }));
        setEditor({ activeAiPatchContainerId: null, activeAiSubMaskId: null });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Request was cancelled due to a new request; don't show error toast.
          return;
        }
        toast.error(`Quick Erase Failed: ${err.message || String(err)}`);
        setAdjustments((prev: Adjustments) => ({
          ...prev,
          aiPatches: prev.aiPatches?.map((p: AiPatch) => (p.id === patchId ? { ...p, isLoading: false } : p)),
        }));
      } finally {
        setEditor({ isGeneratingAi: false });
      }
    },
    [setAdjustments, setEditor],
  );

  const handleDeleteMaskContainer = useCallback(
    (containerId: string) => {
      const { activeMaskContainerId } = useEditorStore.getState();
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        masks: (prev.masks || []).filter((c) => c.id !== containerId),
      }));
      if (activeMaskContainerId === containerId) {
        setEditor({ activeMaskContainerId: null, activeMaskId: null });
      }
    },
    [setAdjustments, setEditor],
  );

  const handleDeleteAiPatch = useCallback(
    (patchId: string) => {
      const { activeAiPatchContainerId } = useEditorStore.getState();
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        aiPatches: (prev.aiPatches || []).filter((p) => p.id !== patchId),
      }));
      if (activeAiPatchContainerId === patchId) {
        setEditor({ activeAiPatchContainerId: null, activeAiSubMaskId: null });
      }
    },
    [setAdjustments, setEditor],
  );

  const handleToggleAiPatchVisibility = useCallback(
    (patchId: string) => {
      setAdjustments((prev: Adjustments) => ({
        ...prev,
        aiPatches: (prev.aiPatches || []).map((p: AiPatch) => (p.id === patchId ? { ...p, visible: !p.visible } : p)),
      }));
    },
    [setAdjustments],
  );

  const handleGenerateAiMask = async (subMaskId: string, startPoint: Coord, endPoint: Coord) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;
    setEditor({ isGeneratingAiMask: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const newParameters = await invoke(Invokes.GenerateAiSubjectMask, {
        jsAdjustments: transformAdjustments,
        endPoint: [endPoint.x, endPoint.y],
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        path: selectedImage.path,
        rotation: adjustments.rotation,
        startPoint: [startPoint.x, startPoint.y],
      }) as Record<string, any>;

      if (!newParameters.mask_data_base64) {
        toast.error('AI Mask: No mask data generated');
        setEditor({ isGeneratingAiMask: false });
        return;
      }

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = { ...((subMask?.parameters || {}) as Record<string, any>), ...newParameters };
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`AI Mask Failed: ${error}`);
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  const normalizeMaskData = (raw: Record<string, any>): Record<string, any> => {
    const normalized = { ...raw };
    const sn: string | undefined | null = normalized.mask_data_base64;
    const cc: string | undefined | null = normalized.maskDataBase64;
    const valid: string | null | undefined = (sn && sn.length > 32) ? sn : (cc && cc.length > 32 ? cc : null);
    if (valid) {
      normalized.mask_data_base64 = valid;
      normalized.maskDataBase64 = valid;
    }
    return normalized;
  };

  const handleGenerateAiSubjectMask = async (subMaskId: string) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;
    setEditor({ isGeneratingAiMask: true });

    try {
      const steps = adjustments?.orientationSteps || 0;
      const isRotated = steps === 1 || steps === 3;
      const imgW = isRotated ? (selectedImage.height || 1000) : (selectedImage.width || 1000);
      const imgH = isRotated ? (selectedImage.width || 1000) : (selectedImage.height || 1000);

      const margin = 0.05;
      const startPoint = { x: imgW * margin, y: imgH * margin };
      const endPoint = { x: imgW * (1 - margin), y: imgH * (1 - margin) };

      const transformAdjustments = getTransformAdjustments(adjustments);
      const rawNewParameters = await invoke(Invokes.GenerateAiSubjectMask, {
        jsAdjustments: transformAdjustments,
        endPoint: [endPoint.x, endPoint.y],
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        path: selectedImage.path,
        rotation: adjustments.rotation,
        startPoint: [startPoint.x, startPoint.y],
      }) as Record<string, any>;

      const newParameters = normalizeMaskData(rawNewParameters);

      if (!newParameters.mask_data_base64) {
        toast.error('AI Subject Mask: No subject detected in image');
        setEditor({ isGeneratingAiMask: false });
        return;
      }

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = normalizeMaskData({
        ...((subMask?.parameters || {}) as Record<string, any>),
        ...newParameters,
      });
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`AI Subject Mask Failed: ${error}`);
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  const handleGenerateAiDepthMask = async (subMaskId: string, parameters: any) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;
    setEditor({ isGeneratingAiMask: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const rawNewParameters = await invoke(Invokes.GenerateAiDepthMask, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        minDepth: parameters.minDepth ?? 20,
        maxDepth: parameters.maxDepth ?? 100,
        minFade: parameters.minFade ?? 15,
        maxFade: parameters.maxFade ?? 15,
        feather: parameters.feather ?? 10,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;
      const newParameters = normalizeMaskData(rawNewParameters);

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = normalizeMaskData({
        ...((subMask?.parameters || {}) as Record<string, any>),
        ...newParameters,
      });
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`AI Depth Mask Failed: ${error}`);
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  const handleGenerateAiForegroundMask = async (subMaskId: string) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;
    setEditor({ isGeneratingAiMask: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const rawNewParameters = await invoke(Invokes.GenerateAiForegroundMask, {
        jsAdjustments: transformAdjustments,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;
      const newParameters = normalizeMaskData(rawNewParameters);

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = normalizeMaskData({
        ...((subMask?.parameters || {}) as Record<string, any>),
        ...newParameters,
      });
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`AI Mask Failed: ${error}`);
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  const handleGenerateAiSkyMask = async (subMaskId: string) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;
    setEditor({ isGeneratingAiMask: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const rawNewParameters = await invoke(Invokes.GenerateAiSkyMask, {
        jsAdjustments: transformAdjustments,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;
      const newParameters = normalizeMaskData(rawNewParameters);

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = normalizeMaskData({
        ...((subMask?.parameters || {}) as Record<string, any>),
        ...newParameters,
      });
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`AI Sky Mask Failed: ${error}`);
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  const handleApplySuperResolution = useCallback(
    async (scale: number = 2.0) => {
      const { selectedImage } = useEditorStore.getState();
      if (!selectedImage?.path) {
        toast.error('No image selected for super resolution');
        return;
      }

      setEditor({ isGeneratingAi: true });
      try {
        const resultBytes: number[] = await invoke(Invokes.ApplySuperResolution, { scale });
        const tempPath: string = await invoke(Invokes.SaveTempFile, { bytes: resultBytes });
        toast.success(`Super resolution saved to: ${tempPath}`);
        return tempPath;
      } catch (err: any) {
        toast.error(`Super Resolution Failed: ${err.message || String(err)}`);
      } finally {
        setEditor({ isGeneratingAi: false });
      }
    },
    [setEditor],
  );

  const activeMaskId = useEditorStore((state) => state.activeMaskId);
  const activeAiSubMaskId = useEditorStore((state) => state.activeAiSubMaskId);
  const selectedImagePath = useEditorStore((state) => state.selectedImage?.path);
  const adjustmentsForPrecompute = useEditorStore((state) => state.adjustments);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const activeSubMask =
      adjustmentsForPrecompute?.masks?.flatMap((m: MaskContainer) => m.subMasks).find((sm: SubMask) => sm.id === activeMaskId) ||
      adjustmentsForPrecompute?.aiPatches?.flatMap((p: AiPatch) => p.subMasks).find((sm: SubMask) => sm.id === activeAiSubMaskId);

    if (activeSubMask?.type === 'ai-subject' && selectedImagePath) {
      // Debounce to avoid excessive precompute requests when adjustments change rapidly
      debounceTimer = setTimeout(() => {
        if (cancelled) return;
        const transformAdjustments = getTransformAdjustments(adjustmentsForPrecompute);
        invoke(Invokes.PrecomputeAiSubjectMask, {
          jsAdjustments: transformAdjustments,
          path: selectedImagePath,
        })
          .then(() => {
            if (cancelled) return;
            // Precompute completed successfully; no state update needed.
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('Failed to precompute AI subject mask:', err);
          });
      }, 200);
    }

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [activeMaskId, activeAiSubMaskId, selectedImagePath, adjustmentsForPrecompute]);

  const handleGenerateColorRangeMask = async (subMaskId: string, parameters: any) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;
    setEditor({ isGeneratingAiMask: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const newParameters = await invoke(Invokes.GenerateColorRangeMask, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        hueCenter: parameters.hueCenter ?? 0,
        hueRange: parameters.hueRange ?? 30,
        satMin: parameters.satMin ?? 10,
        satMax: parameters.satMax ?? 100,
        lumMin: parameters.lumMin ?? 10,
        lumMax: parameters.lumMax ?? 90,
        feather: parameters.feather ?? 10,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = { ...((subMask?.parameters || {}) as Record<string, any>), ...newParameters };
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`Color Range Mask Failed: ${error}`);
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  const handleGenerateLuminanceRangeMask = async (subMaskId: string, parameters: any) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;
    setEditor({ isGeneratingAiMask: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const newParameters = await invoke(Invokes.GenerateLuminanceRangeMask, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        lumMin: parameters.lumMin ?? 0,
        lumMax: parameters.lumMax ?? 50,
        feather: parameters.feather ?? 10,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = { ...((subMask?.parameters || {}) as Record<string, any>), ...newParameters };
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`Luminance Range Mask Failed: ${error}`);
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  const handleApplyMaskFeather = async (subMaskId: string, feather: number) => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return;

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const newParameters = await invoke(Invokes.ApplyMaskFeather, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        subMaskId,
        feather,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = { ...((subMask?.parameters || {}) as Record<string, any>), ...newParameters };
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
    } catch (error) {
      toast.error(`Mask Feather Failed: ${error}`);
    }
  };

  const handleAutoStraightenHorizon = async (): Promise<number | null> => {
    const { selectedImage, adjustments } = useEditorStore.getState();
    if (!selectedImage?.path) return null;

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const horizonAngle = await invoke(Invokes.AutoStraightenHorizon, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as number;

      return horizonAngle;
    } catch (error) {
      toast.error(`Auto Straighten Failed: ${error}`);
      return null;
    }
  };

  const handleDetectHorizonLines = async (): Promise<any[] | null> => {
    const { selectedImage, adjustments } = useEditorStore.getState();
    if (!selectedImage?.path) return null;

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const lines = await invoke(Invokes.DetectHorizonLines, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as any[];

      return lines;
    } catch (error) {
      toast.error(`Horizon Detection Failed: ${error}`);
      return null;
    }
  };

  const handleGenerateAiSkyReplace = async (subMaskId: string, skyPrompt: string): Promise<boolean> => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return false;
    setEditor({ isGeneratingAi: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const newParameters = await invoke(Invokes.GenerateAiSkyReplace, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        subMaskId,
        skyPrompt,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = { ...((subMask?.parameters || {}) as Record<string, any>), ...newParameters };
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
      return true;
    } catch (error) {
      toast.error(`AI Sky Replace Failed: ${error}`);
      return false;
    } finally {
      setEditor({ isGeneratingAi: false });
    }
  };

  const handleGenerateAiBackgroundRemove = async (subMaskId: string): Promise<boolean> => {
    const { selectedImage, adjustments, patchesSentToBackend } = useEditorStore.getState();
    if (!selectedImage?.path) return false;
    setEditor({ isGeneratingAiMask: true });

    try {
      const transformAdjustments = getTransformAdjustments(adjustments);
      const newParameters = await invoke(Invokes.GenerateAiBackgroundRemove, {
        jsAdjustments: transformAdjustments,
        path: selectedImage.path,
        subMaskId,
        flipHorizontal: adjustments.flipHorizontal,
        flipVertical: adjustments.flipVertical,
        orientationSteps: adjustments.orientationSteps,
        rotation: adjustments.rotation,
      }) as Record<string, any>;

      const subMask = findSubMask(useEditorStore.getState().adjustments, subMaskId);
      const mergedParameters = { ...((subMask?.parameters || {}) as Record<string, any>), ...newParameters };
      patchesSentToBackend.delete(subMaskId);
      updateSubMask(subMaskId, { parameters: mergedParameters });
      return true;
    } catch (error) {
      toast.error(`AI Background Remove Failed: ${error}`);
      return false;
    } finally {
      setEditor({ isGeneratingAiMask: false });
    }
  };

  return {
    updateSubMask,
    handleGenerativeReplace,
    handleManualCleanup,
    handleQuickErase,
    handleDeleteMaskContainer,
    handleDeleteAiPatch,
    handleToggleAiPatchVisibility,
    handleGenerateAiMask,
    handleGenerateAiSubjectMask,
    handleGenerateAiDepthMask,
    handleGenerateAiForegroundMask,
    handleGenerateAiSkyMask,
    handleApplySuperResolution,
    handleGenerateColorRangeMask,
    handleGenerateLuminanceRangeMask,
    handleApplyMaskFeather,
    handleAutoStraightenHorizon,
    handleDetectHorizonLines,
    handleGenerateAiSkyReplace,
    handleGenerateAiBackgroundRemove,
  };
}
