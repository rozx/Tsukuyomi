import type { DesktopUpdateState } from '../src/models/desktop-update';

interface UpdateTarget {
  version: string;
}
interface UpdaterDependencies<T extends UpdateTarget> {
  version: string;
  unavailable?: string;
  check: () => Promise<T | null>;
  download: (target: T, progress: (percent: number) => void) => Promise<void>;
  confirm: () => Promise<boolean>;
  prepare: () => Promise<void>;
  install: (target: T) => void;
  release: () => void;
  publish?: (state: DesktopUpdateState) => void;
}

/** 主进程独占目标包，界面只能发出动作，不能传安装路径或更新描述。 */
export class DesktopUpdater<T extends UpdateTarget = UpdateTarget> {
  private state: DesktopUpdateState;
  private operation: { kind: 'check' | 'restart'; promise: Promise<void> } | undefined;
  /** 已完整下载、可以安装的目标；只有下载成功后才会写入。 */
  private downloaded: T | undefined;

  constructor(private readonly deps: UpdaterDependencies<T>) {
    this.state = {
      phase: deps.unavailable ? 'unavailable' : 'idle',
      currentVersion: deps.version,
      ...(deps.unavailable ? { message: deps.unavailable } : {}),
    };
  }

  snapshot(): DesktopUpdateState {
    return { ...this.state };
  }

  private publish(patch: Partial<DesktopUpdateState>) {
    this.state = { ...this.state, message: undefined, ...patch };
    this.deps.publish?.(this.snapshot());
  }

  private run(kind: 'check' | 'restart', work: () => Promise<void>): Promise<void> {
    const promise = work().finally(() => {
      this.operation = undefined;
    });
    this.operation = { kind, promise };
    return promise;
  }

  check(): Promise<void> {
    if (this.operation) return this.operation.promise;
    if (['unavailable', 'preparing', 'installing'].includes(this.state.phase)) {
      return Promise.resolve();
    }
    return this.run('check', () =>
      this.checkAndDownload().catch((error: unknown) => {
        this.publish({
          phase: 'error',
          message: error instanceof Error ? error.message : '更新检查失败',
        });
      }),
    );
  }

  private async checkAndDownload() {
    // 已有下载好的版本时后台静默检查：检查失败或没有更高版本都保持可安装。
    const background = this.state.phase === 'ready' && this.downloaded !== undefined;
    if (!background) {
      this.publish({ phase: 'checking', targetVersion: undefined, progress: undefined });
    }
    let target: T | null;
    try {
      target = await this.deps.check();
    } catch (error) {
      if (background) return;
      throw error;
    }
    if (!target) {
      if (!background) this.publish({ phase: 'idle', checkedAt: Date.now() });
      return;
    }
    if (background && target.version === this.downloaded?.version) return;
    // 开始下载新目标后旧包可能被清理，不能再回退安装旧目标。
    this.downloaded = undefined;
    this.publish({
      phase: 'downloading',
      targetVersion: target.version,
      progress: 0,
      checkedAt: Date.now(),
    });
    await this.deps.download(target, (progress) =>
      this.publish({ progress: Math.min(100, Math.max(0, progress)) }),
    );
    this.downloaded = target;
    this.publish({ phase: 'ready', progress: 100 });
  }

  async restart(): Promise<void> {
    if (this.operation?.kind === 'restart') return this.operation.promise;
    // 后台检查进行中时先等它结束，再按结果决定能否安装。
    if (this.operation) await this.operation.promise;
    if (this.operation) return this.operation.promise;
    if (this.state.phase !== 'ready' || !this.downloaded) return;
    const target = this.downloaded;
    return this.run('restart', () => this.prepareAndInstall(target));
  }

  private async prepareAndInstall(target: T) {
    try {
      if (!(await this.deps.confirm())) {
        // 清除上一次失败原因，界面不应把旧原因当作这次取消的结果。
        this.publish({});
        return;
      }
      this.publish({ phase: 'preparing' });
      await this.deps.prepare();
      this.publish({ phase: 'installing' });
      this.deps.install(target);
    } catch (error) {
      this.deps.release();
      this.publish({
        phase: 'ready',
        message: error instanceof Error ? error.message : '暂时无法重启',
      });
    }
  }
}
