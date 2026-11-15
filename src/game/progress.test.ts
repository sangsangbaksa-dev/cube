import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOWER_COUNT } from '../world/terrain';
import { emptySave, loadSave, writeSave } from './progress';

const KEY = 'cubequest.save.v3';
let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('cube progress save validation', () => {
  it('deduplicates dust and rejects invalid IDs without inflating the collectible count', () => {
    const lastId = TOWER_COUNT * 3 - 1;
    stored.set(KEY, JSON.stringify({
      ...emptySave(),
      dust: [0, 2, 2, -1, 1.5, lastId, lastId + 1, '2', null, 0],
    }));
    expect(loadSave().dust).toEqual([0, 2, lastId]);
  });

  it('retains legitimate saves and ignores corrupt storage', () => {
    const save = { ...emptySave(), dust: [0, 1, 3], shards: ['route-1'], records: { 'route-8': 12.5 } };
    writeSave(save);
    expect(loadSave()).toEqual(save);
    stored.set(KEY, '{broken');
    expect(loadSave()).toEqual(emptySave());
  });
});
