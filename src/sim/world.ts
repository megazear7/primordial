import { clamp, distance, steer } from './math';
import { hslToRgb } from './math';
import { randomOf } from './rng';
import type {
  ColonyState,
  GathererState,
  Genes,
  NutrientState,
  SimConfig,
  SimState,
  VacuoleState,
} from './types';
import {
  BASE_ADVENTUROUSNESS,
  BASE_HOME_SPEED,
  BASE_MAX_AGE,
  BASE_MAX_POP,
  BASE_VILLAGER_AGGRESSIVENESS,
  BASE_VILLAGER_AGILITY,
  BASE_VILLAGER_HEROISM,
  BASE_VILLAGER_MAX_SPEED,
  BASE_VILLAGER_STRENGTH,
  DEFAULT_CONFIG,
  EXPANSION_RATE,
  GATHERER_SAFETY_CAP,
  MAJOR_EVERY,
  MAX_VACUOLES,
  MUTATION_RATE,
  OUTPOST_POPULATION,
  STARTING_VARIABILITY,
} from './types';

const CELL = 200;
const WORLD_MARGIN = 28;

interface Index {
  colonyById: Map<number, ColonyState>;
  gathererById: Map<number, GathererState>;
  nutrientById: Map<number, NutrientState>;
  gatherersByColony: Map<number, GathererState[]>;
  vacuolesByColony: Map<number, VacuoleState[]>;
  nutrientHash: Map<number, NutrientState[]>;
}

export function createWorld(overrides: Partial<SimConfig> = {}): SimState {
  const config: SimConfig = { ...DEFAULT_CONFIG, ...overrides };
  const state: SimState = {
    version: 1,
    seed: config.seed >>> 0,
    rngState: config.seed >>> 0,
    tick: 0,
    nextId: 1,
    config,
    nutrientDensity: config.nutrientDensity,
    nutrientDensityStart: config.nutrientDensity,
    colonies: [],
    gatherers: [],
    nutrients: [],
    vacuoles: [],
  };

  placeColonies(state);
  fillNutrients(state, nutrientCap(state));
  seedFeedingGrounds(state);

  const index = buildIndex(state);
  for (const gatherer of state.gatherers) assignTask(state, gatherer, index);
  return state;
}

export function stepWorld(state: SimState): void {
  state.tick += 1;
  for (const gatherer of state.gatherers) {
    if (!gatherer.alive) continue;
    if (state.tick >= gatherer.deathTick) killGatherer(gatherer, state);
  }

  const index = buildIndex(state);
  integrate(state, index);
  resolve(state, index);
  if (state.tick % MAJOR_EVERY === 0) major(state, index);
  compact(state);
}

export function foodRange(state: SimState): { min: number; max: number } {
  const min = state.config.appleValue * 10;
  return { min, max: min * 2 };
}

export function villagerCost(genes: Genes, vacuoleCount: number): number {
  return (
    (genes.homeSpeed / BASE_HOME_SPEED +
      (2 * genes.villagerAgility) / BASE_VILLAGER_AGILITY +
      (12 * genes.villagerMaxSpeed) / BASE_VILLAGER_MAX_SPEED +
      (6 * genes.maxAge) / BASE_MAX_AGE +
      (2 * genes.startingMaxPopulation) / BASE_MAX_POP +
      (3 * genes.villagerStrength) / BASE_VILLAGER_STRENGTH +
      vacuoleCount * vacuoleCount) *
    0.8
  );
}

export function nutrientCap(state: SimState): number {
  const area = state.config.worldWidth * state.config.worldHeight;
  const raw = (area / 42000) * state.nutrientDensity;
  return Math.round(clamp(raw, 40, 720));
}

function placeColonies(state: SimState): void {
  const { worldWidth: w, worldHeight: h, colonyCount } = state.config;
  const margin = Math.min(520, w * 0.18, h * 0.18);
  const minSep = Math.min(780, w * 0.22, h * 0.28);
  for (let i = 0; i < colonyCount; i++) {
    let x = w / 2;
    let y = h / 2;
    if (i > 0) {
      let placed = false;
      for (let attempt = 0; attempt < 48 && !placed; attempt++) {
        x = margin + randomOf(state) * (w - margin * 2);
        y = margin + randomOf(state) * (h - margin * 2);
        placed = state.colonies.every((colony) => distance(colony.x, colony.y, x, y) >= minSep);
      }
    }
    const colony = makeColony(state, x, y, i);
    state.colonies.push(colony);
    const count = state.config.startingGatherers;
    for (let g = 0; g < count; g++) {
      const angle = (g / Math.max(1, count)) * Math.PI * 2;
      const gatherer = makeGatherer(state, colony, colony.x + Math.cos(angle) * 54, colony.y + Math.sin(angle) * 42);
      const life = colony.genes.maxAge * (0.42 + randomOf(state) * 0.58);
      gatherer.bornTick = state.tick - Math.floor(colony.genes.maxAge - life);
      gatherer.deathTick = state.tick + Math.floor(life);
      state.gatherers.push(gatherer);
    }
  }
}

