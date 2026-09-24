/** 更新退出屏障：跟踪现有保存，准备期间禁止启动新的 store action 或书籍工作。 */
export class DesktopRestartGuard {
  private pending = 0;
  private frozen = false;
  private generation = 0;

  assertAvailable(): void {
    if (this.frozen) throw new Error('正在准备重启更新，请稍后再试');
  }

  beginAction(): () => void {
    this.assertAvailable();
    this.pending++;
    let finished = false;
    return () => {
      if (!finished) {
        finished = true;
        this.pending--;
      }
    };
  }

  async prepare(flush: () => Promise<void>): Promise<void> {
    this.assertAvailable();
    if (this.pending) throw new Error('仍有操作或保存尚未完成，请稍后重试');
    this.frozen = true;
    const generation = ++this.generation;
    try {
      await flush();
      if (generation !== this.generation) throw new Error('重启准备已取消');
    } catch (error) {
      if (generation === this.generation) this.release();
      throw error;
    }
  }

  release(): void {
    this.frozen = false;
    this.generation++;
  }
}

export const desktopRestartGuard = new DesktopRestartGuard();
