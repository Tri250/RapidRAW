import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createSubMask } from './maskUtils';
import { Mask, SubMaskMode } from '../components/panel/right/Masks';
import i18n from '../i18n';

// uuid v4 is called inside createSubMask — make it deterministic
vi.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000001' }));

beforeAll(async () => {
  // formatMaskTypeName resolves the mask name through i18next; initialize the
  // instance so mask.name is a real localized label instead of undefined.
  await i18n.init();
});

describe('createSubMask', () => {
  it('returns a mask with default fields for Radial type', () => {
    const mask = createSubMask(Mask.Radial, { width: 2000, height: 1000 });
    expect(mask.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(mask.type).toBe(Mask.Radial);
    expect(mask.visible).toBe(true);
    expect(mask.invert).toBe(false);
    expect(mask.opacity).toBe(100);
    expect(mask.mode).toBe(SubMaskMode.Additive);
    expect(mask.name).toBeTruthy();
    expect(mask.parameters).toEqual({
      centerX: 1000,
      centerY: 500,
      radiusX: 500,
      radiusY: 250, // height / 4, not width / 4
      rotation: 0,
      feather: 0.5,
    });
  });

  it('returns a mask with Linear parameters', () => {
    const mask = createSubMask(Mask.Linear, { width: 800, height: 600 });
    expect(mask.type).toBe(Mask.Linear);
    expect(mask.parameters).toEqual({
      startX: 200,
      startY: 300,
      endX: 600,
      endY: 300,
      range: 50,
    });
  });

  it('returns a mask with Brush parameters', () => {
    const mask = createSubMask(Mask.Brush, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.Brush);
    expect(mask.parameters).toEqual({ lines: [] });
  });

  it('returns a mask with Flow parameters', () => {
    const mask = createSubMask(Mask.Flow, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.Flow);
    expect(mask.parameters).toEqual({ lines: [], flow: 10 });
  });

  it('returns a mask with AiSubject parameters', () => {
    const mask = createSubMask(Mask.AiSubject, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.AiSubject);
    expect(mask.parameters).toEqual({ maskDataBase64: null, grow: 0, feather: 0 });
  });

  it('returns a mask with AiForeground parameters', () => {
    const mask = createSubMask(Mask.AiForeground, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.AiForeground);
    expect(mask.parameters).toEqual({ maskDataBase64: null, grow: 0, feather: 0 });
  });

  it('returns a mask with AiSky parameters', () => {
    const mask = createSubMask(Mask.AiSky, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.AiSky);
    expect(mask.parameters).toEqual({ maskDataBase64: null, grow: 0, feather: 0 });
  });

  it('returns a mask with AiDepth parameters', () => {
    const mask = createSubMask(Mask.AiDepth, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.AiDepth);
    expect(mask.parameters).toEqual({
      maskDataBase64: null,
      minDepth: 20,
      maxDepth: 100,
      minFade: 15,
      maxFade: 15,
      feather: 10,
    });
  });

  it('returns a mask with Color parameters', () => {
    const mask = createSubMask(Mask.Color, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.Color);
    expect(mask.parameters).toEqual({ tolerance: 20, grow: 0, feather: 35 });
  });

  it('returns a mask with Luminance parameters', () => {
    const mask = createSubMask(Mask.Luminance, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.Luminance);
    expect(mask.parameters).toEqual({ tolerance: 20, grow: 0, feather: 35 });
  });

  it('returns a mask with QuickEraser parameters', () => {
    const mask = createSubMask(Mask.QuickEraser, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.QuickEraser);
    expect(mask.parameters).toEqual({ maskDataBase64: null, grow: 75, feather: 75 });
  });

  it('returns a mask with Clone parameters', () => {
    const mask = createSubMask(Mask.Clone, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.Clone);
    expect(mask.parameters).toEqual({ lines: [] });
  });

  it('returns a mask with Heal parameters', () => {
    const mask = createSubMask(Mask.Heal, { width: 100, height: 100 });
    expect(mask.type).toBe(Mask.Heal);
    expect(mask.parameters).toEqual({ lines: [] });
  });

  it('returns empty parameters for unknown mask type', () => {
    const mask = createSubMask('unknown' as Mask, { width: 100, height: 100 });
    expect(mask.parameters).toEqual({});
  });

  it('uses default dimensions when imageDimensions is null or empty', () => {
    const mask = createSubMask(Mask.Radial, null as unknown as { width: number; height: number });
    expect(mask.parameters.centerX).toBe(500);
    expect(mask.parameters.centerY).toBe(500);
    expect(mask.parameters.radiusX).toBe(250);
    expect(mask.parameters.radiusY).toBe(250);
  });

  it('uses default dimensions when imageDimensions is undefined', () => {
    const mask = createSubMask(Mask.Radial, undefined as unknown as { width: number; height: number });
    expect(mask.parameters.centerX).toBe(500);
    expect(mask.parameters.centerY).toBe(500);
  });

  it('respects the provided mode', () => {
    const mask = createSubMask(Mask.Brush, { width: 100, height: 100 }, SubMaskMode.Subtractive);
    expect(mask.mode).toBe(SubMaskMode.Subtractive);
  });

  it('respects Intersect mode', () => {
    const mask = createSubMask(Mask.Brush, { width: 100, height: 100 }, SubMaskMode.Intersect);
    expect(mask.mode).toBe(SubMaskMode.Intersect);
  });

  it('generates correct Linear rotation and range', () => {
    const mask = createSubMask(Mask.Linear, { width: 400, height: 200 });
    expect(mask.parameters.startX).toBe(100);
    expect(mask.parameters.startY).toBe(100);
    expect(mask.parameters.endX).toBe(300);
    expect(mask.parameters.endY).toBe(100);
    expect(mask.parameters.range).toBe(50);
  });

  it('Brush parameters are empty lines array', () => {
    const mask = createSubMask(Mask.Brush, { width: 2000, height: 1000 });
    expect(mask.parameters).toEqual({ lines: [] });
  });
});