function makeColony(state: SimState, x: number, y: number, index: number): ColonyState {
  const hue = (index * 137.508 + 18) % 360;
  const rgb = hslToRgb(hue, 0.74, 0.58);
  return {
    id: nextId(state),
    parentId: null,
    x,
    y,
    vx: 0,
    vy: 0,
    destX: null,
    destY: null,
    food: 0,
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
    radius: 30,
    genes: rollGenes(state, STARTING_VARIABILITY),
    alive: true,
  };
}

function rollGenes(state: SimState, variability: number): Genes {
  return clampGenes({
    adventurousness: vary(state, BASE_ADVENTUROUSNESS, variability),
    startingMaxPopulation: vary(state, BASE_MAX_POP, variability),
    maxAge: vary(state, BASE_MAX_AGE, variability),
    homeSpeed: vary(state, BASE_HOME_SPEED, variability),
    villagerAgility: vary(state, BASE_VILLAGER_AGILITY, variability),
    villagerMaxSpeed: vary(state, BASE_VILLAGER_MAX_SPEED, variability),
    villagerAggressiveness: vary(state, BASE_VILLAGER_AGGRESSIVENESS, variability),
    villagerHeroism: vary(state, BASE_VILLAGER_HEROISM, variability),
    villagerStrength: vary(state, BASE_VILLAGER_STRENGTH, variability),
    expansionRate: vary(state, EXPANSION_RATE, variability),
  });
}

function vary(state: SimState, base: number, amount: number): number {
  return base * (randomOf(state) * (amount * 2) + (1 - amount));
}

function clampGenes(genes: Genes): Genes {
  return {
    adventurousness: clamp(genes.adventurousness, 0.05, 0.9),
    startingMaxPopulation: clamp(genes.startingMaxPopulation, 6, 24),
    maxAge: clamp(genes.maxAge, 20 * 60, 110 * 60),
    homeSpeed: clamp(genes.homeSpeed, 40, 180),
    villagerAgility: clamp(genes.villagerAgility, 0.04, 0.35),
    villagerMaxSpeed: clamp(genes.villagerMaxSpeed, 0.8, 3.4),
    villagerAggressiveness: clamp(genes.villagerAggressiveness, 0.02, 0.55),
    villagerHeroism: clamp(genes.villagerHeroism, 0, 0.08),
    villagerStrength: clamp(genes.villagerStrength, 3, 14),
    expansionRate: clamp(genes.expansionRate, 0.08, 0.85),
  };
}

function mutateGenes(state: SimState, genes: Genes, boostExpansion: boolean): Genes {
  const rate = MUTATION_RATE;
  const next = clampGenes({
    adventurousness: genes.adventurousness * varyFactor(state, rate),
    startingMaxPopulation: genes.startingMaxPopulation * varyFactor(state, rate),
    maxAge: genes.maxAge * varyFactor(state, rate),
    homeSpeed: genes.homeSpeed * varyFactor(state, rate),
    villagerAgility: genes.villagerAgility * varyFactor(state, rate),
    villagerMaxSpeed: genes.villagerMaxSpeed * varyFactor(state, rate),
    villagerAggressiveness: genes.villagerAggressiveness * varyFactor(state, rate),
    villagerHeroism: genes.villagerHeroism * varyFactor(state, rate),
    villagerStrength: genes.villagerStrength * varyFactor(state, rate),
    expansionRate: genes.expansionRate * (boostExpansion ? varyUp(state, rate) : varyFactor(state, rate)),
  });
  return next;
}

function varyFactor(state: SimState, percent: number): number {
  return randomOf(state) * (percent * 2) + (1 - percent);
}

function varyUp(state: SimState, percent: number): number {
  return randomOf(state) * percent + 1;
}

