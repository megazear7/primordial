/**
 * Plain JSON save schema, version 1.
 *
 * The simulation is a bag of data. Rendering never writes these objects.
 * Later stages can add warriors, thieves, and predators as new arrays and
 * bump `version` (or tolerate missing arrays) without changing these records.
 *
 * Mapped from the old village sim:
 * - colonies  ← homes
 * - gatherers ← gatherer villagers
 * - nutrients ← apples (ripen, then rot)
 * - vacuoles  ← outposts / drop-off points
 * Genes that warriors and heroes will read later (strength, heroism,
 * aggressiveness) are already stored on each colony.
 */

export interface SimConfig {
  worldWidth: number;
  worldHeight: number;
  colonyCount: number;
  nutrientDensity: number;
  appleValue: number;
  appleAgeRate: number;
  villagerDensity: number;
  seed: number;
  startingGatherers: number;
}

export interface Genes {
  adventurousness: number;
  startingMaxPopulation: number;
  /** Lifetime of a gatherer, in simulation ticks (60 ticks = 1 second). */
  maxAge: number;
  homeSpeed: number;
  villagerAgility: number;
  villagerMaxSpeed: number;
  villagerAggressiveness: number;
  villagerHeroism: number;
  villagerStrength: number;
  expansionRate: number;
}

export interface ColonyState {
  id: number;
  parentId: number | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  destX: number | null;
  destY: number | null;
  food: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  genes: Genes;
  alive: boolean;
}

export type GathererTask =
  | { type: 'seek'; nutrientId: number }
  | { type: 'return' }
  | { type: 'wander'; x: number; y: number };

export interface GathererState {
  id: number;
  colonyId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornTick: number;
  deathTick: number;
  radius: number;
  carryingId: number | null;
  task: GathererTask;
  alive: boolean;
}

export interface NutrientState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  food: number;
  phase: 'ripe' | 'rotten';
  /** Major-tick countdown once rotten. Removed at 0. */
  rotLeft: number;
  carrierId: number | null;
  reservedBy: number | null;
  phaseSeed: number;
  radius: number;
  alive: boolean;
}

/** Budded drop-off. Gatherers return food here when it is closer than the colony. */
export interface VacuoleState {
  id: number;
  colonyId: number;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
}

export interface SimState {
  version: 1;
  seed: number;
  rngState: number;
  tick: number;
  nextId: number;
  config: SimConfig;
  /** Live nutrient density. Drifts with population the way apple density did. */
  nutrientDensity: number;
  nutrientDensityStart: number;
  colonies: ColonyState[];
  gatherers: GathererState[];
  nutrients: NutrientState[];
  vacuoles: VacuoleState[];
}

export const TICK_HZ = 60;
export const MAJOR_EVERY = 60;
export const BASE_MAX_AGE = 48 * TICK_HZ;
export const BASE_MAX_POP = 12;
export const BASE_HOME_SPEED = 100;
export const BASE_ADVENTUROUSNESS = 0.2;
export const BASE_VILLAGER_MAX_SPEED = 2;
export const BASE_VILLAGER_AGILITY = 0.1;
export const BASE_VILLAGER_AGGRESSIVENESS = 0.1;
export const BASE_VILLAGER_HEROISM = 0.01;
export const BASE_VILLAGER_STRENGTH = 7;
export const MUTATION_RATE = 0.2;
export const EXPANSION_RATE = 0.5;
export const STARTING_VARIABILITY = 0.5;
export const OUTPOST_POPULATION = 3;
/** Stage-1 guard so one colony cannot paint the whole slide before conflict exists. */
export const MAX_VACUOLES = 6;
/** Births pause above this so a long session stays near 60fps. */
export const GATHERER_SAFETY_CAP = 500;

export const DEFAULT_CONFIG: SimConfig = {
  worldWidth: 6400,
  worldHeight: 4200,
  colonyCount: 5,
  nutrientDensity: 1,
  appleValue: 1,
  appleAgeRate: 1,
  villagerDensity: 1,
  seed: 0x51de01,
  startingGatherers: 4,
};
