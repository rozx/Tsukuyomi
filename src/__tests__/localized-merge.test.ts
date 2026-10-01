import './setup';
import { describe, expect, it } from 'bun:test';
import type { LocalizedMap } from '../models/localized-data';
import { mergeLanguageSlots } from '../services/localization/merge';

describe('语言字段合并的不变量', () => {
  const a: LocalizedMap<string> = {
    'en-US': { value: 'A', revision: { counter: 1, actorId: 'A' }, updatedAt: 9999 },
  };
  const b: LocalizedMap<string> = {
    'en-US': { value: 'B', revision: { counter: 1, actorId: 'B' }, updatedAt: 1 },
  };
  const c: LocalizedMap<string> = {
    'en-US': { value: null, revision: { counter: 2, actorId: 'A' }, updatedAt: 2 },
    'zh-TW': { value: '繁中', revision: { counter: 1, actorId: 'C' }, updatedAt: 3 },
  };

  it('按逻辑版本选值，与本机时间、传入顺序和分组合并无关', () => {
    expect(mergeLanguageSlots(a, b)['en-US']?.value).toBe('B');
    expect(mergeLanguageSlots(a, b)).toEqual(mergeLanguageSlots(b, a));
    expect(mergeLanguageSlots(a, a)).toEqual(a);
    expect(mergeLanguageSlots(mergeLanguageSlots(a, b), c)).toEqual(
      mergeLanguageSlots(a, mergeLanguageSlots(b, c)),
    );
    expect(mergeLanguageSlots(a, c)).toEqual(c);
  });

  it('同版本冲突和损坏的槽不能被静默当作缺失', () => {
    const conflicting: LocalizedMap<string> = {
      'en-US': { value: 'different', revision: { counter: 1, actorId: 'A' }, updatedAt: 10 },
    };
    expect(() => mergeLanguageSlots(a, conflicting)).toThrow('SYNC_REVISION_CONFLICT');
    expect(() =>
      mergeLanguageSlots(a, { 'zh-CN': null } as unknown as LocalizedMap<string>),
    ).toThrow('INVALID_LANGUAGE_SLOT');
  });
});

it('同一译名的本地诊断信息不造成版本冲突或迁移版本分叉', async () => {
  const { legacyRevision } = await import('../services/localization/revision');
  const plain = { id: 't', translation: 'Name', aiModelId: 'm', language: 'en-US' };
  const local = { ...plain, memoryScoreBreakdown: { debug: true } };
  expect(legacyRevision(local)).toEqual(legacyRevision(plain));
  const a = { 'en-US': { value: local, revision: { counter: 1, actorId: 'A' }, updatedAt: 0 } };
  const b = { 'en-US': { value: plain, revision: { counter: 1, actorId: 'A' }, updatedAt: 0 } };
  expect(mergeLanguageSlots(a, b)).toEqual(mergeLanguageSlots(b, a));
  expect(mergeLanguageSlots(a, b)['en-US']!.value).toEqual(plain);
});