function makeGatherer(state: SimState, colony: ColonyState, x: number, y: number): GathererState {
  return {
    id: nextId(state),
    colonyId: colony.id,
    x,
    y,
    vx: 0,
    vy: 0,
    bornTick: state.tick,
    deathTick: state.tick + Math.floor(colony.genes.maxAge),
    radius: 10,
    carryingId: null,
    task: { type: 'wander', x, y },
    alive: true,
  };
}

function fillNutrients(state: SimState, count: number): void {
  const { min, max } = foodRange(state);
  const { worldWidth: w, worldHeight: h } = state.config;
  while (state.nutrients.length < count) {
    const food = min + randomOf(state) * (max - min);
    state.nutrients.push({
      id: nextId(state),
      x: WORLD_MARGIN + randomOf(state) * (w - WORLD_MARGIN * 2),
      y: WORLD_MARGIN + randomOf(state) * (h - WORLD_MARGIN * 2),
      vx: 0,
      vy: 0,
      food,
      phase: 'ripe',
      rotLeft: 0,
      carrierId: null,
      reservedBy: null,
      phaseSeed: randomOf(state) * Math.PI * 2,
      radius: 7,
      alive: true,
    });
  }
}

function seedFeedingGrounds(state: SimState): void {
  const { worldWidth: w, worldHeight: h } = state.config;
  let cursor = 0;
  for (const colony of state.colonies) {
    for (let k = 0; k < 8 && cursor < state.nutrients.length; k += 1, cursor += 1) {
      const angle = (k / 8) * Math.PI * 2 + colony.id * 0.17;
      const dist = 78 + (k % 3) * 36;
      const nutrient = state.nutrients[cursor];
      nutrient.x = clamp(colony.x + Math.cos(angle) * dist, WORLD_MARGIN, w - WORLD_MARGIN);
      nutrient.y = clamp(colony.y + Math.sin(angle) * dist, WORLD_MARGIN, h - WORLD_MARGIN);
    }
  }
}

function integrate(state: SimState, index: Index): void {
  const { worldWidth: w, worldHeight: h } = state.config;
  for (const colony of state.colonies) {
    if (!colony.alive || colony.destX == null || colony.destY == null) continue;
    const dest = { x: colony.destX, y: colony.destY };
    const speed = 2.4 * (colony.genes.homeSpeed / BASE_HOME_SPEED);
    const velocity = steer(colony, dest, { x: colony.vx, y: colony.vy }, 0.35, speed);
    colony.vx = velocity.x;
    colony.vy = velocity.y;
    colony.x = clamp(colony.x + velocity.x, WORLD_MARGIN, w - WORLD_MARGIN);
    colony.y = clamp(colony.y + velocity.y, WORLD_MARGIN, h - WORLD_MARGIN);
    if (distance(colony.x, colony.y, dest.x, dest.y) < 6) {
      colony.x = dest.x;
      colony.y = dest.y;
      colony.destX = null;
      colony.destY = null;
      colony.vx = 0;
      colony.vy = 0;
    }
  }

  for (const gatherer of state.gatherers) {
    if (!gatherer.alive) continue;
    const colony = index.colonyById.get(gatherer.colonyId);
    if (!colony || !colony.alive) {
      killGatherer(gatherer, state);
      continue;
    }
    const dest = taskPoint(gatherer, colony, index);
    if (!dest) continue;
    const velocity = steer(
      gatherer,
      dest,
      { x: gatherer.vx, y: gatherer.vy },
      colony.genes.villagerAgility,
      colony.genes.villagerMaxSpeed,
    );
    gatherer.vx = velocity.x;
    gatherer.vy = velocity.y;
    gatherer.x = clamp(gatherer.x + velocity.x, WORLD_MARGIN, w - WORLD_MARGIN);
    gatherer.y = clamp(gatherer.y + velocity.y, WORLD_MARGIN, h - WORLD_MARGIN);
  }

  const t = state.tick * 0.016;
  for (const nutrient of state.nutrients) {
    if (!nutrient.alive) continue;
    if (nutrient.carrierId != null) {
      const carrier = index.gathererById.get(nutrient.carrierId);
      if (carrier && carrier.alive) {
        nutrient.x = carrier.x;
        nutrient.y = carrier.y;
        nutrient.vx = 0;
        nutrient.vy = 0;
        continue;
      }
      nutrient.carrierId = null;
    }
    const flowX =
      Math.sin(nutrient.y * 0.0021 + t * 0.23 + nutrient.phaseSeed) * 0.42 +
      Math.cos(nutrient.x * 0.0014 - t * 0.11) * 0.18;
    const flowY =
      Math.cos(nutrient.x * 0.0019 + t * 0.19) * 0.4 +
      Math.sin(nutrient.y * 0.0012 + t * 0.08 + nutrient.phaseSeed) * 0.16;
    const wobble = Math.sin(t * 1.7 + nutrient.phaseSeed) * 0.06;
    nutrient.vx = nutrient.vx * 0.9 + (flowX + wobble) * 0.1;
    nutrient.vy = nutrient.vy * 0.9 + flowY * 0.1;
    if (nutrient.x < 80) nutrient.vx += 0.08;
    if (nutrient.x > w - 80) nutrient.vx -= 0.08;
    if (nutrient.y < 80) nutrient.vy += 0.08;
    if (nutrient.y > h - 80) nutrient.vy -= 0.08;
    nutrient.x = clamp(nutrient.x + nutrient.vx, WORLD_MARGIN, w - WORLD_MARGIN);
    nutrient.y = clamp(nutrient.y + nutrient.vy, WORLD_MARGIN, h - WORLD_MARGIN);
  }
}

