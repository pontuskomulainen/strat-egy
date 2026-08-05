import { describe, expect, it } from 'vitest';
import { fnv1a32, type HashTree } from '../../src/sim/hash.js';

function bytesOf(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

describe('fnv1a32', () => {
  // Golden values from the reference FNV test suite
  // (http://www.isthe.com/chongo/src/fnv/test_fnv.c).
  it('matches the known golden value for the empty buffer', () => {
    expect(fnv1a32(bytesOf(''))).toBe(0x811c9dc5);
  });

  it('matches the known golden value for a single byte', () => {
    expect(fnv1a32(bytesOf('a'))).toBe(0xe40c292c);
  });

  it('matches the known golden value for "foobar"', () => {
    expect(fnv1a32(bytesOf('foobar'))).toBe(0xbf9cf968);
  });

  it('matches the known golden value for "123456789"', () => {
    expect(fnv1a32(bytesOf('123456789'))).toBe(0xbb86b11c);
  });

  it('accepts a raw ArrayBuffer directly', () => {
    const buffer = bytesOf('foobar').buffer;
    expect(fnv1a32(buffer)).toBe(0xbf9cf968);
  });

  it('accepts a typed array view with a non-zero byteOffset', () => {
    const full = new Uint8Array([0xff, ...bytesOf('foobar')]);
    const view = new Uint8Array(full.buffer, 1);
    expect(fnv1a32(view)).toBe(0xbf9cf968);
  });

  it('produces only uint32 values', () => {
    for (let i = 0; i < 256; i++) {
      const value = fnv1a32(new Uint8Array([i]));
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('is deterministic: same bytes produce the same hash', () => {
    const bytes = bytesOf('deterministic simulation');
    expect(fnv1a32(bytes)).toBe(fnv1a32(bytes));
  });

  it('is sensitive to byte order', () => {
    expect(fnv1a32(new Uint8Array([1, 2, 3]))).not.toBe(
      fnv1a32(new Uint8Array([3, 2, 1])),
    );
  });
});

describe('HashTree', () => {
  it('holds named sub-hashes', () => {
    const tree: HashTree = {
      global: fnv1a32(bytesOf('global')),
      territory: fnv1a32(bytesOf('territory')),
      economy: fnv1a32(bytesOf('economy')),
      units: fnv1a32(bytesOf('units')),
      rngCursor: fnv1a32(bytesOf('rngCursor')),
    };
    expect(tree.global).toBe(0x1dff06ae);
    expect(Object.keys(tree).sort()).toEqual(
      ['economy', 'global', 'rngCursor', 'territory', 'units'].sort(),
    );
  });
});
