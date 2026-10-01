import { describe, expect, it } from 'bun:test';
import './setup';
import messages from '../i18n';
import { validateCatalogs } from '../i18n/validate';

describe('语言资源发布检查', () => {
  it('校验真实资源，并拒绝缺 key、错误插值参数和无法编译的资源', () => {
    expect(validateCatalogs(messages)).toEqual([]);
    const errors = validateCatalogs({
      'zh-CN': { hello: '你好 {name}', status: '就绪' },
      'zh-TW': { hello: '您好 {person}' },
      'en-US': { hello: 'Hello {name', status: 'Ready' },
    });
    expect(errors.some((s) => s.includes('zh-TW') && s.includes('status'))).toBe(true);
    expect(errors.some((s) => s.includes('zh-TW') && s.includes('hello'))).toBe(true);
    expect(errors.some((s) => s.includes('en-US') && s.includes('hello'))).toBe(true);
  });

  it('只存在于简中的模型专用文字无需繁中/英文版本，界面文字缺任一语言仍被拒绝', () => {
    expect(
      validateCatalogs({
        'zh-CN': { agent: '用{dialogLanguage}回复', ui: '就绪' },
        'zh-TW': { ui: '就緒' },
        'en-US': { ui: 'Ready' },
      }),
    ).toEqual([]);
    const errors = validateCatalogs({
      'zh-CN': { partial: '就绪', broken: '{oops' },
      'zh-TW': {},
      'en-US': { partial: 'Ready' },
    });
    expect(errors.some((s) => s.includes('zh-TW') && s.includes('partial'))).toBe(true);
    expect(errors.some((s) => s.includes('zh-CN') && s.includes('broken'))).toBe(true);
  });

  it('JSON、正则与特殊符号的字面量保留，协议片段变更使检查失败', () => {
    const source = `调用 {'{'}"status":"working"{'}'}；正则 \\d+{'|'}x；{'@'}user；{name}`;
    const catalogs = {
      'zh-CN': { prompt: source },
      'zh-TW': { prompt: source },
      'en-US': { prompt: source },
    };
    expect(
      validateCatalogs(catalogs, { prompt: ['{"status":"working"}', '\\d+|x', '@user'] }),
    ).toEqual([]);
    catalogs['en-US'].prompt = source.replace('working', 'done');
    expect(validateCatalogs(catalogs, { prompt: ['{"status":"working"}'] })).toContain(
      'en-US:prompt: 协议片段缺失：{"status":"working"}',
    );
  });
});
