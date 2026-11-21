import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, onMounted, onUnmounted, type App } from 'vue';
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
// 右侧面板记录挂载 / 卸载次数：收起时要保留同一个实例（对话的发送状态在面板组件里）
const panelLife = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock('src/components/layout/AppRightPanel.vue', () => ({
  default: defineComponent({
    setup() {
      onMounted(() => (panelLife.mounts += 1));
      onUnmounted(() => (panelLife.unmounts += 1));
      return () => h('div', { class: 'stub-right-panel' });
    },
  }),
}));
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
  it('面板从未打开时右侧宽度为 0，且不渲染面板内容', async () => {
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

  it('收起面板后保留同一个面板实例，只在收起动画结束后隐藏；再打开不重新挂载', async () => {
    panelLife.mounts = 0;
    panelLife.unmounts = 0;
    const { ui, host } = await mount();
    ui.rightPanelOpen = true;
    await nextTick();
    expect(panelLife.mounts).toBe(1);
    ui.rightPanelOpen = false;
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 260));
    await nextTick();
    expect(aside(host).style.width).toBe('0px');
    const panel = host.querySelector<HTMLElement>('.stub-right-panel');
    expect(panel).not.toBeNull();
    expect(panel!.style.display).toBe('none');
    expect(panelLife.unmounts).toBe(0);
    ui.rightPanelOpen = true;
    await nextTick();
    expect(host.querySelector<HTMLElement>('.stub-right-panel')!.style.display).toBe('');
    expect(panelLife.mounts).toBe(1);
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
