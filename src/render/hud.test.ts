import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../sim/world';
import { Camera } from './camera';
import { drawMinimap } from './hud';
import { nutrientTint } from './scene';

afterEach(() => vi.unstubAllGlobals());

describe('visual indicators', () => {
  it('uses red for all ripe nutrients and a distinct brown for rotten ones', () => {
    expect(nutrientTint('ripe')).toBe(0xff493c);
    expect(nutrientTint('rotten')).toBe(0x88503a);
  });

  it('draws territories, colonies, vacuoles and the viewport without food or gatherer markers', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const state = createWorld({ colonyCount: 1, startingGatherers: 2 });
    const colony = state.colonies[0];
    state.vacuoles.push({ id: -1, colonyId: colony.id, x: 100, y: 200, radius: 25, alive: true });
    const context = {
      setTransform: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      strokeRect: vi.fn(),
    };
    const canvas = {
      clientWidth: 200, clientHeight: 130, width: 0, height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const camera = new Camera(state.config.worldWidth, state.config.worldHeight);
    drawMinimap(canvas, state, camera, { w: 800, h: 600 });
    expect(context.fillRect).toHaveBeenCalledTimes(1);
    expect(context.ellipse).toHaveBeenCalledTimes(1);
    expect(context.arc).toHaveBeenCalledTimes(2);
    expect(context.strokeRect).toHaveBeenCalledTimes(1);
  });
});
