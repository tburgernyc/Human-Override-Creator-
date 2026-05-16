import { describe, it, expect, vi } from 'vitest';
import { LruCache } from '../services/lruCache';

describe('LruCache', () => {
  it('returns undefined for missing keys', () => {
    const c = new LruCache<string, number>(3);
    expect(c.get('nope')).toBeUndefined();
    expect(c.size).toBe(0);
    expect(c.has('nope')).toBe(false);
  });

  it('stores values up to maxEntries without evicting', () => {
    const c = new LruCache<string, number>(3);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.size).toBe(3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('evicts the oldest entry when capacity is exceeded', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // pushes "a" out
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
    expect(c.size).toBe(2);
  });

  it('treats a get() as a recency bump', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // a is now most recent
    c.set('c', 3); // should push b out, not a
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
    expect(c.has('c')).toBe(true);
  });

  it('treats a re-set of an existing key as a recency bump', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 10); // a refreshed to most recent
    c.set('c', 3); // should push b out, not a
    expect(c.has('a')).toBe(true);
    expect(c.get('a')).toBe(10);
    expect(c.has('b')).toBe(false);
    expect(c.has('c')).toBe(true);
  });

  it('invokes onEvict when an entry is evicted', () => {
    const evicted: Array<[string, number]> = [];
    const c = new LruCache<string, number>(2, (k, v) => evicted.push([k, v]));
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // evicts a
    c.set('d', 4); // evicts b
    expect(evicted).toEqual([['a', 1], ['b', 2]]);
  });

  it('does not call onEvict when an entry is overwritten in place', () => {
    const onEvict = vi.fn();
    const c = new LruCache<string, number>(3, onEvict);
    c.set('a', 1);
    c.set('a', 2); // same key, no eviction
    expect(onEvict).not.toHaveBeenCalled();
    expect(c.get('a')).toBe(2);
  });

  it('clear() empties the cache and invokes onEvict for every entry', () => {
    const evicted: Array<[string, number]> = [];
    const c = new LruCache<string, number>(5, (k, v) => evicted.push([k, v]));
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.has('a')).toBe(false);
    expect(evicted).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('swallows exceptions thrown by onEvict without corrupting the cache', () => {
    const c = new LruCache<string, number>(2, () => { throw new Error('boom'); });
    c.set('a', 1);
    c.set('b', 2);
    expect(() => c.set('c', 3)).not.toThrow();
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
  });

  it('rejects invalid maxEntries values', () => {
    expect(() => new LruCache(0)).toThrow();
    expect(() => new LruCache(-1)).toThrow();
    expect(() => new LruCache(Infinity)).toThrow();
    expect(() => new LruCache(NaN)).toThrow();
  });

  it('floors fractional maxEntries to keep capacity an integer', () => {
    const c = new LruCache<string, number>(2.9);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.size).toBe(2); // not 3 even though 2.9 looks close
  });
});