function resolve(state: SimState, index: Index): void {
  for (const gatherer of state.gatherers) {
    if (!gatherer.alive) continue;
    if (gatherer.carryingId != null) {
      const carried = index.nutrientById.get(gatherer.carryingId);
      if (!carried || !carried.alive || carried.phase === 'rotten') {
        if (carried && carried.carrierId === gatherer.id) {
          carried.carrierId = null;
          carried.reservedBy = null;
        }
        gatherer.carryingId = null;
        if (gatherer.task.type === 'return') assignTask(state, gatherer, index);
      }
    }

    if (gatherer.task.type === 'seek' && gatherer.carryingId == null) {
      const nutrient = index.nutrientById.get(gatherer.task.nutrientId);
      const blocked =
        !nutrient ||
        !nutrient.alive ||
        nutrient.phase === 'rotten' ||
        (nutrient.carrierId != null && nutrient.carrierId !== gatherer.id);
      if (blocked) {
        assignTask(state, gatherer, index);
      } else if (distance(gatherer.x, gatherer.y, nutrient.x, nutrient.y) <= gatherer.radius + nutrient.radius) {
        nutrient.carrierId = gatherer.id;
        nutrient.reservedBy = null;
        gatherer.carryingId = nutrient.id;
        gatherer.task = { type: 'return' };
      }
    }

    if (gatherer.task.type === 'return' && gatherer.carryingId != null) {
      const colony = index.colonyById.get(gatherer.colonyId);
      const nutrient = index.nutrientById.get(gatherer.carryingId);
      if (!colony || !nutrient) {
        gatherer.carryingId = null;
        assignTask(state, gatherer, index);
      } else {
        const drop = nearestDrop(gatherer, colony, index);
        if (distance(gatherer.x, gatherer.y, drop.x, drop.y) <= gatherer.radius + drop.radius) {
          if (nutrient.phase !== 'rotten') colony.food += nutrient.food;
          nutrient.alive = false;
          nutrient.carrierId = null;
          nutrient.reservedBy = null;
          gatherer.carryingId = null;
          assignTask(state, gatherer, index);
        }
      }
    }

    if (gatherer.task.type === 'wander') {
      if (distance(gatherer.x, gatherer.y, gatherer.task.x, gatherer.task.y) < 16) {
        assignTask(state, gatherer, index);
      }
    }
  }
}

