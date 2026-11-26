import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from './serialize';
import { foodRange, createWorld, nutrientCap, stepWorld, villagerCost } from './world';
import type { SimState } from './types';

function smallWorld(seed = 7): SimState {
  return createWorld({
    seed,
    worldWidth: 1600,
    worldHeight: 1200,
    colonyCount: 2,
    nutrientDensity: 0.45,
    startingGatherers: 3,
  });
}

describe('primordial simulation', () => {
  it('is deterministic for a shared seed', () => {
    const a = createWorld({ seed: 42 });
    const b = createWorld({ seed: 42 });
    for (let i = 0; i < 240; i++) {
      stepWorld(a);
      stepWorld(b);
    }
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('round-trips through JSON and keeps stepping in lockstep', () => {
    const original = smallWorld(9);
    for (let i = 0; i < 90; i++) stepWorld(original);
    const restored = deserialize(serialize(original));
    stepWorld(original);
    stepWorld(restored);
    expect(serialize(restored)).toEqual(serialize(original));
  });

  it('ripens nutrients, then rots and removes them', () => {
    const state = smallWorld(3);
    state.gatherers = [];
    const nutrient = state.nutrients[0];
    const { min, max } = foodRange(state);
    nutrient.food = min;
    nutrient.phase = 'ripe';
    nutrient.carrierId = null;
    nutrient.reservedBy = null;
    for (let i = 0; i < 60; i++) stepWorld(state);
    const aged = state.nutrients.find((item) => item.id === nutrient.id);
    expect(aged).toBeTruthy();
    expect(aged!.food).toBeCloseTo(min + 0.1, 5);

    aged!.food = max;
    for (let i = 0; i < 60; i++) stepWorld(state);
    const rotten = state.nutrients.find((item) => item.id === nutrient.id);
    expect(rotten?.phase).toBe('rotten');

    for (let i = 0; i < 60 * 6; i++) stepWorld(state);
    expect(state.nutrients.some((item) => item.id === nutrient.id)).toBe(false);
  });

  it('lets a gatherer collect a nutrient and feed its colony', () => {
    const state = smallWorld(11);
    const colony = state.colonies[0];
    const gatherer = state.gatherers.find((item) => item.colonyId === colony.id)!;
    const nutrient = state.nutrients[0];
    state.nutrients = [nutrient];
    nutrient.x = gatherer.x + 24;
    nutrient.y = gatherer.y;
    nutrient.phase = 'ripe';
    nutrient.food = 16;
    nutrient.carrierId = null;
    nutrient.reservedBy = null;
    nutrient.alive = true;
    gatherer.carryingId = null;
    gatherer.task = { type: 'wander', x: gatherer.x, y: gatherer.y };
    colony.food = 0;

    for (let i = 0; i < 400; i++) stepWorld(state);
    expect(colony.food).toBeGreaterThan(0);
    expect(state.nutrients.some((item) => item.id === nutrient.id)).toBe(false);
  });

  it('spends colony food to birth another gatherer', () => {
    const state = smallWorld(5);
    const colony = state.colonies[0];
    colony.food = 400;
    const before = state.gatherers.filter((item) => item.colonyId === colony.id).length;
    for (let i = 0; i < 60; i++) stepWorld(state);
    const after = state.gatherers.filter((item) => item.colonyId === colony.id).length;
    expect(after).toBe(before + 1);
    expect(colony.food).toBeLessThan(400);
  });

  it('splits an overcrowded colony into a mutated daughter', () => {
    const state = smallWorld(8);
    const colony = state.colonies[0];
    colony.genes.startingMaxPopulation = 2;
    colony.genes.expansionRate = 0;
    colony.food = 0;
    const owned = state.gatherers.filter((item) => item.colonyId === colony.id);
    expect(owned.length).toBeGreaterThan(2);
    const before = state.colonies.length;
    for (let i = 0; i < 60; i++) stepWorld(state);
    expect(state.colonies.length).toBe(before + 1);
    const child = state.colonies.find((item) => item.parentId === colony.id);
    expect(child).toBeTruthy();
    expect(state.gatherers.some((item) => item.colonyId === child!.id)).toBe(true);
    expect(villagerCost(colony.genes, 0)).toBeGreaterThan(5);
  });

  it('scales the nutrient pool with world area', () => {
    const state = createWorld();
    expect(state.colonies).toHaveLength(5);
    expect(state.gatherers.length).toBe(20);
    expect(state.nutrients.length).toBe(nutrientCap(state));
    expect(state.nutrients.length).toBeGreaterThan(400);
  });
});
