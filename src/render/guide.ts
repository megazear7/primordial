import { Rectangle } from 'pixi.js';
import type { Application } from 'pixi.js';
import { createWorld, foodRange } from '../sim/world';
import { Camera } from './camera';
import { QUALITY_PRESETS } from './quality';
import { Scene } from './scene';
import type { Textures } from './textures';
import { WaterFilter } from './water';

const SIZE = 160;
const SCREEN = { w: SIZE * 6, h: SIZE };

export function createGuide(app: Application, textures: Textures, element: HTMLElement): (time: number) => void {
  const examples = [...element.querySelectorAll<HTMLCanvasElement>('canvas[data-example]')];
  const state = createWorld({ colonyCount: 1, startingGatherers: 1 });
  const colony = state.colonies[0];
  const gatherer = state.gatherers[0];
  const nutrient = state.nutrients[0];
  const at = (index: number) => ({ x: SIZE * (index + 0.5), y: SIZE / 2 });
  state.config = { ...state.config, worldWidth: SCREEN.w, worldHeight: SCREEN.h };
  state.colonies = [
    { ...colony, ...at(0) },
    { ...colony, id: -1, ...at(5) },
  ];
  state.gatherers = [{ ...gatherer, ...at(1), vx: 1, vy: 0 }];
  state.nutrients = [
    { ...nutrient, ...at(2), food: foodRange(state).max, phase: 'ripe' },
    { ...nutrient, id: -2, ...at(3), phase: 'rotten' },
  ];
  state.vacuoles = [{ id: -3, colonyId: colony.id, ...at(4), radius: 25, alive: true }];

  const water = new WaterFilter();
  water.applyPreset(QUALITY_PRESETS.low, false);
  water.setResolution(SCREEN.w, SCREEN.h);
  const scene = new Scene(textures, water, SCREEN.w, SCREEN.h);
  scene.root.filters = null;
  scene.world.children.find((child) => child.label === 'rim')?.destroy();
  scene.setQuality(QUALITY_PRESETS.low);
  const camera = new Camera(SCREEN.w, SCREEN.h);
  let last = -Infinity;

  return (time) => {
    if (time - last < 0.5) return;
    last = time;
    water.time = time;
    scene.sync(state, camera, time, SCREEN, 'desktop');
    const image = app.renderer.extract.canvas({ target: scene.root, frame: new Rectangle(0, 0, SCREEN.w, SCREEN.h) });
    for (const canvas of examples) {
      const context = canvas.getContext('2d');
      const index = Number(canvas.dataset.example);
      const crop = index === 0 || index === 5 ? SIZE : SIZE / 2;
      context?.clearRect(0, 0, SIZE, SIZE);
      context?.drawImage(image as HTMLCanvasElement, index * SIZE + (SIZE - crop) / 2, (SIZE - crop) / 2, crop, crop, 0, 0, SIZE, SIZE);
    }
  };
}