function major(state: SimState, index: Index): void {
  const { min, max } = foodRange(state);
  const rate = state.config.appleAgeRate;
  for (const nutrient of state.nutrients) {
    if (!nutrient.alive) continue;
    if (nutrient.phase === 'ripe') {
      if (nutrient.food < max) nutrient.food = Math.min(max, nutrient.food + rate * 0.1);
      else {
        nutrient.phase = 'rotten';
        nutrient.food = 0;
        nutrient.rotLeft = 5;
      }
    } else {
      nutrient.rotLeft -= 1;
      if (nutrient.rotLeft <= 0) {
        nutrient.alive = false;
        nutrient.carrierId = null;
        nutrient.reservedBy = null;
      }
    }
  }

  // Snapshot so a daughter colony budded this tick is not immediately judged empty.
  for (const colony of [...state.colonies]) {
    if (!colony.alive) continue;
    const vacuoles = index.vacuolesByColony.get(colony.id) ?? [];
    let pop = index.gatherersByColony.get(colony.id)?.length ?? 0;
    const cost = villagerCost(colony.genes, vacuoles.length);
    if (colony.food > cost && state.gatherers.length < GATHERER_SAFETY_CAP) {
      colony.food -= cost;
      const gatherer = makeGatherer(state, colony, colony.x, colony.y);
      const angle = randomOf(state) * Math.PI * 2;
      gatherer.x = colony.x + Math.cos(angle) * 16;
      gatherer.y = colony.y + Math.sin(angle) * 16;
      state.gatherers.push(gatherer);
      assignTask(state, gatherer, index);
      pop += 1;
    }
    const maxPop = colony.genes.startingMaxPopulation + vacuoles.length * OUTPOST_POPULATION;
    if (pop === 0) {
      colony.alive = false;
      for (const vacuole of vacuoles) vacuole.alive = false;
      continue;
    }
    if (pop > maxPop) {
      const wantBud =
        vacuoles.length < MAX_VACUOLES &&
        (vacuoles.length > 0 || (randomOf(state) < colony.genes.expansionRate && colony.destX == null));
      if (wantBud) {
        const budded = budVacuole(state, colony, index);
        if (!budded) splitColony(state, colony, index);
      } else if (colony.destX == null) {
        splitColony(state, colony, index);
      }
    } else if (
      vacuoles.length > 0 &&
      pop < maxPop - OUTPOST_POPULATION - 2 &&
      randomOf(state) < colony.genes.villagerAggressiveness
    ) {
      vacuoles[vacuoles.length - 1].alive = false;
    }
  }

  const capGatherers = (state.config.worldWidth * state.config.worldHeight / 30000) * state.config.villagerDensity;
  const aliveGatherers = state.gatherers.reduce((sum, gatherer) => sum + (gatherer.alive ? 1 : 0), 0);
  if (aliveGatherers < capGatherers && state.nutrientDensity < state.nutrientDensityStart * 2) {
    state.nutrientDensity *= 1.01;
  } else if (aliveGatherers > capGatherers && state.nutrientDensity > state.nutrientDensityStart * 0.5) {
    state.nutrientDensity *= 0.99;
  }

  const missing = nutrientCap(state) - state.nutrients.reduce((sum, nutrient) => sum + (nutrient.alive ? 1 : 0), 0);
  const toAdd = Math.min(8, Math.max(0, Math.ceil(missing / 4)));
  for (let i = 0; i < toAdd; i++) {
    state.nutrients.push({
      id: nextId(state),
      x: WORLD_MARGIN + randomOf(state) * (state.config.worldWidth - WORLD_MARGIN * 2),
      y: WORLD_MARGIN + randomOf(state) * (state.config.worldHeight - WORLD_MARGIN * 2),
      vx: 0,
      vy: 0,
      food: min,
      phase: 'ripe',
      rotLeft: 0,
      carrierId: null,
      reservedBy: null,
      phaseSeed: randomOf(state) * Math.PI * 2,
      radius: 7,
      alive: true,
    });
  }
}

function budVacuole(state: SimState, colony: ColonyState, index: Index): boolean {
  const spot = findSpot(state, colony, 150, index);
  if (!spot) return false;
  state.vacuoles.push({
    id: nextId(state),
    colonyId: colony.id,
    x: spot.x,
    y: spot.y,
    radius: colony.radius * 0.82,
    alive: true,
  });
  return true;
}

function splitColony(state: SimState, colony: ColonyState, index: Index): void {
  const child = makeColony(state, colony.x, colony.y, state.colonies.length + 3);
  child.parentId = colony.id;
  child.r = clamp(colony.r + (randomOf(state) * 2 - 1) * 42, 40, 255);
  child.g = clamp(colony.g + (randomOf(state) * 2 - 1) * 42, 40, 255);
  child.b = clamp(colony.b + (randomOf(state) * 2 - 1) * 42, 40, 255);
  child.genes = mutateGenes(state, colony.genes, (index.vacuolesByColony.get(colony.id)?.length ?? 0) > 0);
  child.radius = colony.radius;
  const spot = findSpot(state, colony, 460, index);
  if (spot) {
    child.destX = spot.x;
    child.destY = spot.y;
  } else {
    child.destX = clamp(colony.x + 360, WORLD_MARGIN, state.config.worldWidth - WORLD_MARGIN);
    child.destY = clamp(colony.y + 240, WORLD_MARGIN, state.config.worldHeight - WORLD_MARGIN);
  }
  state.colonies.push(child);
  const members = index.gatherersByColony.get(colony.id) ?? [];
  members.forEach((gatherer, memberIndex) => {
    if (memberIndex % 2 === 1) {
      gatherer.colonyId = child.id;
      if (gatherer.task.type === 'return') gatherer.task = { type: 'return' };
    }
  });
}

