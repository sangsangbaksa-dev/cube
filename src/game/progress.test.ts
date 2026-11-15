import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySave, loadSave, SHARD_GOAL, writeSave } from './progress';

describe('saved collectible integrity', () => {
  let data: Map<string, string>;

  beforeEach(() => {
    data = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('deduplicates dust and discards negative, fractional and unsafe IDs', () => {
    const save = emptySave();
    save.dust = [2, 2, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 0, 5];
    writeSave(save);
    expect(loadSave().dust).toEqual([2, 0, 5]);
  });

  it('does not restore a completed game if any story shard is missing', () => {
    const save = emptySave();
    save.shards = ['route-1', 'route-1', 'route-2', 'route-0', 'route-8'];
    save.won = true;
    writeSave(save);
    expect(loadSave().shards).toEqual(['route-1', 'route-2']);
    expect(loadSave().won).toBe(false);
  });

  it('preserves a legitimate complete save and expedition records', () => {
    const save = emptySave();
    save.shards = Array.from({ length: SHARD_GOAL }, (_, i) => `route-${i + 1}`);
    save.won = true;
    save.records = { 'route-8': 83.12, 'route-99': 1, 'route-9': -1 };
    writeSave(save);
    const loaded = loadSave();
    expect(loaded.won).toBe(true);
    expect(loaded.shards).toHaveLength(SHARD_GOAL);
    expect(loaded.records).toEqual({ 'route-8': 83.12 });
  });

  it('starts fresh instead of crashing on malformed JSON', () => {
    data.set('cubequest.save.v3', '{');
    expect(loadSave()).toEqual(emptySave());
  });
});
