import { LocalizedError } from 'src/utils/localized-error';

/**
 * 更新退出屏障：跟踪现有保存。
 * - 准备检查期间（preparing）新工作照常执行，但会使本次准备失败，避免准备失败后工作被静默丢弃。
 * - 准备成功（committed）到退出之间拒绝新工作，保证退出时没有执行到一半的多步写入。
 */
export class DesktopRestartGuard {
  private pending = 0;
  private phase: 'open' | 'preparing' | 'committed' = 'open';
  private interrupted = false;
  private generation = 0;

  beginAction(): () => void {
    if (this.phase === 'committed')
      throw new LocalizedError('RESTART_PREPARING', 'settingsUi.update.restartPending');
    if (this.phase === 'preparing') this.interrupted = true;
    this.pending++;
    let finished = false;
    return () => {
      if (!finished) {
        finished = true;
        this.pending--;
      }
    };
  }

  /** 在 beginAction/finish 之间执行工作，保证异常时也会结束计数。 */
  async track<T>(work: () => Promise<T>): Promise<T> {
    const finish = this.beginAction();
    try {
      return await work();
    } finally {
      finish();
    }
  }

  async prepare(flush: () => Promise<void>): Promise<void> {
    if (this.phase !== 'open')
      throw new LocalizedError('RESTART_PREPARING', 'settingsUi.update.restartPending');
    if (this.pending)
      throw new LocalizedError('RESTART_PENDING_WORK', 'settingsUi.update.pendingWork');
    this.phase = 'preparing';
    this.interrupted = false;
    const generation = ++this.generation;
    try {
      await flush();
      if (generation !== this.generation)
        throw new LocalizedError('RESTART_CANCELLED', 'settingsUi.update.cancelled');
      if (this.interrupted || this.pending) {
        throw new LocalizedError('RESTART_INTERRUPTED', 'settingsUi.update.interrupted');
      }
      this.phase = 'committed';
    } catch (error) {
      if (generation === this.generation) this.release();
      throw error;
    }
  }

  release(): void {
    this.phase = 'open';
    this.interrupted = false;
    this.generation++;
  }
}

export const desktopRestartGuard = new DesktopRestartGuard();
