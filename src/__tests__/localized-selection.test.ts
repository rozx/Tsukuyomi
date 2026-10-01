import './setup';
import { describe, expect, it } from 'bun:test';
import type { Paragraph } from '../models/novel';
import {
  appendLanguageTranslation,
  getLanguageTranslation,
  selectLanguageTranslation,
  removeLanguageTranslation,
  setNameTranslation,
  getNameTranslation,
  updateLanguageTranslation,
} from '../services/localization/selection';

describe('按目标语言操作译文', () => {
  it('英文缺失时不读取简中，相同文字可分别属于两种语言', () => {
    const paragraph: Paragraph = {
      id: 'p',
      text: 'Alice',
      selectedTranslationId: 'cn',
      translations: [{ id: 'cn', translation: 'Alice', aiModelId: 'm' }],
    };
    expect(getLanguageTranslation(paragraph, 'en-US')).toBeUndefined();
    const updated = appendLanguageTranslation(
      paragraph,
      'en-US',
      { id: 'en', translation: 'Alice', aiModelId: 'm' },
      { counter: 1, actorId: 'A' },
      10,
    );
    expect(getLanguageTranslation(updated, 'en-US')?.id).toBe('en');
    expect(getLanguageTranslation(updated, 'zh-CN')?.id).toBe('cn');
    expect(updated.selectedTranslationId).toBe('cn');
    expect(paragraph.translations).toHaveLength(1);
  });

  it('选用与删除拒绝其他语言 ID，删除当前版本只在同语言回退', () => {
    let p: Paragraph = { id: 'p', text: 'X', selectedTranslationId: '', translations: [] };
    p = appendLanguageTranslation(
      p,
      'zh-CN',
      { id: 'cn', translation: '甲', aiModelId: 'm' },
      { counter: 1, actorId: 'A' },
      10,
    );
    p = appendLanguageTranslation(
      p,
      'en-US',
      { id: 'en1', translation: 'A', aiModelId: 'm' },
      { counter: 2, actorId: 'A' },
      20,
    );
    p = appendLanguageTranslation(
      p,
      'en-US',
      { id: 'en2', translation: 'B', aiModelId: 'm' },
      { counter: 3, actorId: 'A' },
      30,
    );
    expect(() =>
      selectLanguageTranslation(p, 'en-US', 'cn', { counter: 4, actorId: 'A' }, 40),
    ).toThrow('TRANSLATION_LANGUAGE_MISMATCH');
    expect(() =>
      removeLanguageTranslation(p, 'en-US', 'cn', { counter: 4, actorId: 'A' }, 40),
    ).toThrow('TRANSLATION_LANGUAGE_MISMATCH');
    p = removeLanguageTranslation(p, 'en-US', 'en2', { counter: 4, actorId: 'A' }, 40);
    expect(getLanguageTranslation(p, 'en-US')?.id).toBe('en1');
    p = removeLanguageTranslation(p, 'en-US', 'en1', { counter: 5, actorId: 'A' }, 50);
    expect(getLanguageTranslation(p, 'en-US')).toBeUndefined();
    expect(getLanguageTranslation(p, 'zh-CN')?.id).toBe('cn');
  });

  it('编辑仅修改指定语言，空译名保持空白而不是回填原名', () => {
    const name = {
      name: 'Alice',
      translation: { id: 'cn', translation: '爱丽丝', aiModelId: 'm' },
    };
    const translated = setNameTranslation(
      name,
      'en-US',
      { id: 'en', translation: 'Alice', aiModelId: 'm' },
      { counter: 1, actorId: 'A' },
      10,
    );
    const cleared = setNameTranslation(translated, 'en-US', null, { counter: 2, actorId: 'A' }, 20);
    expect(getNameTranslation(cleared, 'en-US')).toBeUndefined();
    expect(getNameTranslation(cleared, 'zh-CN')?.translation).toBe('爱丽丝');
    expect(cleared.name).toBe('Alice');
    let p = appendLanguageTranslation(
      { id: 'p', text: 'A', translations: [], selectedTranslationId: '' },
      'en-US',
      { id: 'en', translation: 'A', aiModelId: 'm' },
      { counter: 1, actorId: 'A' },
      10,
    );
    expect(() => updateLanguageTranslation(p, 'zh-CN', 'en', '乙')).toThrow(
      'TRANSLATION_LANGUAGE_MISMATCH',
    );
    p = updateLanguageTranslation(p, 'en-US', 'en', 'B');
    expect(getLanguageTranslation(p, 'en-US')?.translation).toBe('B');
  });

  it('拒绝跨语言 ID 复用；重复选用不刷新槽版本，过时修改不能回退版本', () => {
    const p = appendLanguageTranslation(
      { id: 'p', text: 'X', translations: [], selectedTranslationId: '' },
      'zh-CN',
      { id: 'cn', translation: '甲', aiModelId: 'm' },
      { counter: 5, actorId: 'A' },
      50,
    );
    expect(() =>
      appendLanguageTranslation(
        p,
        'en-US',
        { id: 'cn', translation: 'A', aiModelId: 'm' },
        { counter: 6, actorId: 'A' },
        60,
      ),
    ).toThrow('TRANSLATION_ID_CONFLICT');
    const unchanged = selectLanguageTranslation(p, 'zh-CN', 'cn', { counter: 6, actorId: 'A' }, 60);
    expect(unchanged.selectedTranslations).toEqual(p.selectedTranslations);
    expect(() =>
      selectLanguageTranslation(p, 'zh-CN', null, { counter: 4, actorId: 'A' }, 60),
    ).toThrow('STALE_SYNC_REVISION');
  });
});
