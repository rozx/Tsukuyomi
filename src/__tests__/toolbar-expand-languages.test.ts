import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp, ref } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import messages from '../i18n';
import { useToolbarExpand } from '../composables/useToolbarExpand';
let app: App | undefined;
afterEach(() => app?.unmount());
describe('面板工具栏展开提示', () => {
  it('提示响应界面语言与展开状态，图标身份保留', () => {
    const expanded = ref(false);
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    let toolbar!: ReturnType<typeof useToolbarExpand>;
    app = createApp({
      setup() {
        toolbar = useToolbarExpand(expanded);
        return () => null;
      },
    });
    app.use(i18n).mount(document.createElement('div'));
    expect(toolbar.toolbarExpandTitle.value).toBe('Search and filter');
    i18n.global.locale.value = 'zh-TW';
    expanded.value = true;
    expect(toolbar.toolbarExpandTitle.value).toBe('收合');
    expect(toolbar.toolbarExpandIcon.value).toBe('pi pi-chevron-up');
  });
});
