import { useCallback } from 'react';
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
  const gpuApplyAdjustments = useCallback(
    async (params: GpuAdjustmentParams): Promise<string> => {
      return invoke(Invokes.GpuApplyAdjustments, { ...params }) as Promise<string>;
    },
    [],
  );

  /**
   * Probe whether the lightweight GPU adjustment pipeline is initialized.
   * Use this to decide whether to expose GPU-accelerated quick-adjust entry
   * points without triggering a lazy init failure on every call.
   */
  const isGpuPipelineReady = useCallback(async (): Promise<boolean> => {
    return invoke(Invokes.IsGpuAdjustmentPipelineReady) as Promise<boolean>;
  }, []);

  const colorConvertSpace = useCallback(
    async (r: number, g: number, b: number, fromSpace: string, toSpace: string): Promise<ColorConversionResult> => {
      const result = (await invoke(Invokes.ColorConvertSpace, { r, g, b, fromSpace, toSpace })) as number[];
      return { r: result[0], g: result[1], b: result[2] };
    },
    [],
  );

  const colorApplyAcesOutput = useCallback(
    async (r: number, g: number, b: number, targetSpace: string): Promise<ColorConversionResult> => {
      const result = (await invoke(Invokes.ColorApplyAcesOutput, { r, g, b, targetSpace })) as number[];
      return { r: result[0], g: result[1], b: result[2] };
    },
    [],
  );

  const colorSrgbToLinear = useCallback(
    async (r: number, g: number, b: number): Promise<ColorConversionResult> => {
      const result = (await invoke(Invokes.ColorSrgbToLinear, { r, g, b })) as number[];
      return { r: result[0], g: result[1], b: result[2] };
    },
    [],
  );

  const colorLinearToSrgb = useCallback(
    async (r: number, g: number, b: number): Promise<ColorConversionResult> => {
      const result = (await invoke(Invokes.ColorLinearToSrgb, { r, g, b })) as number[];
      return { r: result[0], g: result[1], b: result[2] };
    },
    [],
  );

  const colorApplyAcesFitted = useCallback(
    async (value: number): Promise<number> => {
      return invoke(Invokes.ColorApplyAcesFitted, { value }) as Promise<number>;
    },
    [],
  );

  const lutParseCubeFile = useCallback(
    async (content: string): Promise<LutInfo> => {
      return invoke(Invokes.LutParseCubeFile, { content }) as Promise<LutInfo>;
    },
    [],
  );

  const lutApplyToImage = useCallback(
    async (imageDataBase64: string, width: number, height: number, lutContent: string): Promise<string> => {
      return invoke(Invokes.LutApplyToImage, { imageDataBase64, width, height, lutContent }) as Promise<string>;
    },
    [],
  );

  return {
    gpuApplyAdjustments,
    isGpuPipelineReady,
    colorConvertSpace,
    colorApplyAcesOutput,
    colorSrgbToLinear,
    colorLinearToSrgb,
    colorApplyAcesFitted,
    lutParseCubeFile,
    lutApplyToImage,
  };
}
