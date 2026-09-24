import type { DesktopUpdateState } from '../src/models/desktop-update';

interface UpdateTarget {
  version: string;
}
interface UpdaterDependencies {
  version: string;
  unavailable?: string;
  check: () => Promise<UpdateTarget | null>;
  download: (progress: (percent: number) => void) => Promise<void>;
  confirm: () => Promise<boolean>;
  prepare: () => Promise<void>;
  install: () => void;
  release: () => void;
  publish?: (state: DesktopUpdateState) => void;
}

/** 主进程独占目标包，界面只能发出动作，不能传安装路径或更新描述。 */
export class DesktopUpdater {
  private state: DesktopUpdateState;
  private operation: Promise<void> | undefined;

  constructor(private readonly deps: UpdaterDependencies) {
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

  async check(): Promise<void> {
    if (this.operation) return this.operation;
    if (['unavailable', 'ready', 'installing'].includes(this.state.phase)) return;
    this.operation = this.checkAndDownload()
      .catch((error: unknown) => {
        this.publish({
          phase: 'error',
          message: error instanceof Error ? error.message : '更新检查失败',
        });
      })
      .finally(() => {
        this.operation = undefined;
      });
    return this.operation;
  }

  private async checkAndDownload() {
    this.publish({ phase: 'checking', targetVersion: undefined, progress: undefined });
    const target = await this.deps.check();
    if (!target) {
      this.publish({ phase: 'idle' });
      return;
    }
    this.publish({ phase: 'downloading', targetVersion: target.version, progress: 0 });
    await this.deps.download((progress) =>
      this.publish({ progress: Math.min(100, Math.max(0, progress)) }),
    );
    this.publish({ phase: 'ready', progress: 100 });
  }

  async restart(): Promise<void> {
    if (this.operation) return this.operation;
    if (this.state.phase !== 'ready') return;
    this.operation = this.prepareAndInstall().finally(() => {
      this.operation = undefined;
    });
    return this.operation;
  }

  private async prepareAndInstall() {
    try {
      if (!(await this.deps.confirm())) return;
      this.publish({ phase: 'preparing' });
      await this.deps.prepare();
      this.publish({ phase: 'installing' });
      this.deps.install();
    } catch (error) {
      this.deps.release();
      this.publish({
        phase: 'ready',
        message: error instanceof Error ? error.message : '暂时无法重启',
      });
    }
  }
}
