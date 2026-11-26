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
  isMenuFocused(): boolean;
  isMinimapFocused(): boolean;
  focusSlide(canvas: HTMLCanvasElement): void;
  openMenu(): void;
  focusMenu(): void;
  closeMenu(): void;
  moveMenu(dx: number, dy: number): boolean;
  isGuideOpen(): boolean;
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
      <div class="menu">
        <button type="button" class="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="menu-panel">☰</button>
        <section class="panel menu-panel" id="menu-panel" aria-label="Menu" hidden>
          <div class="menu-settings">
            <h1>Primordial</h1>
            <p class="stats" id="stats"></p>
            <p class="hint" id="hint"></p>
            <div class="quality" role="radiogroup" aria-label="Graphics quality">
              <span class="quality-label">Quality</span>
              <div class="quality-row">
                <button type="button" role="radio" data-quality="low" aria-checked="false">Low</button>
                <button type="button" role="radio" data-quality="medium" aria-checked="false">Medium</button>
                <button type="button" role="radio" data-quality="high" aria-checked="false">High</button>
              </div>
            </div>
            <button type="button" class="guide-open">Field guide</button>
          </div>
          <div class="guide-page" hidden>
            <button type="button" class="guide-back">← Menu</button>
            <h2>Field guide</h2>
            <div class="guide-list" tabindex="0" aria-label="Field guide entries">
              <article><canvas data-example="0" width="160" height="160" aria-hidden="true"></canvas><div><h3>Colony</h3><p>A living home that stores food and grows gatherers.</p></div></article>
              <article><canvas data-example="1" width="160" height="160" aria-hidden="true"></canvas><div><h3>Gatherer</h3><p>A swimming cell that collects nutrients for its colony.</p></div></article>
              <article><canvas data-example="2" width="160" height="160" aria-hidden="true"></canvas><div><h3>Ripe nutrient</h3><p>Red food that gatherers can collect.</p></div></article>
              <article><canvas data-example="3" width="160" height="160" aria-hidden="true"></canvas><div><h3>Rotten nutrient</h3><p>Food that has decayed and will disappear.</p></div></article>
              <article><canvas data-example="4" width="160" height="160" aria-hidden="true"></canvas><div><h3>Vacuole</h3><p>A budded drop-off point for a colony's gatherers.</p></div></article>
              <article><canvas data-example="5" width="160" height="160" aria-hidden="true"></canvas><div><h3>Membrane territory</h3><p>The glowing area surrounding a colony.</p></div></article>
              <article><div class="placeholder">Coming soon</div><div><h3>Warrior</h3><p>A future colony defender; not yet in the simulation.</p></div></article>
              <article><div class="placeholder">Coming soon</div><div><h3>Thief</h3><p>A future food raider; not yet in the simulation.</p></div></article>
              <article><div class="placeholder">Coming soon</div><div><h3>Predator</h3><p>A future threat to colonies; not yet in the simulation.</p></div></article>
            </div>
          </div>
        </section>
        </div>
    </div>
    <div class="bottom">
      <div class="minimap-frame" id="minimap-frame" tabindex="0" role="group" aria-label="Minimap. Drag to move the view. Arrow keys pan the slide. Up focuses the menu.">
        <canvas id="minimap" aria-hidden="true"></canvas>
      </div>
    </div>
  `;
  parent.appendChild(element);

  const stats = element.querySelector<HTMLElement>('#stats')!;
  const hint = element.querySelector<HTMLElement>('#hint')!;
  const buttons = [...element.querySelectorAll<HTMLButtonElement>('.quality button')];
  const menu = element.querySelector<HTMLElement>('.menu')!;
  const toggle = element.querySelector<HTMLButtonElement>('.menu-toggle')!;
  const panel = element.querySelector<HTMLElement>('.menu-panel')!;
  const settings = element.querySelector<HTMLElement>('.menu-settings')!;
  const guide = element.querySelector<HTMLElement>('.guide-page')!;
  const guideOpen = element.querySelector<HTMLButtonElement>('.guide-open')!;
  const guideBack = element.querySelector<HTMLButtonElement>('.guide-back')!;
  const guideList = element.querySelector<HTMLElement>('.guide-list')!;
  const frame = element.querySelector<HTMLElement>('#minimap-frame')!;
  const map = element.querySelector<HTMLCanvasElement>('#minimap')!;
  let statsText = '';
  let hintText = '';
  let dragging = false;

  const applyChecked = (quality: QualityName) => {
    for (const button of buttons) {
      const selected = button.dataset.quality === quality;
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
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

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (!open) {
      guide.hidden = true;
      settings.hidden = false;
    }
  };
  const checkedButton = () => buttons.find((button) => button.getAttribute('aria-checked') === 'true') ?? buttons[1];
  toggle.addEventListener('click', () => setOpen(Boolean(panel.hidden)));
  guideOpen.addEventListener('click', () => {
    settings.hidden = true;
    guide.hidden = false;
    guideBack.focus({ preventScroll: true });
  });
  guideBack.addEventListener('click', () => {
    guide.hidden = true;
    settings.hidden = false;
    guideOpen.focus({ preventScroll: true });
  });

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
    isMenuFocused() {
      return menu.contains(document.activeElement);
    },
    isMinimapFocused() {
      return document.activeElement === frame;
    },
    focusSlide(slide) {
      slide.focus({ preventScroll: true });
    },
    openMenu() {
      setOpen(true);
      checkedButton().focus({ preventScroll: true });
    },
    focusMenu() {
      toggle.focus({ preventScroll: true });
    },
    closeMenu() {
      if (!guide.hidden) {
        guideBack.click();
      } else {
        setOpen(false);
        canvas.focus({ preventScroll: true });
      }
    },
    moveMenu(dx, dy) {
      const index = buttons.findIndex((button) => button === document.activeElement);
      if (index >= 0 && dx !== 0) {
        const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + dx))];
        next.focus({ preventScroll: true });
        next.click();
        return true;
      }
      if (!dy) return true;
      if (document.activeElement === guideList) {
        if (dy < 0 && guideList.scrollTop === 0) {
          guideBack.focus({ preventScroll: true });
          return true;
        }
        return false;
      }
      if (panel.hidden) {
        if (dy > 0) frame.focus({ preventScroll: true });
      } else if (!guide.hidden) {
        if (document.activeElement === guideBack && dy > 0) guideList.focus({ preventScroll: true });
      } else if (document.activeElement === toggle && dy > 0) checkedButton().focus({ preventScroll: true });
      else if (index >= 0) (dy > 0 ? guideOpen : toggle).focus({ preventScroll: true });
      else if (document.activeElement === guideOpen && dy < 0) checkedButton().focus({ preventScroll: true });
      return true;
    },
    isGuideOpen() {
      return !panel.hidden && !guide.hidden;
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

export function drawMinimap(canvas: HTMLCanvasElement, state: SimState, camera: Camera, screen: ScreenSize): void {
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
  const populations = new Map<number, number>();
  for (const gatherer of state.gatherers) {
    populations.set(gatherer.colonyId, (populations.get(gatherer.colonyId) ?? 0) + 1);
  }
  for (const colony of state.colonies) {
    const population = populations.get(colony.id) ?? 0;
    ctx.fillStyle = `rgba(${colony.r},${colony.g},${colony.b},0.18)`;
    ctx.beginPath();
    ctx.ellipse(colony.x * sx, colony.y * sy, (128 + population * 14) * sx / 2, (128 + population * 14) * sy / 2, 0, 0, Math.PI * 2);
    ctx.fill();
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
