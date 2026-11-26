import { describe, expect, it } from 'vitest';
import { classifyLayout, defaultZoom, orientationFor } from './layout';

const mouse = { coarsePointer: false, canHover: true };
const touch = { coarsePointer: true, canHover: false };

describe('layout', () => {
  it('classifies phones, tablets, desktops, and televisions', () => {
    expect(classifyLayout(390, 844, touch)).toBe('phone');
    expect(classifyLayout(844, 390, touch)).toBe('phone');
    expect(orientationFor(390, 844)).toBe('portrait');
    expect(orientationFor(844, 390)).toBe('landscape');
    expect(classifyLayout(768, 1024, touch)).toBe('tablet');
    expect(classifyLayout(1024, 768, touch)).toBe('tablet');
    expect(classifyLayout(1366, 1024, touch)).toBe('tablet');
    expect(classifyLayout(1440, 900, mouse)).toBe('desktop');
    expect(classifyLayout(1920, 1080, mouse)).toBe('desktop');
    expect(classifyLayout(1920, 1080, touch)).toBe('tv');
    expect(classifyLayout(3840, 2160, mouse)).toBe('tv');
    expect(classifyLayout(2560, 1440, mouse)).toBe('tv');
  });

  it('opens zoomed in enough that a gatherer is visible on every screen', () => {
    const phone = defaultZoom(390, 844, 'phone');
    const desktop = defaultZoom(1440, 900, 'desktop');
    const tv = defaultZoom(3840, 2160, 'tv');
    expect(20 * phone).toBeGreaterThanOrEqual(12);
    expect(20 * desktop).toBeGreaterThanOrEqual(18);
    expect(20 * tv).toBeGreaterThanOrEqual(28);
    expect(3840 / tv).toBeLessThan(6400 / 3);
  });
});
