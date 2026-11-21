import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import messages from '../i18n';
import { provideIndexPage } from '../composables/index-page/useIndexPage';
import { useBooksStore } from '../stores/books';
import { useAIProcessingStore, type AIProcessingTask } from '../stores/ai-processing';
import type { Novel } from '../models/novel';

const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

async function mount(setup?: () => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  setup?.();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  });
  await router.push('/');
  let home!: ReturnType<typeof provideIndexPage>;
  app = createApp({
    setup() {
      home = provideIndexPage();
      return () => h('div');
    },
  });
  app
    .use(pinia)
    .use(router)
    .use(createI18n({ legacy: false, locale: 'en-US', messages }))
    .mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  return home;
}

function book(patch: Partial<Novel>): Novel {
  return {
    id: 'b1',
    title: 'Moon Book',
    lastEdited: new Date(),
    createdAt: new Date(),
    volumes: [],
    ...patch,
  } as Novel;
}

describe('首页页头（桌面与平板共用）', () => {
  it('空书库：欢迎标题、空书库说明，统计依次为书籍 / 章节 / 字数 / 术语 / 收藏', async () => {
    const home = await mount();
    const header = home.pageHeader.value;
    expect(header.eyebrow).toContain(home.greeting.value);
    expect(header.title).toBe('Welcome back');
    expect(header.description).toBe(
      `${home.greeting.value}. Add a book or import a source to start translating.`,
    );
    expect(header.stats.map((item) => item.label)).toEqual([
      'Books',
      'Chapters',
      'Characters',
      'Terms',
      'Favorites',
    ]);
    expect(header.stats[0]!.value).toBe(0);
  });

  it('有最近的书：说明提到上次停留的书', async () => {
    const home = await mount(() => {
      useBooksStore().books = [book({ starred: true })];
    });
    const header = home.pageHeader.value;
    expect(header.title).toBe('Welcome back');
    expect(header.description).toContain('Moon Book');
    expect(header.stats.find((item) => item.label === 'Favorites')?.value).toBe(1);
  });

  it('AI 任务进行中：标题改为工作台正在运行', async () => {
    const home = await mount(() => {
      useBooksStore().books = [book({})];
      useAIProcessingStore().activeTasks = [
        { id: 't', type: 'translation', modelName: 'M', status: 'processing', startTime: 1 },
      ] as AIProcessingTask[];
    });
    const header = home.pageHeader.value;
    expect(header.title).toBe('Workspace running');
    expect(header.description).toContain('AI is translating “Moon Book”');
  });
});
