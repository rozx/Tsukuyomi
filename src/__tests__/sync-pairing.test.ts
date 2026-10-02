import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../models/novel';
import { pairByIdThenKey, paragraphPairKey } from '../services/localization/sync-pairing';

const p = (id: string, text: string): Paragraph => ({
  id,
  text,
  selectedTranslationId: '',
  translations: [],
});

describe('pairByIdThenKey', () => {
  it('先为全部主方预留同 ID 配对，再对剩余项按键回退，同一副方不会被配对两次', () => {
    // 主方第一段是新 ID，按原文回退时不能抢走第二段同 ID 的副方段落
    const primary = [p('new', '——'), p('s1', '——')];
    const secondary = [p('s1', '——'), p('s2', '——')];
    const { pairs, consumed } = pairByIdThenKey(primary, secondary, paragraphPairKey);
    expect(pairs.map((value) => value?.id)).toEqual(['s2', 's1']);
    expect([...consumed].sort()).toEqual(['s1', 's2']);
  });

  it('键为 undefined 时不参与回退', () => {
    const key = (value: { id: string; url?: string }) => value.url;
    const { pairs } = pairByIdThenKey([{ id: 'a' }], [{ id: 'b' }], key);
    expect(pairs).toEqual([undefined]);
  });

  it('重复键按顺序各消费一次', () => {
    const primary = [p('x', '「……」'), p('y', '「……」'), p('z', '「……」')];
    const secondary = [p('a', '「……」'), p('b', '「……」')];
    const { pairs } = pairByIdThenKey(primary, secondary, paragraphPairKey);
    expect(pairs.map((value) => value?.id)).toEqual(['a', 'b', undefined]);
  });
});
