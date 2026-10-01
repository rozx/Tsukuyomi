import { describe, expect, it } from 'vitest';
import './setup';
import { DEFAULT_PROXY_LIST, displayProxy } from '../constants/proxy';

describe('内置代理按界面语言显示', () => {
  const builtIn = DEFAULT_PROXY_LIST[0]!;

  it('未修改的内置代理显示界面语言的名称与说明，URL 与 ID 不变', () => {
    const shown = displayProxy(builtIn, 'en-US');
    expect(shown).toEqual({
      id: builtIn.id,
      url: builtIn.url,
      name: 'CORS Tsukuyomi (recommended)',
      description: 'Default proxy for Tsukuyomi - Moonlit Translator (#^.^#)',
    });
    expect(displayProxy(builtIn, 'zh-CN')).toEqual(builtIn);
  });

  it('用户改过的名称或自定义代理保持原文', () => {
    const renamed = { ...builtIn, name: '我的代理' };
    expect(displayProxy(renamed, 'en-US').name).toBe('我的代理');
    const custom = { id: 'custom-1', name: '自建', url: 'https://x/?{url}' };
    expect(displayProxy(custom, 'en-US')).toBe(custom);
  });
});
