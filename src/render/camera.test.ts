import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('camera', () => {
  it('keeps the anchor world point still while zooming', () => {
    const camera = new Camera(6400, 4200);
    const screen = { w: 1440, h: 900 };
    camera.zoom = 1;
    camera.setViewport(screen);
    const anchor = { x: 400, y: 260 };
    const before = camera.screenToWorld(anchor.x, anchor.y, screen);
    camera.zoomAt(camera.zoom * 1.4, anchor.x, anchor.y, screen);
    const after = camera.screenToWorld(anchor.x, anchor.y, screen);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('clamps panning to the slide', () => {
    const camera = new Camera(1000, 800);
    const screen = { w: 400, h: 300 };
    camera.zoom = 1;
    camera.setViewport(screen);
    camera.pan(-5000, 5000, screen);
    expect(camera.x).toBeCloseTo(200, 5);
    expect(camera.y).toBeCloseTo(650, 5);
    camera.zoom = 0.01;
    camera.setViewport(screen);
    expect(camera.x).toBeCloseTo(500, 5);
    expect(camera.y).toBeCloseTo(400, 5);
  });
});
