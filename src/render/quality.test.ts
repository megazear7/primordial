import { describe, expect, it } from 'vitest';
import { chooseResolution, detectDefaultQuality, type DeviceProfile } from './quality';

function profile(partial: Partial<DeviceProfile>): DeviceProfile {
  return {
    width: 1440,
    height: 900,
    dpr: 1,
    memoryGB: 8,
    cores: 8,
    saveData: false,
    coarsePointer: false,
    ...partial,
  };
}

describe('quality', () => {
  it('defaults low-power phones to low and 4K buffers to medium', () => {
    expect(
      detectDefaultQuality(profile({ width: 390, height: 844, dpr: 3, memoryGB: 4, cores: 4, coarsePointer: true })),
    ).toBe('low');
    expect(detectDefaultQuality(profile({ width: 3840, height: 2160, dpr: 1, memoryGB: 8, cores: 8 }))).toBe('medium');
    expect(detectDefaultQuality(profile({ saveData: true }))).toBe('low');
    expect(detectDefaultQuality(profile({}))).toBe('high');
  });

  it('caps resolution so a 4K television does not render a huge high-dpi buffer by default', () => {
    expect(chooseResolution('medium', 3840, 2160, 1)).toBeLessThan(1);
    expect(chooseResolution('medium', 3840, 2160, 1)).toBeGreaterThan(0.6);
    expect(chooseResolution('high', 1440, 900, 2)).toBe(2);
    expect(chooseResolution('low', 390, 844, 3)).toBe(1);
    expect(chooseResolution('high', 3840, 2160, 1)).toBe(1);
  });
});