function findSpot(
  state: SimState,
  colony: ColonyState,
  distanceHint: number,
  index: Index,
): { x: number; y: number } | null {
  const { worldWidth: w, worldHeight: h } = state.config;
  let furthest = 0;
  for (const vacuole of index.vacuolesByColony.get(colony.id) ?? []) {
    furthest = Math.max(furthest, distance(colony.x, colony.y, vacuole.x, vacuole.y));
  }
  const margin = 110;
  for (let attempt = 0; attempt < 10; attempt++) {
    const minDistance = furthest > 0 ? furthest : distanceHint / 2;
    const extra = (randomOf(state) + 1) * colony.genes.adventurousness * distanceHint * 2;
    const total = minDistance + extra;
    const angle = randomOf(state) * Math.PI * 2;
    const x = colony.x + Math.cos(angle) * total;
    const y = colony.y + Math.sin(angle) * total;
    if (x < margin || y < margin || x > w - margin || y > h - margin) continue;
    return { x, y };
  }
  return null;
}

function assignTask(state: SimState, gatherer: GathererState, index: Index): void {
  if (gatherer.task.type === 'seek') releaseReservation(index, gatherer.task.nutrientId, gatherer.id);
  const colony = index.colonyById.get(gatherer.colonyId);
  const adventurous = colony ? colony.genes.adventurousness : 0.2;
  const longHaul = randomOf(state) < adventurous * 0.85;
  const search = 280 + adventurous * 980;
  const nutrient = longHaul
    ? randomFreeNutrient(state, gatherer.id) ?? nearestFreeNutrient(index, gatherer.x, gatherer.y, search, gatherer.id)
    : nearestFreeNutrient(index, gatherer.x, gatherer.y, search, gatherer.id) ??
      randomFreeNutrient(state, gatherer.id);
  if (nutrient) {
    nutrient.reservedBy = gatherer.id;
    gatherer.task = { type: 'seek', nutrientId: nutrient.id };
    return;
  }
  const angle = randomOf(state) * Math.PI * 2;
  const dist = 80 + randomOf(state) * 220;
  const home = colony ?? gatherer;
  gatherer.task = {
    type: 'wander',
    x: clamp(home.x + Math.cos(angle) * dist, WORLD_MARGIN, state.config.worldWidth - WORLD_MARGIN),
    y: clamp(home.y + Math.sin(angle) * dist, WORLD_MARGIN, state.config.worldHeight - WORLD_MARGIN),
  };
}

function releaseReservation(index: Index, nutrientId: number, gathererId: number): void {
  const nutrient = index.nutrientById.get(nutrientId);
  if (nutrient && nutrient.reservedBy === gathererId) nutrient.reservedBy = null;
}

function nearestFreeNutrient(
  index: Index,
  x: number,
  y: number,
  maxDist: number,
  gathererId: number,
): NutrientState | null {
  const reach = Math.ceil(maxDist / CELL);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best: NutrientState | null = null;
  let bestD = maxDist * maxDist;
  for (let iy = cy - reach; iy <= cy + reach; iy++) {
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      const bucket = index.nutrientHash.get(hashKey(ix, iy));
      if (!bucket) continue;
      for (const nutrient of bucket) {
        if (!isFree(nutrient, gathererId)) continue;
        const dx = nutrient.x - x;
        const dy = nutrient.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = nutrient;
        }
      }
    }
  }
  return best;
}

function randomFreeNutrient(state: SimState, gathererId: number): NutrientState | null {
  const list = state.nutrients;
  const count = list.length;
  if (count === 0) return null;
  const start = Math.floor(randomOf(state) * count);
  const steps = Math.min(count, 48);
  for (let i = 0; i < steps; i++) {
    const nutrient = list[(start + i) % count];
    if (isFree(nutrient, gathererId)) return nutrient;
  }
  return null;
}

