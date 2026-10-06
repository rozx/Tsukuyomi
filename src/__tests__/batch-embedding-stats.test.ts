import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import type { App, Slots } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type * as QuasarModule from 'quasar';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createAppI18n } from '../i18n/vue';
import BatchEmbeddingsPanel from '../components/novel/BatchEmbeddingsPanel.vue';
import { ChapterEmbeddingService } from '../services/chapter-embedding-service';
import { MemoryService } from '../services/memory-service';
import { dispatchMemoryChanged } from '../services/memory-cache';
import { useSettingsStore } from '../stores/settings';

// 此测试只验证统计读取；Quasar 屏幕尺寸作为外部环境固定为桌面宽度。
vi.mock('quasar', async (importOriginal) => {
  const quasar = await importOriginal<typeof QuasarModule>();
  return { ...quasar, useQuasar: () => ({ screen: { width: 1440 } }) };
});

vi.mock('primevue/drawer', () => ({
  default: {
    props: ['visible'],
    setup:
      (props: { visible: boolean }, { slots }: { slots: Slots }) =>
      () =>
        props.visible ? h('section', slots.default?.()) : null,
  },
}));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  await nextTick();
};

describe('批量嵌入面板统计读取', () => {
  it('关闭时不读全书向量，打开后合并一批事件且忽略访问时间变化', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSettingsStore().settings.enableLocalEmbedding = true;
    const chapters = vi.spyOn(ChapterEmbeddingService, 'getChunksForBook').mockResolvedValue([]);
    const memories = vi.spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue([]);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/books/:id', component: { render: () => null } }],
    });
    await router.push('/books/stats-book');
    const panel = ref<{ toggle: () => void }>();
    app = createApp({ render: () => h(BatchEmbeddingsPanel, { ref: panel }) });
    app
      .use(pinia)
      .use(PrimeVue)
      .use(ConfirmationService)
      .use(ToastService)
      .use(createAppI18n('zh-CN'))
      .use(router)
      .mount(document.body.appendChild(document.createElement('div')));
    await settle();
    expect(chapters).not.toHaveBeenCalled();
    expect(memories).not.toHaveBeenCalled();
    panel.value!.toggle();
    await settle();
    expect(chapters).toHaveBeenCalledTimes(1);
    chapters.mockClear();
    memories.mockClear();
    for (let index = 0; index < 8; index++) {
      dispatchMemoryChanged({
        bookId: 'stats-book',
        memoryId: `m${index}`,
        action: 'embedding-updated',
      });
    }
    await settle();
    expect(chapters).toHaveBeenCalledTimes(1);
    expect(memories).toHaveBeenCalledTimes(1);
    chapters.mockClear();
    dispatchMemoryChanged({ bookId: 'stats-book', action: 'accessed' });
    await settle();
    expect(chapters).not.toHaveBeenCalled();
    panel.value!.toggle();
    dispatchMemoryChanged({ bookId: 'stats-book', action: 'embedding-updated' });
    await settle();
    expect(chapters).not.toHaveBeenCalled();
  });
});
