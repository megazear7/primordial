import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { LayoutMode } from '../layout';
import { lerpColor, rgbHex } from '../sim/math';
import type { ColonyState, GathererState, SimState } from '../sim/types';
import { foodRange } from '../sim/world';
import type { Camera, ScreenSize } from './camera';
import type { QualityPreset } from './quality';
import type { Textures } from './textures';
import type { WaterFilter } from './water';

interface GathererView {
  body: Sprite;
  halo: Sprite;
  angle: number;
  trail: Array<{ x: number; y: number }>;
}

interface ColonyView {
  halo: Sprite;
  body: Sprite;
  nucleus: Sprite;
  spec: Sprite;
  label: Text;
  organelles: Sprite[];
}

interface DriftSprite {
  sprite: Sprite;
  x: number;
  y: number;
  parallax: number;
  phase: number;
  drift: number;
}

const RADIAL = 256;

export class Scene {
  readonly root = new Container();
  readonly world = new Container();
  private readonly membraneLayer = new Container();
  private readonly bodyLayer = new Container();
  private readonly nutrientLayer = new Container();
  private readonly gathererLayer = new Container();
  private readonly labelLayer = new Container();
  private readonly trails = new Graphics();
  private readonly bgDebris = new Container();
  private readonly fgDebris = new Container();
  private readonly motes: DriftSprite[] = [];
  private readonly bgBits: DriftSprite[] = [];
  private readonly fgBits: DriftSprite[] = [];
  private readonly bgBlur = new BlurFilter({ strength: 8, quality: 2, kernelSize: 5 });
  private readonly fgBlur = new BlurFilter({ strength: 14, quality: 2, kernelSize: 7 });
  private readonly colonies = new Map<number, ColonyView>();
  private readonly vacuoles = new Map<number, Sprite>();
  private readonly nutrients = new Map<number, Sprite>();
  private readonly gatherers = new Map<number, GathererView>();
  private moteLimit = 100;
  private bgLimit = 16;
  private fgLimit = 6;

  constructor(
    private readonly textures: Textures,
    water: WaterFilter,
    worldWidth: number,
    worldHeight: number,
  ) {
    const background = new Sprite(textures.water);
    background.width = worldWidth;
    background.height = worldHeight;
    this.world.addChild(background);
    this.world.addChild(this.bgDebris);
    this.world.addChild(this.membraneLayer);
    this.world.addChild(this.bodyLayer);
    this.world.addChild(this.nutrientLayer);
    this.world.addChild(this.trails);
    this.world.addChild(this.gathererLayer);
    this.world.addChild(this.labelLayer);
    this.world.addChild(this.fgDebris);
    this.root.addChild(this.world);
    this.root.filters = [water.filter];
    this.trails.blendMode = 'add';
    this.seedDrift(worldWidth, worldHeight);
    this.drawRim(worldWidth, worldHeight);
  }

  resizeBackground(worldWidth: number, worldHeight: number): void {
    const background = this.world.children[0] as Sprite;
    background.width = worldWidth;
    background.height = worldHeight;
    this.drawRim(worldWidth, worldHeight);
  }

  setQuality(preset: QualityPreset): void {
    this.moteLimit = preset.motes;
    this.bgLimit = preset.bgDebris;
    this.fgLimit = preset.fgDebris;
    this.bgBlur.strength = Math.max(1, preset.debrisBlur);
    this.fgBlur.strength = Math.max(1, preset.debrisBlur + 4);
    this.bgDebris.filters = preset.debrisBlur > 0 ? [this.bgBlur] : null;
    this.fgDebris.filters = preset.debrisBlur > 0 ? [this.fgBlur] : null;
    this.motes.forEach((mote, index) => {
      mote.sprite.visible = index < preset.motes;
    });
    this.bgBits.forEach((bit, index) => {
      bit.sprite.visible = index < preset.bgDebris;
    });
    this.fgBits.forEach((bit, index) => {
      bit.sprite.visible = index < preset.fgDebris;
    });
  }

  sync(
    state: SimState,
    camera: Camera,
    time: number,
    screen: ScreenSize,
    layout: LayoutMode,
  ): void {
    camera.applyTo(this.world, screen);
    this.placeDrift(this.motes, this.moteLimit, camera, time);
    this.placeDrift(this.bgBits, this.bgLimit, camera, time);
    this.placeDrift(this.fgBits, this.fgLimit, camera, time);

    const counts = new Map<number, number>();
    for (const gatherer of state.gatherers) {
      counts.set(gatherer.colonyId, (counts.get(gatherer.colonyId) ?? 0) + 1);
    }
    const { max } = foodRange(state);
    const labelPx = layout === 'tv' ? 28 : layout === 'phone' ? 13 : 16;

    this.syncColonies(state, counts, time, camera, labelPx);
    this.syncVacuoles(state, time);
    this.syncNutrients(state, time, max, camera, screen);
    this.syncGatherers(state, time, camera, screen);
  }

