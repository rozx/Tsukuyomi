import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';

function stub(name: string) {
  return { default: defineComponent({ setup: () => () => h('div', { class: name }) }) };
}
vi.mock('src/components/desk-pet/DeskPet.vue', () => stub('stub-desk-pet'));
vi.mock('src/components/layout/TabletSysBar.vue', () => stub('stub'));
vi.mock('src/components/layout/TabletNavRail.vue', () => stub('stub'));
vi.mock('src/components/layout/TabletChatPanel.vue', () => stub('stub'));
vi.mock('src/components/import/ImportChatPanel.vue', () => stub('stub'));
vi.mock('src/components/layout/MobileSysBar.vue', () => stub('stub'));
vi.mock('src/components/layout/MobileTabBar.vue', () => stub('stub'));
vi.mock('src/components/layout/AppSideMenu.vue', () => stub('stub'));
vi.mock('src/components/layout/MobileChatSheet.vue', () => stub('stub'));
vi.mock('src/components/import/ImportChatSheet.vue', () => stub('stub'));

const { default: MainLayoutTablet } = await import('src/layouts/main-layout/MainLayoutTablet.vue');
const { default: MainLayoutMobile } = await import('src/layouts/main-layout/MainLayoutMobile.vue');

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

async function mount(layout: object) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  });
  await router.push('/books');
  const host = document.body.appendChild(document.createElement('div'));
  app = createApp(layout);
  app.use(router).mount(host);
  await nextTick();
  return host;
}

describe('月詠桌宠只在桌面布局', () => {
  it.each([
    ['平板', MainLayoutTablet],
    ['手机', MainLayoutMobile],
  ])('%s布局不渲染桌宠', async (_, layout) => {
    const host = await mount(layout);
    expect(host.querySelector('.stub')).not.toBeNull();
    expect(host.querySelector('.stub-desk-pet')).toBeNull();
  });
});