function isFree(nutrient: NutrientState, gathererId: number): boolean {
  if (!nutrient.alive || nutrient.phase === 'rotten' || nutrient.carrierId != null) return false;
  if (nutrient.reservedBy != null && nutrient.reservedBy !== gathererId) return false;
  return true;
}

function taskPoint(gatherer: GathererState, colony: ColonyState, index: Index): { x: number; y: number } | null {
  if (gatherer.task.type === 'seek') {
    const nutrient = index.nutrientById.get(gatherer.task.nutrientId);
    return nutrient ?? null;
  }
  if (gatherer.task.type === 'return') return nearestDrop(gatherer, colony, index);
  return { x: gatherer.task.x, y: gatherer.task.y };
}

function nearestDrop(
  gatherer: GathererState,
  colony: ColonyState,
  index: Index,
): { x: number; y: number; radius: number } {
  let best = {
    x: colony.x,
    y: colony.y,
    radius: colony.radius,
    d: distance(gatherer.x, gatherer.y, colony.x, colony.y),
  };
  for (const vacuole of index.vacuolesByColony.get(colony.id) ?? []) {
    const d = distance(gatherer.x, gatherer.y, vacuole.x, vacuole.y);
    if (d < best.d) best = { x: vacuole.x, y: vacuole.y, radius: vacuole.radius, d };
  }
  return best;
}

function killGatherer(gatherer: GathererState, state: SimState): void {
  gatherer.alive = false;
  if (gatherer.carryingId != null) {
    const nutrient = state.nutrients.find((item) => item.id === gatherer.carryingId);
    if (nutrient && nutrient.carrierId === gatherer.id) {
      nutrient.carrierId = null;
      nutrient.reservedBy = null;
    }
    gatherer.carryingId = null;
  }
  const task = gatherer.task;
  if (task.type === 'seek') {
    const nutrient = state.nutrients.find((item) => item.id === task.nutrientId);
    if (nutrient && nutrient.reservedBy === gatherer.id) nutrient.reservedBy = null;
  }
}

function buildIndex(state: SimState): Index {
  const index: Index = {
    colonyById: new Map(),
    gathererById: new Map(),
    nutrientById: new Map(),
    gatherersByColony: new Map(),
    vacuolesByColony: new Map(),
    nutrientHash: new Map(),
  };
  for (const colony of state.colonies) {
    if (!colony.alive) continue;
    index.colonyById.set(colony.id, colony);
  }
  for (const gatherer of state.gatherers) {
    if (!gatherer.alive) continue;
    index.gathererById.set(gatherer.id, gatherer);
    const list = index.gatherersByColony.get(gatherer.colonyId);
    if (list) list.push(gatherer);
    else index.gatherersByColony.set(gatherer.colonyId, [gatherer]);
  }
  for (const vacuole of state.vacuoles) {
    if (!vacuole.alive) continue;
    const list = index.vacuolesByColony.get(vacuole.colonyId);
    if (list) list.push(vacuole);
    else index.vacuolesByColony.set(vacuole.colonyId, [vacuole]);
  }
  for (const nutrient of state.nutrients) {
    if (!nutrient.alive) continue;
    index.nutrientById.set(nutrient.id, nutrient);
    if (nutrient.carrierId != null) continue;
    const key = hashKey(Math.floor(nutrient.x / CELL), Math.floor(nutrient.y / CELL));
    const bucket = index.nutrientHash.get(key);
    if (bucket) bucket.push(nutrient);
    else index.nutrientHash.set(key, [nutrient]);
  }
  return index;
}

function hashKey(cx: number, cy: number): number {
  return (cx + 512) * 4096 + (cy + 512);
}

function compact(state: SimState): void {
  if (state.colonies.some((colony) => !colony.alive)) {
    state.colonies = state.colonies.filter((colony) => colony.alive);
  }
  if (state.gatherers.some((gatherer) => !gatherer.alive)) {
    state.gatherers = state.gatherers.filter((gatherer) => gatherer.alive);
  }
  if (state.nutrients.some((nutrient) => !nutrient.alive)) {
    state.nutrients = state.nutrients.filter((nutrient) => nutrient.alive);
  }
  if (state.vacuoles.some((vacuole) => !vacuole.alive)) {
    state.vacuoles = state.vacuoles.filter((vacuole) => vacuole.alive);
  }
}

function nextId(state: SimState): number {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}