  private syncColonies(
    state: SimState,
    counts: Map<number, number>,
    time: number,
    camera: Camera,
    labelPx: number,
  ): void {
    const seen = new Set<number>();
    for (const colony of state.colonies) {
      seen.add(colony.id);
      const view = this.colonyView(colony);
      const pop = counts.get(colony.id) ?? 0;
      const diameter = 128 + pop * 14;
      const wobble = Math.sin(time * 1.25 + colony.id);
      const tint = rgbHex(colony.r, colony.g, colony.b);
      view.halo.position.set(colony.x, colony.y);
      view.halo.tint = tint;
      view.halo.scale.set((diameter / RADIAL) * (1 + wobble * 0.035), (diameter / RADIAL) * (1 - wobble * 0.028));
      view.halo.alpha = 0.2 + Math.min(0.12, pop * 0.008);
      view.body.position.set(colony.x, colony.y);
      view.body.tint = tint;
      view.body.scale.set((diameter * 0.5) / RADIAL);
      view.body.alpha = 0.88;
      const nucleus = 32 + Math.min(46, colony.food * 0.32);
      view.nucleus.position.set(colony.x, colony.y);
      view.nucleus.tint = lerpColor(tint, 0xfff6e8, 0.35);
      view.nucleus.scale.set((nucleus / RADIAL) * (1 + Math.sin(time * 2.1 + colony.id) * 0.04));
      view.spec.position.set(colony.x - nucleus * 0.16, colony.y - nucleus * 0.18);
      view.spec.scale.set((nucleus * 0.22) / RADIAL);
      view.organelles.forEach((organelle, index) => {
        const angle = time * (0.45 + index * 0.17) + colony.id + index;
        const orbit = diameter * (0.12 + index * 0.035);
        organelle.position.set(
          colony.x + Math.cos(angle) * orbit,
          colony.y + Math.sin(angle) * orbit * 0.72,
        );
        organelle.scale.set((10 + index * 3) / RADIAL);
      });
      const food = Math.floor(colony.food).toString();
      if (view.label.text !== food) view.label.text = food;
      view.label.position.set(colony.x, colony.y + nucleus * 0.15);
      view.label.scale.set(labelPx / 48 / camera.zoom);
      view.label.visible = camera.zoom > 0.22;
    }
    this.dropUnused(this.colonies, seen, (view) => {
      view.halo.destroy();
      view.body.destroy();
      view.nucleus.destroy();
      view.spec.destroy();
      view.label.destroy();
      view.organelles.forEach((organelle) => organelle.destroy());
    });
  }

  private syncVacuoles(state: SimState, time: number): void {
    const colors = new Map(state.colonies.map((colony) => [colony.id, colony]));
    const seen = new Set<number>();
    for (const vacuole of state.vacuoles) {
      seen.add(vacuole.id);
      let sprite = this.vacuoles.get(vacuole.id);
      if (!sprite) {
        sprite = new Sprite(this.textures.radial);
        sprite.anchor.set(0.5);
        sprite.blendMode = 'add';
        this.membraneLayer.addChild(sprite);
        this.vacuoles.set(vacuole.id, sprite);
      }
      const colony = colors.get(vacuole.colonyId);
      const wobble = 1 + Math.sin(time * 1.6 + vacuole.id) * 0.04;
      sprite.position.set(vacuole.x, vacuole.y);
      sprite.tint = colony ? rgbHex(colony.r, colony.g, colony.b) : 0x88e0c8;
      sprite.alpha = 0.55;
      sprite.scale.set((118 / RADIAL) * wobble);
    }
    this.dropUnused(this.vacuoles, seen, (sprite) => sprite.destroy());
  }

