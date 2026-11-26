import { Texture } from 'pixi.js';

export interface Textures {
  radial: Texture;
  body: Texture;
  water: Texture;
}

export function createTextures(): Textures {
  return {
    radial: Texture.from(paintRadial(256)),
    body: Texture.from(paintBody(192, 128)),
    water: Texture.from(paintWater(768, 512)),
  };
}

function paintRadial(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const half = size / 2;
  const glow = ctx.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.34, 'rgba(255,255,255,0.45)');
  glow.addColorStop(0.62, 'rgba(255,255,255,0.14)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function paintBody(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const cx = width * 0.62;
  const cy = height * 0.5;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.85)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(cx + 46, cy);
  ctx.bezierCurveTo(cx + 20, cy - 34, cx - 36, cy - 30, cx - 28, cy);
  ctx.bezierCurveTo(cx - 36, cy + 30, cx + 20, cy + 34, cx + 46, cy);
  ctx.fill();
  ctx.restore();

  const highlight = ctx.createRadialGradient(cx - 8, cy - 10, 2, cx, cy, 34);
  highlight.addColorStop(0, 'rgba(255,255,255,0.95)');
  highlight.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy, 30, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(8, 24, 28, 0.55)';
  ctx.beginPath();
  ctx.ellipse(cx + 24, cy - 2, 4.5, 5.5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function paintWater(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const base = ctx.createRadialGradient(
    width * 0.48,
    height * 0.42,
    width * 0.04,
    width * 0.5,
    height * 0.55,
    width * 0.78,
  );
  base.addColorStop(0, '#0d3c44');
  base.addColorStop(0.42, '#082830');
  base.addColorStop(0.75, '#041820');
  base.addColorStop(1, '#02080c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const blooms: Array<[string, number, number, number, number]> = [
    ['#1c6d72', 0.28, 0.32, 0.26, 0.4],
    ['#163e62', 0.74, 0.58, 0.32, 0.38],
    ['#0f5a48', 0.42, 0.78, 0.24, 0.32],
    ['#243864', 0.82, 0.18, 0.2, 0.28],
    ['#0c4048', 0.15, 0.7, 0.18, 0.22],
  ];
  for (const [color, x, y, radius, alpha] of blooms) {
    const glow = ctx.createRadialGradient(width * x, height * y, 0, width * x, height * y, width * radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.globalAlpha = 1;

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 16) {
    const n = (hash(i) - 0.5) * 14;
    data[i] = clampByte(data[i] + n * 0.4);
    data[i + 1] = clampByte(data[i + 1] + n);
    data[i + 2] = clampByte(data[i + 2] + n * 0.75);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
