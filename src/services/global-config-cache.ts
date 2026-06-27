import type { AppSettings, ProxySiteMappingEntry } from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

/**
 * 全局配置访问层（GlobalConfig）
 *
 * 目标：
 * - 让任意模块都能读取 settings/config，而不需要各自重复访问 IndexedDB
 * - 读取优先使用 Pinia store 的内存态；必要时通过 ensureInitialized() 触发一次性加载
 *
 * 重要：
 * - 该模块只负责“读取与初始化”，不替代 store 的写入/持久化逻辑
 */
export class GlobalConfig {
  private static initPromise: Promise<void> | null = null;

  private static tryGetSettingsStore(): ReturnType<typeof useSettingsStore> | null {
    try {
      return useSettingsStore();
    } catch {
      return null;
    }
  }

  private static tryGetBooksStore(): ReturnType<typeof useBooksStore> | null {
    try {
      return useBooksStore();
    } catch {
      return null;
    }
  }

  /**
   * 确保 settings/books 已加载到内存（Pinia store）
   *
   * - 在 UI 正常启动后通常无需调用（App.vue 已加载）
   * - 但在工具层/服务层等“非组件上下文”中，为了避免 DB 直读，应优先调用此方法
   */
  static async ensureInitialized(options?: { ensureSettings?: boolean; ensureBooks?: boolean }) {
    const ensureSettings = options?.ensureSettings !== false;
    const ensureBooks = options?.ensureBooks !== false;

    if (this.initPromise) {
      return await this.initPromise;
    }

    this.initPromise = (async () => {
      if (ensureSettings) {
        const settingsStore = this.tryGetSettingsStore();
        if (
          settingsStore &&
          'isLoaded' in settingsStore &&
          'loadSettings' in settingsStore &&
          typeof (settingsStore as any).isLoaded === 'boolean' &&
          typeof (settingsStore as any).loadSettings === 'function' &&
          !(settingsStore as any).isLoaded
        ) {
          await (settingsStore as any).loadSettings();
        }
      }

      if (ensureBooks) {
        const booksStore = this.tryGetBooksStore();
        if (
          booksStore &&
          'isLoaded' in booksStore &&
          'loadBooks' in booksStore &&
          typeof (booksStore as any).isLoaded === 'boolean' &&
          typeof (booksStore as any).loadBooks === 'function' &&
          !(booksStore as any).isLoaded
        ) {
          await (booksStore as any).loadBooks();
        }
      }
    })().finally(() => {
      // 允许后续再次 ensure（例如热重载/测试隔离），但默认不会反复触发 load
      this.initPromise = null;
    });

    return await this.initPromise;
  }

  static getTavilyApiKey(): string | undefined {
    const settingsStore = this.tryGetSettingsStore();
    return settingsStore ? (settingsStore as any).tavilyApiKey : undefined;
  }

  /**
   * 获取 Gist 同步配置快照（只读）
   * - 返回 undefined 表示 store 不可用
   */
  static getGistSyncSnapshot(): SyncConfig | undefined {
    const settingsStore = this.tryGetSettingsStore();
    return settingsStore ? ((settingsStore as any).gistSync as SyncConfig | undefined) : undefined;
  }

  /**
   * 获取完整应用设置快照（只读，包含 syncs）
   * - 返回 undefined 表示 store 不可用
   */
  static getAllSettingsSnapshot(): (AppSettings & { syncs: SyncConfig[] }) | undefined {
    const settingsStore = this.tryGetSettingsStore();
    if (!settingsStore) return undefined;
    if (typeof (settingsStore as any).getAllSettings !== 'function') return undefined;
    return (settingsStore as any).getAllSettings() as AppSettings & { syncs: SyncConfig[] };
  }

  static getProxyEnabled(): boolean {
    const settingsStore = this.tryGetSettingsStore();
    return settingsStore ? ((settingsStore as any).proxyEnabled ?? false) : false;
  }

  static getProxyUrl(): string {
    const settingsStore = this.tryGetSettingsStore();
    return settingsStore ? ((settingsStore as any).proxyUrl ?? '') : '';
  }

  static getProxyAutoSwitch(): boolean {
    const settingsStore = this.tryGetSettingsStore();
    return settingsStore ? ((settingsStore as any).proxyAutoSwitch ?? false) : false;
  }

  static getProxyAutoAddMapping(): boolean {
    const settingsStore = this.tryGetSettingsStore();
    return settingsStore ? ((settingsStore as any).proxyAutoAddMapping ?? true) : true;
  }

  static getProxyList(): Array<{ id: string; name: string; url: string; description?: string }> {
    const settingsStore = this.tryGetSettingsStore();
    return settingsStore ? (((settingsStore as any).proxyList ?? []) as any[]) : [];
  }

  static getProxiesForSite(site: string): string[] {
    const settingsStore = this.tryGetSettingsStore();
    if (!settingsStore) return [];
    const mapping = (settingsStore as any).proxySiteMapping as
      | Record<string, ProxySiteMappingEntry>
      | undefined;
    const entry = mapping?.[site];
    if (!entry || !entry.enabled) return [];
    return Array.isArray(entry.proxies) ? entry.proxies : [];
  }

  static async isSkipAskUserEnabledForBook(bookId: string): Promise<boolean> {
    if (!bookId) return false;
    await this.ensureInitialized({ ensureBooks: true, ensureSettings: false });
    const booksStore = this.tryGetBooksStore();
    if (!booksStore || typeof (booksStore as any).getBookById !== 'function') return false;
    const book = (booksStore as any).getBookById(bookId);
    return book?.skipAskUser ?? false;
  }

  static async getBookContextSource(bookId: string): Promise<{
    title?: string;
    description?: string;
    tags?: string[];
    skipAskUser?: boolean;
  } | null> {
    if (!bookId) return null;
    await this.ensureInitialized({ ensureBooks: true, ensureSettings: false });
    const booksStore = this.tryGetBooksStore();
    if (!booksStore || typeof (booksStore as any).getBookById !== 'function') return null;
    const book = (booksStore as any).getBookById(bookId);
    if (!book) return null;
    return {
      title: book.title,
      ...(book.description !== undefined ? { description: book.description } : {}),
      ...(book.tags !== undefined ? { tags: book.tags } : {}),
      ...(book.skipAskUser !== undefined ? { skipAskUser: book.skipAskUser } : {}),
    };
  }
}
