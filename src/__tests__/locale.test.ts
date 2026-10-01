import { describe, expect, it } from 'bun:test';
import './setup';
import { resolveAppLocale } from '../models/locale';

describe('界面语言选择', () => {
  it('首次启动按系统首选列表匹配支持的语言', () => {
    expect(resolveAppLocale(undefined, ['fr-FR', 'en-GB'])).toBe('en-US');
  });

  it('优先保留已保存的有效偏好而不是系统语言', () => {
    expect(resolveAppLocale('zh-TW', ['en-US'])).toBe('zh-TW');
    expect(resolveAppLocale('en-US', ['zh-CN'])).toBe('en-US');
    expect(resolveAppLocale('zh-CN', ['zh-TW'])).toBe('zh-CN');
  });

  it('以显式脚本优先匹配简繁，再匹配地区，并尊重系统语言顺序', () => {
    for (const locale of ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-CN', 'ZH-hant']) {
      expect(resolveAppLocale(undefined, [locale, 'en-US'])).toBe('zh-TW');
    }
    for (const locale of ['zh-Hans', 'zh-CN', 'zh-SG', 'zh', 'zh-Hans-TW']) {
      expect(resolveAppLocale(undefined, [locale, 'en-US'])).toBe('zh-CN');
    }
    expect(resolveAppLocale(undefined, ['en-AU', 'zh-TW'])).toBe('en-US');
  });

  it('缺失、不支持和损坏的语言安全回退，不把非法偏好当作已保存选择', () => {
    expect(resolveAppLocale('ja-JP', ['zh-TW'])).toBe('zh-TW');
    expect(resolveAppLocale({}, ['', null, 'not_a_locale', 'fr-FR'])).toBe('zh-CN');
    expect(resolveAppLocale(null, [])).toBe('zh-CN');
  });
});
