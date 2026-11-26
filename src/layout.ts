export type LayoutMode = 'phone' | 'tablet' | 'desktop' | 'tv';
export type Orientation = 'portrait' | 'landscape';

export interface LayoutHints {
  coarsePointer: boolean;
  canHover: boolean;
}

export function classifyLayout(width: number, height: number, hints: LayoutHints): LayoutMode {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const tenFoot = !hints.canHover || hints.coarsePointer;
  if (width >= 1800 && height >= 1000 && (tenFoot || width >= 2500)) return 'tv';
  if (longSide >= 2400 && shortSide >= 1000) return 'tv';
  if (width < 700 || (height < 520 && width < 1100)) return 'phone';
  if (hints.coarsePointer && shortSide < 1100 && width < 1600) return 'tablet';
  if (width < 1180 || (shortSide < 740 && width < 1400)) return 'tablet';
  return 'desktop';
}

export function orientationFor(width: number, height: number): Orientation {
  return height >= width ? 'portrait' : 'landscape';
}

/** Gatherer on-screen diameter drives the opening zoom, so creatures stay readable. */
export function defaultZoom(width: number, height: number, layout: LayoutMode): number {
  const gathererDiameter = 20;
  if (layout === 'tv') {
    const shortSide = Math.min(width, height);
    return Math.max(28, shortSide / 42) / gathererDiameter;
  }
  const target = layout === 'phone' ? 12 : layout === 'tablet' ? 16 : 18;
  return target / gathererDiameter;
}

export function readLayoutHints(): LayoutHints {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hover = window.matchMedia('(hover: hover)').matches;
  return { coarsePointer: coarse, canHover: hover };
}
