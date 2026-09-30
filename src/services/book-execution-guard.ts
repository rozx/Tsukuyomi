import { getDB } from 'src/utils/indexed-db';
import { desktopRestartGuard } from './desktop-restart-guard';
import { CodedLocalizedError } from 'src/utils/coded-localized-error';
import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { LocalizedError } from 'src/utils/localized-error';

export interface BookExecutionOwner {
  /** 简中说明：旧版本页面与无法识别 key 时的回退 */
  label: string;
  /** 自有占用者的说明身份：其他页面读取时按各自的界面语言渲染 */
  labelKey?: MessageKey;
  labelValues?: Record<string, string | number>;
  chapterId?: string;
}

/** 占用者说明：已知 key 按界面语言渲染，其余（旧页面或外部标签）保持原文 */
function ownerLabel(owner: BookExecutionOwner, locale: AppLocale): string {
  if (!owner.labelKey) return owner.label;
  const text = translateText(locale, owner.labelKey, owner.labelValues ?? {});
  return text === owner.labelKey ? owner.label : text;
}

function ownersText(owners: BookExecutionOwner[], locale: AppLocale): string {
  return owners
    .map((owner) => ownerLabel(owner, locale))
    .join(translateText(locale, 'bookUi.execution.ownerSeparator'));
}

function labelValues(value: unknown): Record<string, string | number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  return entries.every(([, item]) => typeof item === 'string' || typeof item === 'number')
    ? (Object.fromEntries(entries) as Record<string, string | number>)
    : undefined;
}

/** 占用者列表（书籍同步只展示列表本身）：按界面语言渲染并连接 */
class ExecutionOwnersError extends LocalizedError {
  constructor(private readonly owners: BookExecutionOwner[]) {
    super('TARGET_BUSY', 'bookUi.execution.ownerList', { owners: ownersText(owners, 'zh-CN') });
  }
  override messageFor(locale: AppLocale): string {
    return ownersText(this.owners, locale);
  }
}

export function executionOwnersError(owners: BookExecutionOwner[]): LocalizedError {
  return new ExecutionOwnersError(owners);
}

const PREFIX = 'tsukuyomi:book-execution:';
const OWNER_PREFIX = 'tsukuyomi:book-execution-owner:';

function manager(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

/** 目标书籍被占用：占用者标签按界面语言的分隔符连接，简中消息保持原样 */
class BookBusyError extends CodedLocalizedError {
  constructor(private readonly owners: BookExecutionOwner[]) {
    super('TARGET_BUSY', owners.length ? 'bookUi.execution.busy' : 'bookUi.execution.busyUnknown', {
      owners: ownersText(owners, 'zh-CN'),
    });
  }
  override messageFor(locale: AppLocale): string {
    return translateText(locale, this.messageKey, { owners: ownersText(this.owners, locale) });
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
        const values = 'labelValues' in value ? labelValues(value.labelValues) : undefined;
        return [
          {
            label: value.label,
            ...('labelKey' in value && typeof value.labelKey === 'string'
              ? { labelKey: value.labelKey as MessageKey }
              : {}),
            ...(values ? { labelValues: values } : {}),
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
        throw new BookBusyError(owners.filter((owner) => owner.label || owner.labelKey));
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
