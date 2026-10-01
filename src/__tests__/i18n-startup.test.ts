import './setup';
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { useI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import { vi } from 'vitest';
import { useSettingsStore } from '../stores/settings';
import { initializeI18n } from '../i18n/setup';

// Node 的 Quasar 导出走 SSR 入口；在框架公开配置边界验证浏览器语言包传递。
const { setLanguage } = vi.hoisted(() => ({ setLanguage: vi.fn() }));
vi.mock('quasar', () => ({ Lang: { set: setLanguage } }));

describe('启动语言与框架集成', () => {
  afterEach(() => {
    mock.restore();
    localStorage.clear();
  });

  it('首屏直接使用 IndexedDB 偏好，同步切换后框架和已有表单同时保持正确', async () => {
    await useSettingsStore(createPinia()).setUiLocale('en-US');
    localStorage.setItem('tsukuyomi-settings', JSON.stringify({ uiLocale: 'zh-CN' }));
    const pinia = createPinia();
    const app = createApp({
      setup() {
        const { t } = useI18n();
        const draft = ref('unsaved');
        return () => h('div', [h('span', t('failed')), h('input', { value: draft.value })]);
      },
    });
    app.use(pinia).use(PrimeVue);
    await initializeI18n(app, pinia, ['zh-CN']);
    const host = document.createElement('div');
    app.mount(host);
    expect(host.textContent).toBe('Action failed');
    expect(document.documentElement.lang).toBe('en-US');
    expect(setLanguage).toHaveBeenLastCalledWith(expect.objectContaining({ isoName: 'en-US' }));
    expect(app.config.globalProperties.$primevue.config.locale?.emptyMessage).toBe(
      'No available options',
    );
    await useSettingsStore(pinia).importSettings({ uiLocale: 'zh-TW' });
    await nextTick();
    expect(host.textContent).toBe('操作失敗');
    expect(host.querySelector('input')?.value).toBe('unsaved');
    expect(document.documentElement.lang).toBe('zh-TW');
    expect(setLanguage).toHaveBeenLastCalledWith(expect.objectContaining({ isoName: 'zh-TW' }));
    expect(app.config.globalProperties.$primevue.config.locale?.emptyMessage).toBe('沒有可用選項');
    app.unmount();
  });

  it('设置读取失败时结束启动并按系统语言回退', async () => {
    const pinia = createPinia();
    spyOn(useSettingsStore(pinia), 'loadSettings').mockRejectedValue(
      new Error('storage unavailable'),
    );
    const app = createApp({ render: () => null });
    app.use(pinia);
    const i18n = await initializeI18n(app, pinia, ['zh-TW']);
    expect(i18n.global.locale.value).toBe('zh-TW');
    expect(useSettingsStore(pinia).isLoaded).toBe(true);
    app.mount(document.createElement('div'));
    app.unmount();
  });

  it('数据库升级被旧标签页阻塞时不卡住启动，读到设置后再切换到已存语言', async () => {
    const pinia = createPinia();
    const settings = useSettingsStore(pinia);
    let finish!: () => void;
    spyOn(settings, 'loadSettings').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            settings.settings = { ...settings.settings, uiLocale: 'en-US' };
            settings.isLoaded = true;
            resolve();
          };
        }),
    );
    const app = createApp({ render: () => null });
    app.use(pinia);
    const i18n = await initializeI18n(app, pinia, ['zh-TW'], {
      isDatabaseBlocked: () => true,
      pollMs: 1,
    });
    expect(i18n.global.locale.value).toBe('zh-TW');
    finish();
    await nextTick();
    expect(i18n.global.locale.value).toBe('en-US');
  });
});
