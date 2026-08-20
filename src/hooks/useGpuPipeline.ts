import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Invokes } from '../components/ui/AppProperties';

export interface GpuAdjustmentParams {
  imageDataBase64: string;
  width: number;
  height: number;
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  saturation?: number;
  vibrance?: number;
  temperature?: number;
  tint?: number;
  sharpness?: number;
  vignette?: number;
  grainAmount?: number;
  haze?: number;
  clarity?: number;
  dehaze?: number;
}

export interface ColorConversionResult {
  r: number;
  g: number;
  b: number;
}

export interface LutInfo {
  title: string | null;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  entryCount: number;
}

export function useGpuPipeline() {
  /** Track consecutive GPU init failures so we can back off gracefully
   *  instead of hammering the Tauri bridge on every slider drag. */
  const consecutiveFailuresRef = useRef(0);

  const gpuApplyAdjustments = useCallback(async (params: GpuAdjustmentParams): Promise<string> => {
    try {
      const result = await invoke(Invokes.GpuApplyAdjustments, { ...params }) as string;
      consecutiveFailuresRef.current = 0; // reset on success
      return result;
    } catch (err) {
      consecutiveFailuresRef.current += 1;
      // Only log prominently once per batch of failures to avoid console spam.
      if (consecutiveFailuresRef.current === 1 || consecutiveFailuresRef.current % 10 === 0) {
        console.warn(
          `[useGpuPipeline] gpuApplyAdjustments failed (consecutive: ${consecutiveFailuresRef.current}):`,
          err instanceof Error ? err.message : err,
        );
      }
      // Re-throw so the caller can decide whether to fall back to CPU
      // processing, show a toast, or silently degrade.
      throw err;
    }
  }, []);

  /**
   * Probe whether the lightweight GPU adjustment pipeline is initialized.
   * Use this to decide whether to expose GPU-accelerated quick-adjust entry
   * points without triggering a lazy init failure on every call.
   */
  const isGpuPipelineReady = useCallback(async (): Promise<boolean> => {
    try {
      return (await invoke(Invokes.IsGpuAdjustmentPipelineReady)) as boolean;
    } catch (err) {
      console.warn('[useGpuPipeline] isGpuPipelineReady failed:', err);
      return false;
    }
  }, []);

  /**
   * Clear any cached GPU init failure and force a fresh probe on next
   * isGpuPipelineReady call. Use after driver updates or GPU hotplug.
   */
  const resetGpuPipeline = useCallback(async (): Promise<void> => {
    try {
      await invoke(Invokes.ResetGpuAdjustmentPipeline);
    } catch (err) {
      console.warn('[useGpuPipeline] resetGpuPipeline failed:', err);
    }
  }, []);

  /**
   * Safely extract an RGB triple from an invoke result. If the backend returns
   * a malformed payload (wrong length, non-array, NaN values), fall back to
   * the input values rather than throwing and bubbling to React render.
   */
  const safeRgb = (result: unknown, fallback: [number, number, number]): ColorConversionResult => {
    if (!Array.isArray(result) || result.length < 3) {
      console.warn('[useGpuPipeline] color conversion returned malformed payload, using fallback');
      return { r: fallback[0], g: fallback[1], b: fallback[2] };
    }
    const r = Number(result[0]);
    const g = Number(result[1]);
    const b = Number(result[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      console.warn('[useGpuPipeline] color conversion returned non-finite values, using fallback');
      return { r: fallback[0], g: fallback[1], b: fallback[2] };
    }
    return { r, g, b };
  };

  const colorConvertSpace = useCallback(
    async (r: number, g: number, b: number, fromSpace: string, toSpace: string): Promise<ColorConversionResult> => {
      const result = await invoke(Invokes.ColorConvertSpace, { r, g, b, fromSpace, toSpace });
      return safeRgb(result, [r, g, b]);
    },
    [],
  );

  const colorApplyAcesOutput = useCallback(
    async (r: number, g: number, b: number, targetSpace: string): Promise<ColorConversionResult> => {
      const result = await invoke(Invokes.ColorApplyAcesOutput, { r, g, b, targetSpace });
      return safeRgb(result, [r, g, b]);
    },
    [],
  );

  const colorSrgbToLinear = useCallback(async (r: number, g: number, b: number): Promise<ColorConversionResult> => {
    const result = await invoke(Invokes.ColorSrgbToLinear, { r, g, b });
    return safeRgb(result, [r, g, b]);
  }, []);

  const colorLinearToSrgb = useCallback(async (r: number, g: number, b: number): Promise<ColorConversionResult> => {
    const result = await invoke(Invokes.ColorLinearToSrgb, { r, g, b });
    return safeRgb(result, [r, g, b]);
  }, []);

  const colorApplyAcesFitted = useCallback(async (value: number): Promise<number> => {
    const result = (await invoke(Invokes.ColorApplyAcesFitted, { value })) as number;
    return Number.isFinite(result) ? result : value;
  }, []);

  const lutParseCubeFile = useCallback(async (content: string): Promise<LutInfo> => {
    return invoke(Invokes.LutParseCubeFile, { content }) as Promise<LutInfo>;
  }, []);

  const lutApplyToImage = useCallback(
    async (imageDataBase64: string, width: number, height: number, lutContent: string): Promise<string> => {
      return invoke(Invokes.LutApplyToImage, { imageDataBase64, width, height, lutContent }) as Promise<string>;
    },
    [],
  );

  return {
    gpuApplyAdjustments,
    isGpuPipelineReady,
    resetGpuPipeline,
    colorConvertSpace,
    colorApplyAcesOutput,
    colorSrgbToLinear,
    colorLinearToSrgb,
    colorApplyAcesFitted,
    lutParseCubeFile,
    lutApplyToImage,
  };
}
