import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '../stores/ui';

// 外壳里的头部、侧栏、页脚与本测试无关；右侧面板换成能看出是否渲染的占位
function stub(name: string) {
  return { default: defineComponent({ setup: () => () => h('div', { class: name }) }) };
}
vi.mock('src/components/layout/AppHeader.vue', () => stub('stub-header'));
vi.mock('src/components/layout/AppFooter.vue', () => stub('stub-footer'));
vi.mock('src/components/layout/AppSideMenu.vue', () => stub('stub-side-menu'));
vi.mock('src/components/layout/AppRightPanel.vue', () => stub('stub-right-panel'));
vi.mock('src/components/desk-pet/DeskPet.vue', () => stub('stub-desk-pet'));

const { default: MainLayoutDesktop } =
  await import('src/layouts/main-layout/MainLayoutDesktop.vue');

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

async function mount(path = '/books') {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  });
  await router.push(path);
  const host = document.body.appendChild(document.createElement('div'));
  app = createApp(MainLayoutDesktop);
  app.use(router).mount(host);
  await nextTick();
  return { ui: useUiStore(), host, router };
}

const aside = (host: HTMLElement) => host.querySelector<HTMLElement>('.desktop-shell-aside')!;

describe('桌面外壳：右侧助手面板', () => {
  it('面板关闭时右侧宽度为 0，且不渲染面板内容', async () => {
    const { ui, host } = await mount();
    ui.rightPanelOpen = false;
    await nextTick();
    expect(aside(host).style.width).toBe('0px');
    expect(host.querySelector('.stub-right-panel')).toBeNull();
  });

  it('桌面外壳挂载月詠桌宠（显示与否由桌宠自己按设置与助手面板判断）', async () => {
    const { host } = await mount();
    expect(host.querySelector('.desktop-shell-pet .stub-desk-pet')).not.toBeNull();
  });

  it('面板打开时按保存的宽度停靠并渲染面板', async () => {
    const { ui, host } = await mount();
    ui.rightPanelWidth = 420;
    ui.rightPanelOpen = true;
    await nextTick();
    expect(aside(host).style.width).toBe('420px');
    expect(host.querySelector('.stub-right-panel')).not.toBeNull();
  });

  it('导入页上面板即使关闭也常驻', async () => {
    const { ui, host } = await mount('/import');
    ui.rightPanelOpen = false;
    await nextTick();
    expect(aside(host).style.width).toBe(`${ui.rightPanelWidth}px`);
    expect(host.querySelector('.stub-right-panel')).not.toBeNull();
  });

  it('面板关闭时「复制到助手」会打开面板并保留消息给对话面板填入', async () => {
    const { ui, host } = await mount();
    ui.rightPanelOpen = false;
    await nextTick();
    ui.setAssistantInputMessage('解释这一段');
    await nextTick();
    expect(ui.rightPanelOpen).toBe(true);
    expect(ui.activeRightTab).toBe('chat');
    // 消息由挂载后的对话面板消费并清空，外壳只负责打开
    expect(ui.assistantInputMessage).toBe('解释这一段');
    await nextTick();
    expect(host.querySelector('.stub-right-panel')).not.toBeNull();
  });
});