  private syncNutrients(
    state: SimState,
    time: number,
    maxFood: number,
    camera: Camera,
    screen: ScreenSize,
  ): void {
    const seen = new Set<number>();
    for (const nutrient of state.nutrients) {
      seen.add(nutrient.id);
      let sprite = this.nutrients.get(nutrient.id);
      if (!sprite) {
        sprite = new Sprite(this.textures.radial);
        sprite.anchor.set(0.5);
        sprite.blendMode = 'add';
        this.nutrientLayer.addChild(sprite);
        this.nutrients.set(nutrient.id, sprite);
      }
      const visible = inView(nutrient.x, nutrient.y, camera, screen, 40);
      sprite.visible = visible;
      if (!visible) continue;
      const rotten = nutrient.phase === 'rotten';
      const t = nutrient.food / maxFood;
      sprite.tint = rotten ? 0x6e7846 : t < 0.55 ? lerpColor(0xa9c96c, 0xe7c15a, t / 0.55) : lerpColor(0xe7c15a, 0xff5c38, (t - 0.55) / 0.45);
      const pulse = 1 + Math.sin(time * 2.4 + nutrient.phaseSeed) * 0.06;
      const size = (rotten ? 16 : 18 + t * 16) * pulse;
      sprite.alpha = rotten ? 0.38 : 0.9;
      sprite.scale.set(size / RADIAL);
      sprite.position.set(nutrient.x, nutrient.y);
    }
    this.dropUnused(this.nutrients, seen, (sprite) => sprite.destroy());
  }

  private syncGatherers(state: SimState, time: number, camera: Camera, screen: ScreenSize): void {
    const colors = new Map(state.colonies.map((colony) => [colony.id, rgbHex(colony.r, colony.g, colony.b)]));
    const seen = new Set<number>();
    this.trails.clear();
    for (const gatherer of state.gatherers) {
      seen.add(gatherer.id);
      const view = this.gathererView(gatherer);
      const visible = inView(gatherer.x, gatherer.y, camera, screen, 80);
      view.body.visible = visible;
      view.halo.visible = visible;
      if (!visible) continue;
      const speed = Math.hypot(gatherer.vx, gatherer.vy);
      if (speed > 0.08) view.angle = Math.atan2(gatherer.vy, gatherer.vx);
      const wobble = Math.sin(time * 7.2 + gatherer.id * 1.7);
      const tint = colors.get(gatherer.colonyId) ?? 0xb6fff0;
      const base = 40 / this.textures.body.width;
      view.body.position.set(gatherer.x, gatherer.y);
      view.body.rotation = view.angle;
      view.body.tint = tint;
      view.body.scale.set(base * (1 + wobble * 0.16), base * (1 - wobble * 0.12));
      view.halo.position.set(gatherer.x, gatherer.y);
      view.halo.tint = tint;
      view.halo.alpha = 0.45 + wobble * 0.08;
      view.halo.scale.set((34 / RADIAL) * (1 + wobble * 0.08));
      this.pushTrail(view, gatherer);
      this.drawTrail(view, tint, time);
    }
    this.dropUnused(this.gatherers, seen, (view) => {
      view.body.destroy();
      view.halo.destroy();
    });
  }

  private pushTrail(view: GathererView, gatherer: GathererState): void {
    const last = view.trail[view.trail.length - 1];
    if (!last || (last.x - gatherer.x) ** 2 + (last.y - gatherer.y) ** 2 > 9) {
      view.trail.push({ x: gatherer.x, y: gatherer.y });
      if (view.trail.length > 9) view.trail.shift();
    }
  }

