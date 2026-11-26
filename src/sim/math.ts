export interface Vec {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

/**
 * Move `d` units from p1 toward p2. Lands on p2 when the points are closer than d.
 * This is the old village `pointAlong`.
 */
export function pointAlong(p1: Vec, p2: Vec, d: number): Vec {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist <= d) return { x: p2.x, y: p2.y };
  const k = d / dist;
  return { x: p1.x + dx * k, y: p1.y + dy * k };
}

/**
 * One tick of the old `movePoint2` steering.
 * `agility` and `maxSpeed` are in world pixels per tick (the old per-frame units).
 */
export function steer(pos: Vec, dest: Vec, velocity: Vec, agility: number, maxSpeed: number): Vec {
  const predicted = { x: pos.x + velocity.x, y: pos.y + velocity.y };
  const corrected = pointAlong(predicted, dest, agility);
  const stepped = pointAlong(pos, corrected, maxSpeed);
  return { x: stepped.x - pos.x, y: stepped.y - pos.y };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(clamp(color, 0, 1) * 255);
  };
  return { r: f(0), g: f(8), b: f(4) };
}

export function lerpColor(a: number, b: number, t: number): number {
  const u = clamp(t, 0, 1);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * u);
  const g = Math.round(ag + (bg - ag) * u);
  const bl = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bl;
}

export function rgbHex(r: number, g: number, b: number): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}
