import { describe, it, expect } from 'vitest';
import { intToRgb255, intToRgb01, hexStrToRgb255 } from './color';

describe('color', () => {
  it('intToRgb255 unpacks 0xRRGGBB', () => {
    expect(intToRgb255(0xdfe9ff)).toEqual([223, 233, 255]);
    expect(intToRgb255(0x000000)).toEqual([0, 0, 0]);
    expect(intToRgb255(0xffffff)).toEqual([255, 255, 255]);
  });

  it('intToRgb01 is the 0..1 scaling of intToRgb255', () => {
    expect(intToRgb01(0xffffff)).toEqual([1, 1, 1]);
    const [r, g, b] = intToRgb01(0xdfe9ff);
    expect(r).toBeCloseTo(223 / 255, 9);
    expect(g).toBeCloseTo(233 / 255, 9);
    expect(b).toBeCloseTo(255 / 255, 9);
  });

  it('hexStrToRgb255 handles # and 3-digit shorthand, matches int path', () => {
    expect(hexStrToRgb255('#dfe9ff')).toEqual([223, 233, 255]);
    expect(hexStrToRgb255('dfe9ff')).toEqual([223, 233, 255]);
    expect(hexStrToRgb255('#fff')).toEqual([255, 255, 255]);
    expect(hexStrToRgb255('#77bb41')).toEqual(intToRgb255(0x77bb41));
  });
});
