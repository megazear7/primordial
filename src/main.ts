import { Application } from 'pixi.js';
import './style.css';
import { classifyLayout, defaultZoom, orientationFor, readLayoutHints } from './layout';
import type { LayoutMode } from './layout';
import { Camera } from './render/camera';
import { mountHud } from './render/hud';
import { attachInput } from './render/input';
import { chooseResolution, currentDeviceProfile, loadQuality, QUALITY_PRESETS, saveQuality } from './render/quality';
import type { QualityName } from './render/quality';
import { Scene } from './render/scene';
import { createTextures } from './render/textures';
import { WaterFilter } from './render/water';
import { listenForAppUpdate } from './pwa';
import { createWorld, stepWorld } from './sim/world';

const state = createWorld();
const camera = new Camera(state.config.worldWidth, state.config.worldHeight);
let layout: LayoutMode = 'desktop';
let quality: QualityName = 'high';
let reducedMotion = false;
let cameraTouched = false;

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('Missing #app');

listenForAppUpdate();
void boot(appRoot);

async function boot(root: HTMLElement): Promise<void> {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  quality = loadQuality();
  const profile = currentDeviceProfile();
  const resolution = chooseResolution(quality, profile.width, profile.height, profile.dpr);

  const app = new Application();
  try {
    await app.init({
      preference: 'webgl',
      resizeTo: window,
      background: 0x01080a,
      antialias: true,
      autoDensity: true,
      resolution,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    root.textContent = 'Primordial needs WebGL to draw the slide.';
    console.error(error);
    return;
  }

  app.canvas.tabIndex = 0;
  app.canvas.setAttribute(
    'aria-label',
    'Primordial microscope. Drag or use arrow keys to pan. Pinch, scroll, or plus and minus to zoom. Enter opens quality. Escape returns to the slide.',
  );
  app.stage.eventMode = 'none';
  root.appendChild(app.canvas);

  const water = new WaterFilter();
  const scene = new Scene(createTextures(), water, state.config.worldWidth, state.config.worldHeight);
  scene.resizeBackground(state.config.worldWidth, state.config.worldHeight);
  scene.setQuality(QUALITY_PRESETS[quality]);
  water.applyPreset(QUALITY_PRESETS[quality], reducedMotion);
  app.stage.addChild(scene.root);

  const screenOf = () => ({ w: window.innerWidth, h: window.innerHeight });
  const hud = mountHud(document.body, app.canvas, camera, screenOf, (next) => {
    quality = next;
    saveQuality(next);
    applyQuality(app, scene, water);
  }, () => {
    cameraTouched = true;
  });
  hud.setQuality(quality);

  const input = attachInput({
    canvas: app.canvas,
    camera,
    getScreen: screenOf,
    getLayout: () => layout,
    isQualityFocused: () => hud.isQualityFocused(),
    isMinimapFocused: () => hud.isMinimapFocused(),
    onQualityArrow: (dx, dy) => hud.moveQuality(dx, dy),
    onFocusQuality: () => hud.focusQuality(),
    onFocusSlide: () => hud.focusSlide(app.canvas),
    onUser: () => {
      cameraTouched = true;
    },
  });

  const frame = () => {
    layout = classifyLayout(window.innerWidth, window.innerHeight, readLayoutHints());
    document.documentElement.dataset.layout = layout;
    document.documentElement.dataset.orientation = orientationFor(window.innerWidth, window.innerHeight);
    if (!cameraTouched) camera.zoom = defaultZoom(window.innerWidth, window.innerHeight, layout);
    camera.setViewport(screenOf());
    applyQuality(app, scene, water);
  };

  window.addEventListener('resize', frame);
  window.visualViewport?.addEventListener('resize', frame);
  window.addEventListener('orientationchange', frame);
  watchDevicePixelRatio(frame);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    reducedMotion = event.matches;
    water.applyPreset(QUALITY_PRESETS[quality], reducedMotion);
  });

  frame();
  app.canvas.focus({ preventScroll: true });

  let last = performance.now();
  let accumulator = 0;
  let fps = 60;
  const step = 1 / 60;
  app.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const instant = dt > 0 ? 1 / dt : 60;
    fps += (instant - fps) * 0.08;
    input.update(dt);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= step && steps < 3) {
      stepWorld(state);
      accumulator -= step;
      steps += 1;
    }
    if (steps === 3) accumulator = 0;
    const screen = screenOf();
    camera.setViewport(screen);
    const motion = reducedMotion ? 0.35 : 1;
    water.time = (now / 1000) * motion;
    water.setResolution(app.renderer.width, app.renderer.height);
    scene.sync(state, camera, now / 1000, screen, layout);
    hud.update(state, fps, layout);
    hud.drawMap(state, camera, screen);
  });

  window.addEventListener('pagehide', () => input.destroy());
}

function applyQuality(app: Application, scene: Scene, water: WaterFilter): void {
  const resolution = chooseResolution(quality, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  app.renderer.resize(window.innerWidth, window.innerHeight, resolution);
  scene.setQuality(QUALITY_PRESETS[quality]);
  water.applyPreset(QUALITY_PRESETS[quality], reducedMotion);
}

function watchDevicePixelRatio(onChange: () => void): void {
  const media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const handler = () => {
    media.removeEventListener('change', handler);
    onChange();
    watchDevicePixelRatio(onChange);
  };
  media.addEventListener('change', handler);
}
