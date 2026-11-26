import type { SimState } from './types';

export function serialize(state: SimState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string): SimState {
  const data = JSON.parse(raw) as SimState;
  if (!data || data.version !== 1 || !Array.isArray(data.colonies)) {
    throw new Error('Unsupported Primordial save');
  }
  return data;
}
