export type QualityName = 'low' | 'medium' | 'high';

export interface QualityPreset {
  name: QualityName;
  ripple: number;
  caustic: number;
  aberration: number;
  bloom: number;
  grain: number;
  debrisBlur: number;
  motes: number;
  bgDebris: number;
  fgDebris: number;
}

export interface DeviceProfile {
  width: number;
  height: number;
  dpr: number;
  memoryGB: number | null;
  cores: number | null;
  saveData: boolean;
  coarsePointer: boolean;
}

export const QUALITY_PRESETS: Record<QualityName, QualityPreset> = {
  low: {
    name: 'low',
    ripple: 1.25,
    caustic: 0.28,
    aberration: 0,
    bloom: 0,
    grain: 0.018,
    debrisBlur: 0,
    motes: 40,
    bgDebris: 8,
    fgDebris: 0,
  },
  medium: {
    name: 'medium',
    ripple: 2.15,
    caustic: 0.5,
    aberration: 0.008,
    bloom: 0.62,
    grain: 0.028,
    debrisBlur: 7,
    motes: 100,
    bgDebris: 16,
    fgDebris: 6,
  },
  high: {
    name: 'high',
    ripple: 2.7,
    caustic: 0.64,
    aberration: 0.012,
    bloom: 0.95,
    grain: 0.032,
    debrisBlur: 12,
    motes: 160,
    bgDebris: 26,
    fgDebris: 10,
  },
};

const QUALITY_KEY = 'primordial.quality';

export function detectDefaultQuality(profile: DeviceProfile): QualityName {
  const small = Math.min(profile.width, profile.height) < 700;
  const pixels = profile.width * profile.height * profile.dpr * profile.dpr;
  const memory = profile.memoryGB ?? 8;
  const cores = profile.cores ?? 8;
  if (profile.saveData || memory <= 2) return 'low';
  if (small && profile.coarsePointer && (memory <= 4 || cores <= 4)) return 'low';
  if (memory <= 4 || cores <= 4 || pixels > 1920 * 1080 * 3.2) return 'medium';
  return 'high';
}

export function chooseResolution(quality: QualityName, width: number, height: number, dpr: number): number {
  const caps = {
    low: { maxDpr: 1, maxPixels: 1920 * 1080 },
    medium: { maxDpr: 1.5, maxPixels: 2560 * 1440 },
    high: { maxDpr: 2, maxPixels: 3840 * 2160 },
  } as const;
  const cap = caps[quality];
  let resolution = Math.min(Math.max(dpr, 0.5), cap.maxDpr);
  const pixels = width * height * resolution * resolution;
  if (pixels > cap.maxPixels && width * height > 0) {
    resolution = Math.sqrt(cap.maxPixels / (width * height));
  }
  return Math.max(0.5, Math.round(resolution * 100) / 100);
}

export function currentDeviceProfile(): DeviceProfile {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: navigator.hardwareConcurrency || null,
    saveData: Boolean(nav.connection?.saveData),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  };
}

export function loadQuality(): QualityName {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch {
    // Private mode and some TVs throw on storage access.
  }
  return detectDefaultQuality(currentDeviceProfile());
}

export function saveQuality(quality: QualityName): void {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // Ignore storage failures; the choice still applies this session.
  }
}
