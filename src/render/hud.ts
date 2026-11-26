import type { LayoutMode, Orientation } from '../layout';
import type { Camera, ScreenSize } from './camera';
import type { QualityName } from './quality';
import type { SimState } from '../sim/types';

export interface Hud {
  element: HTMLElement;
  setLayout(layout: LayoutMode): void;
  setQuality(quality: QualityName, quiet?: boolean): void;
  update(state: SimState, fps: number, layout: LayoutMode): void;
  drawMap(state: SimState, camera: Camera, screen: ScreenSize): void;
  isQualityFocused(): boolean;
  isMinimapFocused(): boolean;
  focusSlide(canvas: HTMLCanvasElement): void;
  focusQuality(): void;
  moveQuality(dx: number, dy: number): void;
}

export function mountHud(
  parent: HTMLElement,
  canvas: HTMLCanvasElement,
  camera: Camera,
  getScreen: () => ScreenSize,
  onQuality: (quality: QualityName) => void,
  onUser: () => void,
): Hud {
  const element = document.createElement('div');
  element.className = 'hud';
  element.innerHTML = `
    <div class="top">
      <section class="panel title-card">
        <h1>Primordial</h1>
        <p class="subtitle">a living slide</p>
        <p class="stats" id="stats"></p>
        <p class="hint" id="hint"></p>
      </section>
      <div class="panel quality" role="radiogroup" aria-label="Graphics quality">
        <span class="quality-label" id="quality-label">Quality</span>
        <div class="quality-row">
          <button type="button" role="radio" data-quality="low" aria-checked="false">Low</button>
          <button type="button" role="radio" data-quality="medium" aria-checked="false">Medium</button>
          <button type="button" role="radio" data-quality="high" aria-checked="false">High</button>
        </div>
      </div>
    </div>
    <div class="bottom">
      <div class="minimap-frame" id="minimap-frame" tabindex="0" role="group" aria-label="Minimap. Drag to move the view. Arrow keys pan the slide. Up returns to quality.">
        <canvas id="minimap" aria-hidden="true"></canvas>
      </div>
    </div>
  `;
  parent.appendChild(element);

  const stats = element.querySelector<HTMLElement>('#stats')!;
  const hint = element.querySelector<HTMLElement>('#hint')!;
  const buttons = [...element.querySelectorAll<HTMLButtonElement>('.quality button')];
  const frame = element.querySelector<HTMLElement>('#minimap-frame')!;
  const map = element.querySelector<HTMLCanvasElement>('#minimap')!;
  let statsText = '';
  let hintText = '';
  let dragging = false;

  const applyChecked = (quality: QualityName) => {
    for (const button of buttons) {
      const selected = button.dataset.quality === quality;
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const quality = button.dataset.quality as QualityName;
      applyChecked(quality);
      onQuality(quality);
      onUser();
    });
  }

  const panMap = (clientX: number, clientY: number) => {
    const rect = frame.getBoundingClientRect();
    const nx = clamp01((clientX - rect.left) / rect.width);
    const ny = clamp01((clientY - rect.top) / rect.height);
    camera.x = nx * camera.worldWidth;
    camera.y = ny * camera.worldHeight;
    camera.clamp(getScreen());
    onUser();
  };

  frame.addEventListener('pointerdown', (event) => {
    dragging = true;
    frame.setPointerCapture(event.pointerId);
    panMap(event.clientX, event.clientY);
  });
  frame.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    panMap(event.clientX, event.clientY);
  });
  const endDrag = () => {
    dragging = false;
  };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);

  return {
    element,
    setLayout(layout) {
      const next = hintFor(layout);
      if (next !== hintText) {
        hint.textContent = next;
        hintText = next;
      }
    },
    setQuality(quality) {
      applyChecked(quality);
    },
    update(state, fps, layout) {
      const seconds = Math.floor(state.tick / 60);
      const clock = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
      const vacuoles = state.vacuoles.length ? ` · ${state.vacuoles.length} vacuoles` : '';
      const text = `${state.colonies.length} colonies · ${state.gatherers.length} gatherers · ${state.nutrients.length} nutrients${vacuoles} · ${clock} · ${Math.round(fps)} fps`;
      if (text !== statsText) {
        stats.textContent = text;
        statsText = text;
      }
      this.setLayout(layout);
    },
    drawMap(state, activeCamera, screen) {
      drawMinimap(map, state, activeCamera, screen);
    },
    isQualityFocused() {
      return buttons.some((button) => button === document.activeElement);
    },
    isMinimapFocused() {
      return document.activeElement === frame;
    },
    focusSlide(slide) {
      slide.focus({ preventScroll: true });
    },
    focusQuality() {
      const checked = buttons.find((button) => button.getAttribute('aria-checked') === 'true') ?? buttons[1];
      checked.focus({ preventScroll: true });
    },
    moveQuality(dx, dy) {
      const index = buttons.findIndex((button) => button === document.activeElement);
      if (dy > 0) {
        frame.focus({ preventScroll: true });
        return;
      }
      if (dx !== 0 && index >= 0) {
        const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + dx))];
        next.focus({ preventScroll: true });
      }
    },
  };

  function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}

function hintFor(layout: LayoutMode): string {
  if (layout === 'phone') return 'Drag to pan · pinch to zoom';
  if (layout === 'tablet') return 'Drag to pan · pinch or scroll to zoom';
  if (layout === 'tv') return 'Arrows pan · +/− zoom · Enter options · Esc back';
  return 'Drag to pan · scroll to zoom · arrows pan · +/− zoom';
}

function drawMinimap(canvas: HTMLCanvasElement, state: SimState, camera: Camera, screen: ScreenSize): void {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth < 2 || cssHeight < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
  gradient.addColorStop(0, '#11464e');
  gradient.addColorStop(1, '#062026');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const sx = cssWidth / state.config.worldWidth;
  const sy = cssHeight / state.config.worldHeight;
  const stride = state.nutrients.length > 480 ? 2 : 1;
  for (let i = 0; i < state.nutrients.length; i += stride) {
    const nutrient = state.nutrients[i];
    ctx.globalAlpha = nutrient.phase === 'rotten' ? 0.35 : 0.7;
    ctx.fillStyle = nutrient.phase === 'rotten' ? '#7d8650' : '#f0c56a';
    ctx.fillRect(nutrient.x * sx, nutrient.y * sy, Math.max(1.2, cssWidth * 0.008), Math.max(1.2, cssWidth * 0.008));
  }
  ctx.globalAlpha = 0.85;
  for (const vacuole of state.vacuoles) {
    const colony = state.colonies.find((item) => item.id === vacuole.colonyId);
    ctx.fillStyle = colony ? `rgb(${colony.r},${colony.g},${colony.b})` : '#9adfd0';
    ctx.beginPath();
    ctx.arc(vacuole.x * sx, vacuole.y * sy, Math.max(2, cssWidth * 0.012), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const colony of state.colonies) {
    ctx.fillStyle = `rgb(${colony.r},${colony.g},${colony.b})`;
    ctx.beginPath();
    ctx.arc(colony.x * sx, colony.y * sy, Math.max(3.5, cssWidth * 0.02), 0, Math.PI * 2);
    ctx.fill();
  }
  const view = camera.viewRect(screen);
  ctx.strokeStyle = 'rgba(236, 255, 248, 0.95)';
  ctx.lineWidth = Math.max(1.5, cssWidth * 0.008);
  ctx.strokeRect(view.x * sx, view.y * sy, Math.max(4, view.w * sx), Math.max(4, view.h * sy));
}

export type { Orientation };
