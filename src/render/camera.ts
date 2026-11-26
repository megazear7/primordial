import { clamp } from '../sim/math';

export interface ScreenSize {
  w: number;
  h: number;
}

/**
 * World camera. `x` and `y` are the world point at the center of the screen.
 * Zoom is screen pixels per world pixel.
 */
export class Camera {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;

  constructor(
    readonly worldWidth: number,
    readonly worldHeight: number,
  ) {
    this.x = worldWidth / 2;
    this.y = worldHeight / 2;
    this.zoom = 1;
    this.minZoom = 0.05;
    this.maxZoom = 6;
  }

  setViewport(screen: ScreenSize): void {
    const fit = Math.min(screen.w / this.worldWidth, screen.h / this.worldHeight) * 0.98;
    this.minZoom = clamp(fit, 0.02, this.maxZoom);
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.clamp(screen);
  }

  clamp(screen: ScreenSize): void {
    const viewW = screen.w / this.zoom;
    const viewH = screen.h / this.zoom;
    this.x = viewW >= this.worldWidth ? this.worldWidth / 2 : clamp(this.x, viewW / 2, this.worldWidth - viewW / 2);
    this.y = viewH >= this.worldHeight ? this.worldHeight / 2 : clamp(this.y, viewH / 2, this.worldHeight - viewH / 2);
  }

  pan(dxWorld: number, dyWorld: number, screen: ScreenSize): void {
    this.x += dxWorld;
    this.y += dyWorld;
    this.clamp(screen);
  }

  /** Zoom while keeping the world point under the screen anchor fixed. */
  zoomAt(nextZoom: number, anchorX: number, anchorY: number, screen: ScreenSize): void {
    const before = this.screenToWorld(anchorX, anchorY, screen);
    this.zoom = clamp(nextZoom, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(anchorX, anchorY, screen);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp(screen);
  }

  screenToWorld(sx: number, sy: number, screen: ScreenSize): { x: number; y: number } {
    return {
      x: (sx - screen.w / 2) / this.zoom + this.x,
      y: (sy - screen.h / 2) / this.zoom + this.y,
    };
  }

  viewRect(screen: ScreenSize): { x: number; y: number; w: number; h: number } {
    const w = screen.w / this.zoom;
    const h = screen.h / this.zoom;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  applyTo(
    container: { scale: { set(scale: number): void }; position: { set(x: number, y: number): void } },
    screen: ScreenSize,
  ): void {
    container.scale.set(this.zoom);
    container.position.set(screen.w / 2 - this.x * this.zoom, screen.h / 2 - this.y * this.zoom);
  }
}
