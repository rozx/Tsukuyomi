import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRestoreSignature,
  restoreSignaturesMatch,
} from '../services/localization/restore-signature';
import { canonicalStringify } from '../utils/canonical-json';
import { hashString } from '../utils/content-hash';

afterEach(() => vi.restoreAllMocks());

describe('恢复签名的分块计算', () => {
  const values: unknown[] = [
    null,
    undefined,
    {},
    [],
    { sparse: new Array<unknown>(2), values: [undefined, null, NaN, Infinity] },
    { z: 2, a: 1, omitted: undefined, date: new Date(0), nested: [{ y: '月🌙', x: 1 }] },
    JSON.parse('{"10":"十","2":"二","01":"零一","__proto__":{"z":1},"constructor":2}'),
    { text: '\ud800\n\t"\\', arrays: [[1], [], [2, 1]] },
  ];
  it.each(values.map((value) => ({ value })))(
    '与已有规范 JSON 字节的 SHA-256 相同：$value',
    async ({ value }) => {
      expect(createRestoreSignature(value)).toBe(
        `sha256:${await hashString(canonicalStringify(value))}`,
      );
    },
  );

  it('大正文按有限片段编码，跨代理对边界也不改变摘要', async () => {
    const payload = {
      text: 'a'.repeat(65526) + '🌙'.repeat(100000),
      items: Array.from({ length: 1000 }, (_, id) => ({ id, text: '正文' })),
    };
    const expected = `sha256:${await hashString(canonicalStringify(payload))}`;
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    expect(createRestoreSignature(payload)).toBe(expected);
    expect(Math.max(...encode.mock.calls.map(([text]) => text?.length ?? 0))).toBeLessThanOrEqual(
      65536,
    );
    expect(encode.mock.calls.length).toBeGreaterThan(1);
  });

  it('兼容旧回执；修改内容、数组顺序和损坏摘要仍拒绝匹配', () => {
    const old = canonicalStringify({ books: [{ id: 'a' }, { id: 'b' }] });
    const signature = createRestoreSignature({ books: [{ id: 'a' }, { id: 'b' }] });
    expect(restoreSignaturesMatch(old, signature)).toBe(true);
    expect(restoreSignaturesMatch(signature, signature)).toBe(true);
    expect(
      restoreSignaturesMatch(old, createRestoreSignature({ books: [{ id: 'b' }, { id: 'a' }] })),
    ).toBe(false);
    expect(restoreSignaturesMatch('sha256:corrupt', signature)).toBe(false);
    expect(restoreSignaturesMatch(old, 'future:unsupported')).toBe(false);
  });

  it('相等时间和重复引用稳定，不改写输入', () => {
    const child = Object.freeze({ date: new Date(0), content: '正文' });
    const value = Object.freeze({ first: child, second: child });
    expect(createRestoreSignature(value)).toBe(
      createRestoreSignature({ second: { ...child }, first: { ...child } }),
    );
    expect(value.first).toBe(value.second);
    expect(value.first.date).toBeInstanceOf(Date);
  });
});
