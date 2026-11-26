import type { LayoutMode } from '../layout';
import type { Camera, ScreenSize } from './camera';

export interface InputController {
  update(dt: number): void;
  destroy(): void;
}

export interface InputOptions {
  canvas: HTMLCanvasElement;
  camera: Camera;
  getScreen: () => ScreenSize;
  getLayout: () => LayoutMode;
  isMenuFocused: () => boolean;
  isMinimapFocused: () => boolean;
  onMenuArrow: (dx: number, dy: number) => boolean;
  onOpenMenu: () => void;
  onFocusMenu: () => void;
  onCloseMenu: () => void;
  onFocusSlide: () => void;
  onUser: () => void;
}

export function attachInput(options: InputOptions): InputController {
  const { canvas, camera } = options;
  const held = new Set<string>();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; midX: number; midY: number } | null = null;
  let heldFor = 0;

  const local = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const pinchFromPointers = () => {
    if (pointers.size < 2) return null;
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    canvas.focus({ preventScroll: true });
    pointers.set(event.pointerId, local(event.clientX, event.clientY));
    canvas.setPointerCapture(event.pointerId);
    pinch = pinchFromPointers();
    options.onUser();
  };

  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = local(event.clientX, event.clientY);
    pointers.set(event.pointerId, next);
    const screen = options.getScreen();
    if (pointers.size >= 2) {
      const now = pinchFromPointers();
      if (now && pinch && pinch.dist > 8) {
        camera.zoomAt(camera.zoom * (now.dist / pinch.dist), now.midX, now.midY, screen);
        camera.pan((pinch.midX - now.midX) / camera.zoom, (pinch.midY - now.midY) / camera.zoom, screen);
        options.onUser();
      }
      pinch = now;
      return;
    }
    camera.pan((previous.x - next.x) / camera.zoom, (previous.y - next.y) / camera.zoom, screen);
    options.onUser();
  };

  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    pinch = pinchFromPointers();
  };

  const onWheel = (event: WheelEvent) => {
    if (event.target !== canvas) return;
    event.preventDefault();
    const point = local(event.clientX, event.clientY);
    const delta = Math.abs(event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY);
    const signed = Math.sign(event.deltaY) * Math.min(delta, 120);
    camera.zoomAt(camera.zoom * Math.exp(-signed * 0.0016), point.x, point.y, options.getScreen());
    options.onUser();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditable(event.target)) return;
    const zoom = zoomDirection(event);
    const arrow = arrowDirection(event);
    const menu = options.isMenuFocused();
    if (menu) {
      held.clear();
      if (isBackKey(event)) {
        event.preventDefault();
        options.onCloseMenu();
      } else if (arrow && options.onMenuArrow(arrow.x, arrow.y)) {
        event.preventDefault();
      }
      return;
    }
    if (event.code === 'Home') {
      event.preventDefault();
      camera.x = camera.worldWidth / 2;
      camera.y = camera.worldHeight / 2;
      camera.clamp(options.getScreen());
      options.onUser();
      return;
    }
    if (event.key === 'Enter') {
      if (document.activeElement === canvas) {
        event.preventDefault();
        options.onOpenMenu();
      } else if (options.isMinimapFocused()) {
        event.preventDefault();
        options.onFocusSlide();
      }
      return;
    }
    if (isBackKey(event) && options.isMinimapFocused()) {
      event.preventDefault();
      options.onFocusSlide();
      return;
    }
    if (isBackKey(event)) event.preventDefault();
    if (arrow && options.isMinimapFocused() && arrow.y < 0 && arrow.x === 0) {
      event.preventDefault();
      options.onFocusMenu();
      return;
    }
    if (zoom || arrow) {
      event.preventDefault();
      held.add(event.code);
      if (event.key === '+' || event.key === '-' || event.key === '_' || event.key === '=') held.add(`key:${event.key}`);
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
    held.delete(`key:${event.key}`);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('gesturestart', (event) => event.preventDefault());
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => held.clear());

  return {
    update(dt: number) {
      if (options.isMenuFocused()) {
        held.clear();
        heldFor = 0;
        return;
      }
      const screen = options.getScreen();
      let dx = 0;
      let dy = 0;
      if (held.has('ArrowLeft') || held.has('KeyA')) dx -= 1;
      if (held.has('ArrowRight') || held.has('KeyD')) dx += 1;
      if (held.has('ArrowUp') || held.has('KeyW')) dy -= 1;
      if (held.has('ArrowDown') || held.has('KeyS')) dy += 1;
      if (dx || dy) {
        heldFor += dt;
        const layout = options.getLayout();
        const base = layout === 'tv' ? Math.max(860, screen.w * 0.32) : layout === 'phone' ? 500 : 660;
        const accel = 1 + Math.min(1.3, heldFor) * 1.2;
        const speed = (base * accel * dt) / camera.zoom;
        const length = Math.hypot(dx, dy) || 1;
        camera.pan((dx / length) * speed, (dy / length) * speed, screen);
        options.onUser();
      } else {
        heldFor = 0;
      }
      const zoom = heldZoom(held);
      if (zoom) {
        camera.zoomAt(camera.zoom * Math.exp(zoom * 0.9 * dt), screen.w / 2, screen.h / 2, screen);
        options.onUser();
      }
    },
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endPointer);
      canvas.removeEventListener('pointercancel', endPointer);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}

function heldZoom(held: Set<string>): number {
  let zoom = 0;
  for (const code of held) {
    if (
      code === 'Equal' ||
      code === 'NumpadAdd' ||
      code === 'ZoomIn' ||
      code === 'PageUp' ||
      code === 'ChannelUp' ||
      code === 'MediaFastForward' ||
      code === 'key:+' ||
      code === 'key:='
    ) {
      zoom += 1;
    } else if (
      code === 'Minus' ||
      code === 'NumpadSubtract' ||
      code === 'ZoomOut' ||
      code === 'PageDown' ||
      code === 'ChannelDown' ||
      code === 'MediaRewind' ||
      code === 'key:-' ||
      code === 'key:_'
    ) {
      zoom -= 1;
    }
  }
  return Math.sign(zoom);
}

function zoomDirection(event: KeyboardEvent): number {
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd' || event.code === 'ZoomIn') return 1;
  if (event.code === 'PageUp' || event.code === 'ChannelUp' || event.code === 'MediaFastForward') return 1;
  if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract' || event.code === 'ZoomOut') return -1;
  if (event.code === 'PageDown' || event.code === 'ChannelDown' || event.code === 'MediaRewind') return -1;
  return 0;
}

function arrowDirection(event: KeyboardEvent): { x: number; y: number } | null {
  switch (event.code) {
    case 'ArrowLeft':
    case 'KeyA':
      return { x: -1, y: 0 };
    case 'ArrowRight':
    case 'KeyD':
      return { x: 1, y: 0 };
    case 'ArrowUp':
    case 'KeyW':
      return { x: 0, y: -1 };
    case 'ArrowDown':
    case 'KeyS':
      return { x: 0, y: 1 };
    default:
      return null;
  }
}

function isBackKey(event: KeyboardEvent): boolean {
  return event.key === 'Escape' || event.key === 'Backspace' || event.code === 'GoBack' || event.code === 'BrowserBack';
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
