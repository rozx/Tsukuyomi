import type { EmbeddingProgressEvent } from 'src/models/embedding';

interface FileProgress {
  loaded: number;
  total: number;
  done: boolean;
}

/** Bekko 的 ONNX 权重占绝大部分下载量；配置文件完成不能代表整个模型完成。 */
export class EmbeddingDownloadProgress {
  private readonly files = new Map<string, FileProgress>();
  private percentage: number | undefined;

  reset(): void {
    this.files.clear();
    this.percentage = undefined;
  }

  update(event: EmbeddingProgressEvent): EmbeddingProgressEvent {
    if (event.file) this.recordFile(event);
    const entries = [...this.files.entries()];
    const weights = entries.filter(([file]) => file.endsWith('.onnx'));
    const weightTotal = weights.reduce((sum, [, file]) => sum + file.total, 0);
    const weightLoaded = weights.reduce((sum, [, file]) => sum + file.loaded, 0);
    const weightsDone = weights.length > 0 && weights.every(([, file]) => file.done);
    const allDone = weightsDone && entries.every(([, file]) => file.done);

    // 真实权重总量未知时保持不定进度；下载最多占 95%，模型初始化完成后才到 100%。
    if (weightTotal > 0 || weightsDone) {
      const downloaded = weightsDone ? 95 : Math.floor((weightLoaded / weightTotal) * 95);
      this.percentage = Math.max(this.percentage ?? 0, Math.min(95, downloaded));
    }

    return {
      ...event,
      phase: allDone ? 'initializing' : weights.length > 0 ? 'downloading' : 'preparing',
      aggregateLoaded: entries.reduce((sum, [, file]) => sum + file.loaded, 0),
      aggregateTotal: entries.reduce((sum, [, file]) => sum + file.total, 0),
      ...(this.percentage !== undefined ? { aggregatePercent: this.percentage } : {}),
    };
  }

  complete(): EmbeddingProgressEvent {
    this.percentage = 100;
    return { status: 'ready', phase: 'ready', aggregatePercent: 100 };
  }

  private recordFile(event: EmbeddingProgressEvent): void {
    const file = event.file!;
    const previous = this.files.get(file) ?? { loaded: 0, total: 0, done: false };
    const total = Number.isFinite(event.total) && event.total! > 0 ? event.total! : previous.total;
    const loaded = Number.isFinite(event.loaded) ? event.loaded! : previous.loaded;
    const done = event.status === 'done';
    this.files.set(file, {
      total,
      loaded: done ? total : Math.min(total, Math.max(previous.loaded, loaded, 0)),
      done,
    });
  }
}
