import { describe, expect, it } from 'bun:test';
import './setup';

import { hashJson, hashString } from 'src/utils/content-hash';

describe('content-hash', () => {
  describe('hashJson', () => {
    it('produces 64-char lowercase hex SHA-256 hash', async () => {
      const h = await hashJson({ hello: 'world' });
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('same input produces same hash (stability)', async () => {
      const payload = { a: 1, b: [2, 3], nested: { key: 'value' } };
      const h1 = await hashJson(payload);
      const h2 = await hashJson(payload);
      expect(h1).toBe(h2);
    });

    it('different content produces different hash', async () => {
      const h1 = await hashJson({ a: 1 });
      const h2 = await hashJson({ a: 2 });
      expect(h1).not.toBe(h2);
    });

    it('serializes Date objects before hashing', async () => {
      const d = new Date('2026-01-01T00:00:00.000Z');
      const h1 = await hashJson({ lastEdited: d });
      const h2 = await hashJson({ lastEdited: '2026-01-01T00:00:00.000Z' });
      expect(h1).toBe(h2);
    });

    it('handles empty object', async () => {
      const h = await hashJson({});
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles null/undefined gracefully', async () => {
      const h1 = await hashJson(null);
      const h2 = await hashJson(undefined);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
      expect(h2).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles arrays', async () => {
      const h1 = await hashJson([1, 2, 3]);
      const h2 = await hashJson([1, 2, 3]);
      const h3 = await hashJson([3, 2, 1]);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });
  });

  describe('hashString', () => {
    it('produces 64-char lowercase hex', async () => {
      const h = await hashString('hello');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('matches known SHA-256 of ASCII string', async () => {
      // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      const h = await hashString('');
      expect(h).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });
});
