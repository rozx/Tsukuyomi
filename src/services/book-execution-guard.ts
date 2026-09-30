import { getDB } from 'src/utils/indexed-db';
import { desktopRestartGuard } from './desktop-restart-guard';
import { CodedLocalizedError } from 'src/utils/coded-localized-error';
import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';

export interface BookExecutionOwner {
  label: string;
  chapterId?: string;
}

const PREFIX = 'tsukuyomi:book-execution:';
const OWNER_PREFIX = 'tsukuyomi:book-execution-owner:';

function manager(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

/** 目标书籍被占用：占用者标签按界面语言的分隔符连接，简中消息保持原样 */
class BookBusyError extends CodedLocalizedError {
  constructor(private readonly owners: string[]) {
    super('TARGET_BUSY', owners.length ? 'bookUi.execution.busy' : 'bookUi.execution.busyUnknown', {
      owners: owners.join('、'),
    });
  }
  override messageFor(locale: AppLocale): string {
    return translateText(locale, this.messageKey, {
      owners: this.owners.join(translateText(locale, 'bookUi.execution.ownerSeparator')),
    });
  }
}

/** 与同源页面共同持锁；无锁环境仍允许原有翻译，但禁止新增导入提交。 */
export class BookExecutionGuard {
  static async occupants(bookId: string): Promise<BookExecutionOwner[]> {
    const locks = manager();
    if (!locks?.query) return [];
    const prefix = `${OWNER_PREFIX}${encodeURIComponent(bookId)}:`;
    const { held } = await locks.query();
    return (held ?? []).flatMap((entry) => {
      if (!entry.name?.startsWith(prefix)) return [];
      try {
        const value: unknown = JSON.parse(decodeURIComponent(entry.name.slice(prefix.length)));
        if (
          !value ||
          typeof value !== 'object' ||
          !('label' in value) ||
          typeof value.label !== 'string'
        )
          return [];
        return [
          {
            label: value.label,
            ...('chapterId' in value && typeof value.chapterId === 'string'
              ? { chapterId: value.chapterId }
              : {}),
          },
        ];
      } catch {
        return [];
      }
    });
  }

  static async write<T>(
    bookId: string,
    owner: BookExecutionOwner,
    work: () => Promise<T>,
    prepare?: () => Promise<void>,
  ): Promise<T> {
    return desktopRestartGuard.track(() => {
      const locks = manager();
      if (!locks) return work();
      return this.withLock(bookId, 'shared', async () => {
        const name = `${OWNER_PREFIX}${encodeURIComponent(bookId)}:${encodeURIComponent(JSON.stringify({ ...owner, id: crypto.randomUUID() }))}`;
        return locks.request(name, { ifAvailable: true }, async () => {
          await prepare?.();
          return work();
        });
      });
    });
  }

  static commit<T>(bookId: string, work: () => Promise<T>): Promise<T> {
    return desktopRestartGuard.track(() => this.withLock(bookId, 'exclusive', work));
  }

  private static async withLock<T>(
    bookId: string,
    mode: LockMode,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!bookId) throw new CodedLocalizedError('INVALID_BOOK', 'bookUi.execution.invalidBook');
    const locks = manager();
    if (!locks)
      throw new CodedLocalizedError('LOCK_UNAVAILABLE', 'bookUi.execution.lockUnavailable');
    return locks.request(`${PREFIX}${bookId}`, { mode, ifAvailable: true }, async (lock) => {
      if (!lock) {
        const owners = await this.occupants(bookId);
        throw new BookBusyError(owners.map((owner) => owner.label).filter(Boolean));
      }
      // Electron 多进程的 Web Locks 不共享；先验证当前进程可访问实际书库。
      // 同一存储目录的 IndexedDB 所有权由现有 Chromium 存储进程协调，失败不得继续。
      try {
        await (await getDB()).count('book-revisions');
      } catch (error) {
        throw new CodedLocalizedError(
          'STORAGE_UNAVAILABLE',
          'bookUi.execution.storageUnavailable',
          {},
          { cause: error },
        );
      }
      return work();
    });
  }
}