  private drawTrail(view: GathererView, tint: number, time: number): void {
    const trail = view.trail;
    if (trail.length > 1) {
      this.trails.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) this.trails.lineTo(trail[i].x, trail[i].y);
      this.trails.stroke({ width: 5, color: tint, alpha: 0.16, cap: 'round', join: 'round' });
    }
    const angle = view.angle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const sideX = -dirY;
    const sideY = dirX;
    const originX = view.body.x - dirX * 16;
    const originY = view.body.y - dirY * 16;
    for (let tail = 0; tail < 2; tail++) {
      const phase = time * 8 + view.body.position.x * 0.01 + tail * 1.8;
      const sign = tail === 0 ? 1 : -1;
      this.trails.moveTo(originX, originY);
      const segments = 6;
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const along = t * 28;
        const wave = Math.sin(t * 8.5 - phase) * (2.2 + t * 6) * sign;
        this.trails.lineTo(originX - dirX * along + sideX * wave, originY - dirY * along + sideY * wave);
      }
      this.trails.stroke({ width: 1.7, color: tint, alpha: 0.72, cap: 'round', join: 'round' });
    }
  }

  private colonyView(colony: ColonyState): ColonyView {
    let view = this.colonies.get(colony.id);
    if (view) return view;
    const halo = new Sprite(this.textures.radial);
    const body = new Sprite(this.textures.radial);
    const nucleus = new Sprite(this.textures.radial);
    const spec = new Sprite(this.textures.radial);
    for (const sprite of [halo, body, nucleus, spec]) sprite.anchor.set(0.5);
    halo.blendMode = 'add';
    spec.blendMode = 'add';
    spec.tint = 0xffffff;
    spec.alpha = 0.7;
    const organelles = [0, 1, 2].map(() => {
      const organelle = new Sprite(this.textures.radial);
      organelle.anchor.set(0.5);
      organelle.blendMode = 'add';
      organelle.tint = 0xfff4d2;
      organelle.alpha = 0.8;
      this.bodyLayer.addChild(organelle);
      return organelle;
    });
    const label = new Text({
      text: '0',
      style: {
        fontFamily: 'Georgia, Palatino, serif',
        fontSize: 48,
        fill: '#f3fffb',
        stroke: { color: '#021014', width: 8 },
        align: 'center',
      },
    });
    label.anchor.set(0.5);
    this.membraneLayer.addChild(halo);
    this.bodyLayer.addChild(body, nucleus, spec);
    this.labelLayer.addChild(label);
    view = { halo, body, nucleus, spec, label, organelles };
    this.colonies.set(colony.id, view);
    return view;
  }

  private gathererView(gatherer: GathererState): GathererView {
    let view = this.gatherers.get(gatherer.id);
    if (view) return view;
    const body = new Sprite(this.textures.body);
    const halo = new Sprite(this.textures.radial);
    body.anchor.set(0.62, 0.5);
    halo.anchor.set(0.5);
    halo.blendMode = 'add';
    this.gathererLayer.addChild(halo, body);
    view = { body, halo, angle: 0, trail: [] };
    this.gatherers.set(gatherer.id, view);
    return view;
  }

  private seedDrift(worldWidth: number, worldHeight: number): void {
    for (let i = 0; i < 160; i++) {
      this.motes.push(this.makeDrift(this.bgDebris, worldWidth, worldHeight, 0.62, 3 + (i % 5), 0.15 + (i % 7) * 0.03));
    }
    for (let i = 0; i < 26; i++) {
      this.bgBits.push(this.makeDrift(this.bgDebris, worldWidth, worldHeight, 0.42, 70 + (i % 6) * 28, 0.08));
    }
    for (let i = 0; i < 10; i++) this.fgBits.push(this.makeDrift(this.fgDebris, worldWidth, worldHeight, 1.18, 90 + i * 14, 0.055));
  }

  private makeDrift(
    layer: Container,
    worldWidth: number,
    worldHeight: number,
    parallax: number,
    size: number,
    alpha: number,
  ): DriftSprite {
    const sprite = new Sprite(this.textures.radial);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.tint = size > 40 ? 0x7eb8c4 : 0xd7fff4;
    sprite.alpha = alpha;
    sprite.scale.set(size / RADIAL);
    layer.addChild(sprite);
    const unit = hashUnit(layer.children.length * 97 + size);
    return {
      sprite,
      x: unit * worldWidth,
      y: hashUnit(size * 13 + layer.children.length) * worldHeight,
      parallax,
      phase: unit * Math.PI * 2,
      drift: 0.15 + unit * 0.4,
    };
  }

  private placeDrift(items: DriftSprite[], limit: number, camera: Camera, time: number): void {
    const centerX = camera.worldWidth / 2;
    const centerY = camera.worldHeight / 2;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (i >= limit) continue;
      const x = wrap(item.x + Math.sin(time * item.drift + item.phase) * 30, camera.worldWidth);
      const y = wrap(item.y + Math.cos(time * item.drift * 0.8 + item.phase) * 24, camera.worldHeight);
      item.sprite.position.set(
        x + (camera.x - centerX) * (1 - item.parallax),
        y + (camera.y - centerY) * (1 - item.parallax),
      );
    }
  }

  private drawRim(worldWidth: number, worldHeight: number): void {
    let rim = this.world.children.find((child) => child.label === 'rim');
    if (rim) rim.destroy();
    const graphic = new Graphics();
    graphic.label = 'rim';
    graphic.rect(18, 18, worldWidth - 36, worldHeight - 36);
    graphic.stroke({ width: 10, color: 0xb7fff0, alpha: 0.16 });
    graphic.rect(34, 34, worldWidth - 68, worldHeight - 68);
    graphic.stroke({ width: 2, color: 0xe7fff8, alpha: 0.18 });
    this.world.addChild(graphic);
  }

  private dropUnused<T>(map: Map<number, T>, seen: Set<number>, destroy: (value: T) => void): void {
    for (const [id, value] of map) {
      if (seen.has(id)) continue;
      destroy(value);
      map.delete(id);
    }
  }
}

function inView(x: number, y: number, camera: Camera, screen: ScreenSize, margin: number): boolean {
  const halfW = screen.w / camera.zoom / 2 + margin;
  const halfH = screen.h / camera.zoom / 2 + margin;
  return Math.abs(x - camera.x) <= halfW && Math.abs(y - camera.y) <= halfH;
}

function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  return ((value % size) + size) % size;
}

function hashUnit(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
