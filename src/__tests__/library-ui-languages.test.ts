import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import messages from '../i18n';
import { provideBooksPage } from '../composables/books-page/useBooksPage';
import { provideIndexPage } from '../composables/index-page/useIndexPage';
import { formatWordCount, formatRelativeBookDate } from '../utils/format';
import type { AppLocale } from '../models/locale';
const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
async function mount() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  });
  await router.push('/');
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
  let books!: ReturnType<typeof provideBooksPage>;
  let home!: ReturnType<typeof provideIndexPage>;
  app = createApp({
    setup() {
      books = provideBooksPage();
      home = provideIndexPage();
      return () => h('div');
    },
  });
  app
    .use(pinia)
    .use(router)
    .use(i18n)
    .mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  return { books, home, i18n };
}
describe('首页与书库响应式文案', () => {
  it('菜单和问候跟随语言，排序身份、搜索词与用户书名保留', async () => {
    const { books, home, i18n } = await mount();
    books.searchQuery.value = '用户搜索词';
    expect(books.sortMenuItems.value[0]!.label).toBe('Default');
    expect(books.addBookMenuItems.value[0]!.label).toBe('Import from website');
    expect(home.greeting.value).not.toMatch(/\p{Script=Han}/u);
    expect(home.formatWordCount(15000)).toBe('15.0k');
    expect(books.formatWordCount(15000)).toBe('15.0k');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(books.sortMenuItems.value[0]!.label).toBe('預設');
    expect(books.addBookMenuItems.value[0]!.label).toBe('從網站匯入');
    expect(home.formatWordCount(15000)).toBe('1.5萬');
    expect(books.formatWordCount(15000)).toBe('1.5萬');
    expect(books.searchQuery.value).toBe('用户搜索词');
    expect(books.selectedSort.value).toBe('default');
  });
  it('英文数量与日期不带中文单位，简繁保留既有粒度与空值', () => {
    const count = formatWordCount as unknown as (count: number | null, locale: AppLocale) => string;
    const date = formatRelativeBookDate as unknown as (
      date: Date | string,
      locale: AppLocale,
    ) => string;
    expect(count(15000, 'en-US')).toBe('15.0k');
    expect(count(15000, 'zh-TW')).toBe('1.5萬');
    expect(count(null, 'en-US')).toBe('-');
    expect(date(new Date(), 'en-US')).toBe('Today');
    expect(date(new Date(), 'zh-TW')).toBe('今天');
    expect(date('invalid', 'en-US')).toBe('—');
  });
});

describe('书库操作反馈语言', () => {
  it('收藏反馈使用当前UI，用户书名和保存动作保留', async () => {
    const { books } = await mount();
    const book = { id: 'b', title: '用户书名', createdAt: new Date(), lastEdited: new Date() };
    const update = vi.spyOn(books.booksStore, 'updateBook').mockResolvedValue(undefined);
    await books.toggleStar(book);
    expect(feedback.add).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Favorited', detail: 'Favorited “用户书名”' }),
    );
    expect(update).toHaveBeenCalledWith('b', { starred: true });
  });
});

describe('章节动作菜单语言', () => {
  it('三语标签不改变移动可用性或回调', async () => {
    const { buildChapterActionMenuItems } = await import('../components/novel/volumes-list-utils');
    const move = vi.fn();
    const build = buildChapterActionMenuItems as unknown as (
      handlers: Parameters<typeof buildChapterActionMenuItems>[0],
      locale: AppLocale,
    ) => ReturnType<typeof buildChapterActionMenuItems>;
    const result = build(
      {
        canMoveUp: false,
        canMoveDown: true,
        onEdit: vi.fn(),
        onMoveUp: vi.fn(),
        onMoveDown: move,
        onDelete: vi.fn(),
      },
      'en-US',
    );
    expect(result[0]!.label).toBe('Edit chapters');
    expect(result[1]!.disabled).toBe(true);
    expect(result[2]!.disabled).toBe(false);
  });
});

describe('英文相对日期单复数', () => {
  it('一周和一个月使用单数，时间阈值保留', () => {
    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * 86400000);
    expect(formatRelativeBookDate(ago(8), 'en-US')).toBe('1 week ago');
    expect(formatRelativeBookDate(ago(35), 'en-US')).toBe('1 month ago');
    expect(formatRelativeBookDate(ago(65), 'en-US')).toBe('2 months ago');
  });
});
