import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { createAppI18n } from '../i18n/vue';
import { useSettingsStore } from '../stores/settings';
import GeneralSettingsTab from '../components/settings/GeneralSettingsTab.vue';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  // 语言下拉（PrimeVue Select）依赖 matchMedia，jsdom 没有
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  const update = vi.spyOn(settings, 'updateSettings').mockResolvedValue();
  const root = document.createElement('div');
  app = createApp({ render: () => h(GeneralSettingsTab) });
  app.use(PrimeVue).use(ToastService).use(createAppI18n('zh-CN')).mount(root);
  return { root, settings, update };
}

describe('设置 → 通用设置：月詠桌宠开关', () => {
  it('缺省为开启，切换后写入设置', async () => {
    const { root, settings, update } = mount();
    expect(settings.deskPetEnabled).toBe(true);
    const input = root.querySelector<HTMLInputElement>('#desk-pet-enabled')!;
    expect(input).not.toBeNull();
    expect(root.textContent).toContain('显示月詠桌宠');
    expect(input.checked).toBe(true);

    // jsdom 里点击复选框不会触发 change，直接派发 ToggleSwitch 监听的 change
    input.dispatchEvent(new Event('change'));
    await nextTick();
    expect(update).toHaveBeenCalledWith({ showDeskPet: false });
  });

  it('设置已关闭时开关为关', async () => {
    const { root, settings } = mount();
    settings.settings.showDeskPet = false;
    await nextTick();
    expect(settings.deskPetEnabled).toBe(false);
    expect(root.querySelector<HTMLInputElement>('#desk-pet-enabled')!.checked).toBe(false);
  });
});
