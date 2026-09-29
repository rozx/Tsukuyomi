import { describe, expect, it } from 'bun:test';
import './setup';
import { computed } from 'vue';
import { languageOptions, translateText } from '../i18n/translate';
import { createAppI18n } from '../i18n/vue';

describe('界面与服务共享语言资源', () => {
  it('界面与书籍语言选项使用同一支持列表和语言自称', () => {
    expect(languageOptions('en-US')).toEqual([
      { value: 'zh-CN', label: '简体中文' },
      { value: 'zh-TW', label: '繁體中文' },
      { value: 'en-US', label: 'English' },
    ]);
  });
  it('服务在没有组件或 store 时按显式语言插值，不受其他执行语言影响', async () => {
    const results = await Promise.all([
      Promise.resolve().then(() =>
        translateText('en-US', 'memoryInjection.modelInfo', { modelId: 'M1' }),
      ),
      Promise.resolve().then(() => translateText('zh-TW', 'failed')),
      Promise.resolve().then(() => translateText('zh-CN', 'failed')),
    ]);
    expect(results).toEqual([
      'Model: M1 (~195 MB, downloaded on first use)',
      '操作失敗',
      '操作失败',
    ]);
  });

  it('界面语言改变时已存在的文案响应式更新，思考态文案池保留', () => {
    const ui = createAppI18n('zh-CN');
    const label = computed(() => ui.global.t('failed'));
    expect(label.value).toBe('操作失败');
    ui.global.locale.value = 'en-US';
    expect(label.value).toBe('Action failed');
    expect(ui.global.tm('chat.thinkingPhrases')).toHaveLength(5);
    expect(translateText('zh-TW', 'failed')).toBe('操作失敗');
  });

  it('共享日期与数字格式跟随界面语言', () => {
    const ui = createAppI18n('en-US');
    expect(ui.global.d(new Date('2026-09-29T12:00:00Z'), 'short')).toBe('09/29/2026');
    expect(ui.global.n(1200.5, 'decimal')).toBe('1,200.5');
    ui.global.locale.value = 'zh-CN';
    expect(ui.global.d(new Date('2026-09-29T12:00:00Z'), 'short')).toBe('2026/09/29');
  });
});
