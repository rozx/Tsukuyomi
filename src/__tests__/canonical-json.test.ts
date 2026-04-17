import { describe, expect, it } from 'bun:test';
import './setup';

import { canonicalStringify } from '../utils/canonical-json';
import { hashJson } from '../utils/content-hash';

describe('canonicalStringify', () => {
  it('sorts object keys alphabetically regardless of insertion order', () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalStringify(a)).toBe('{"a":2,"b":1,"c":3}');
  });

  it('recursively sorts nested object keys', () => {
    const value = { outer: { z: 1, a: 2 }, inner: [{ y: 1, x: 2 }] };
    expect(canonicalStringify(value)).toBe('{"inner":[{"x":2,"y":1}],"outer":{"a":2,"z":1}}');
  });

  it('preserves array order', () => {
    const value = [3, 1, 2];
    expect(canonicalStringify(value)).toBe('[3,1,2]');
  });

  it('converts Date to ISO string via serializeDates', () => {
    const value = { d: new Date('2026-01-01T00:00:00Z') };
    expect(canonicalStringify(value)).toBe('{"d":"2026-01-01T00:00:00.000Z"}');
  });

  it('drops undefined values but keeps null', () => {
    const value = { a: undefined, b: null, c: 1 };
    expect(canonicalStringify(value)).toBe('{"b":null,"c":1}');
  });
});

describe('hashJson canonical form', () => {
  it('produces the same hash regardless of key insertion order', async () => {
    const a = { name: 'x', id: 'a1', enabled: true };
    const b = { id: 'a1', enabled: true, name: 'x' };
    expect(await hashJson(a)).toBe(await hashJson(b));
  });

  it('produces different hashes for different array orderings', async () => {
    const a = [{ id: '1' }, { id: '2' }];
    const b = [{ id: '2' }, { id: '1' }];
    expect(await hashJson(a)).not.toBe(await hashJson(b));
  });

  it('treats undefined as equivalent to missing', async () => {
    const a = { id: 'x', optional: undefined, content: 'hi' };
    const b = { id: 'x', content: 'hi' };
    expect(await hashJson(a)).toBe(await hashJson(b));
  });
});
