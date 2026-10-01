import { importFailure, importError } from './import-error';
import type { ImportNotice } from 'src/models/import-feedback';

import { assertImportWorkspaceEnabled } from 'src/constants/features';
import type { ImportOperation } from 'src/models/import';
import type { AppLocale } from 'src/models/locale';
import { isAppLocale, resolveAppLocale } from 'src/models/locale';
import { getDB } from 'src/utils/indexed-db';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import { BookExecutionGuard } from 'src/services/book-execution-guard';
import { maintainChapterContent } from 'src/services/chapter-content-maintenance';
import { bookCommitBus } from 'src/services/book-commit-notifications';
import {
  affectedImportChapters,
  applyImportOperation,
  readImportOperation,
  revertImportOperation,
} from './import-application-persistence';

export interface ImportConfirmation {
  readonly nonce: symbol;
}
type ConfirmationContext = {
  taskId: string;
  operationId: string;
  action: 'apply' | 'revert';
  creationLocale?: AppLocale;
};

/** 实例属于工作台宿主，确认不持久化，也不注册为模型工具。 */
export class ImportApplicationService {
  private readonly confirmations = new WeakMap<ImportConfirmation, ConfirmationContext>();

  async confirmApply(
    taskId: string,
    planId: string,
    expectedLocale?: AppLocale,
  ): Promise<ImportConfirmation> {
    return this.confirm(taskId, planId, 'apply', expectedLocale);
  }

  async confirmRevert(taskId: string, operationId: string): Promise<ImportConfirmation> {
    return this.confirm(taskId, operationId, 'revert');
  }

  private async confirm(
    taskId: string,
    operationId: string,
    action: ConfirmationContext['action'],
    expectedLocale?: AppLocale,
  ) {
    const operation = await readImportOperation(taskId, operationId);
    let creationLocale: AppLocale | undefined;
    if (action === 'apply' && operation.plan.targetKind === 'new') {
      const settings = await (await getDB()).get('settings', 'app');
      creationLocale =
        expectedLocale ??
        resolveAppLocale(
          settings?.uiLocale,
          typeof navigator === 'undefined' ? [] : navigator.languages,
        );
      if (!isAppLocale(creationLocale)) throw new Error('INVALID_LOCALE');
    }
    const token = Object.freeze({ nonce: Symbol('import-confirmation') });
    this.confirmations.set(token, {
      taskId,
      operationId,
      action,
      ...(creationLocale ? { creationLocale } : {}),
    });
    return token;
  }

  async apply(confirmation: ImportConfirmation): Promise<ImportOperation> {
    // 回退关闭导入时不再写书库；撤销仍可用，以便恢复已导入的小说
    assertImportWorkspaceEnabled();
    return this.execute(confirmation, 'apply');
  }
  revert(confirmation: ImportConfirmation): Promise<ImportOperation> {
    return this.execute(confirmation, 'revert');
  }

  private async execute(
    token: ImportConfirmation,
    action: ConfirmationContext['action'],
  ): Promise<ImportOperation> {
    const confirmation = this.confirmations.get(token);
    if (!confirmation || confirmation.action !== action)
      throw importError(
        'CONFIRMATION_REQUIRED',
        'confirmationRequiredThisWorkspaceRequiresUserConfirmationOf',
        {},
      );
    const operation = await readImportOperation(confirmation.taskId, confirmation.operationId);
    const terminal = action === 'apply' ? 'applied' : 'reverted';
    if (operation.state === terminal) return operation;
    return BookExecutionGuard.commit(operation.plan.targetBookId, async () => {
      const latest = await readImportOperation(confirmation.taskId, confirmation.operationId);
      if (latest.state === terminal) return latest;
      const result =
        action === 'apply'
          ? await applyImportOperation(latest, confirmation.creationLocale)
          : await revertImportOperation(latest);
      return this.maintain(result);
    });
  }

  /** 撤销是否可用及原因；只读检查，实际撤销仍在事务内复核。 */
  async revertStatus(
    taskId: string,
    operationId: string,
  ): Promise<{ available: true } | { available: false; reason: ImportNotice }> {
    const operation = await readImportOperation(taskId, operationId);
    if (operation.state === 'planned')
      return { available: false, reason: importFailure('UNDO_NOT_APPLIED', 'undoNotApplied') };
    if (operation.state === 'reverted')
      return { available: false, reason: importFailure('UNDO_ALREADY_REVERTED', 'undoAlready') };
    const db = await getDB();
    const revision = (await db.get('book-revisions', operation.plan.targetBookId))?.revision ?? 0;
    const exists = (await db.getKey('books', operation.plan.targetBookId)) !== undefined;
    if (!exists)
      return { available: false, reason: importFailure('UNDO_BOOK_DELETED', 'undoDeleted') };
    if (revision !== operation.postApplyBookRevision)
      return {
        available: false,
        reason: importFailure('UNDO_BOOK_CHANGED', 'undoChanged'),
      };
    return { available: true };
  }

  /** 重载只补派生维护，不重放书库应用或撤销。 */
  async recover(taskId: string, operationId: string): Promise<ImportOperation> {
    const operation = await readImportOperation(taskId, operationId);
    if (operation.state === 'planned') return operation;
    return this.maintain(operation);
  }

  private async maintain(operation: ImportOperation): Promise<ImportOperation> {
    if (!operation.pendingMaintenance.length) return operation;
    try {
      await maintainChapterContent(
        operation.plan.targetBookId,
        affectedImportChapters(operation.plan),
      );
      const revision =
        (await (await getDB()).get('book-revisions', operation.plan.targetBookId))?.revision ?? 0;
      await bookCommitBus.publish({
        bookId: operation.plan.targetBookId,
        revision,
        chapterIds: affectedImportChapters(operation.plan),
      });
      const tx = (await getDB()).transaction('import-operations', 'readwrite');
      return await completeIdbTransaction(tx, async () => {
        const current = await tx.store.get(operation.id);
        if (!current || current.state !== operation.state) return current ?? operation;
        current.pendingMaintenance = [];
        await tx.store.put(current);
        return current;
      });
    } catch (error) {
      console.warn('导入已提交，派生数据维护待重试:', error);
      return operation;
    }
  }
}
