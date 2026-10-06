import type {
  EmbeddingBackend,
  EmbeddingEventName,
  EmbeddingProgressEvent,
  EmbeddingStatus,
  EmbeddingTask,
  EmbeddingWorkerEvent,
  EmbeddingWorkerPort,
  EmbeddingWorkerRequest,
  SerializedEmbeddingError,
} from 'src/models/embedding';

interface Runtime {
  init(): Promise<void>;
  reload(): Promise<void>;
  getStatus(): EmbeddingStatus;
  getActiveBackend(): EmbeddingBackend | null;
  getLastError(): Error | null;
  clearQueryCache(): void;
  embedBatch(
    texts: string[],
    task: EmbeddingTask,
    priority: EmbeddingTask,
  ): Promise<Array<Float32Array | null>>;
  addEventListener(name: EmbeddingEventName, listener: (event: CustomEvent) => void): () => void;
}
function serialize(error: unknown): SerializedEmbeddingError {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
}

/** 生命周期串行、推理请求并行入队；计算由 runtime 内部的单模型调度器串行执行。 */
export function startEmbeddingWorker(port: EmbeddingWorkerPort, runtime: Runtime): void {
  let lifecycle = Promise.resolve();
  let eventGeneration = 0;
  let requestedGeneration = 0;
  const sendEvent = (event: Omit<EmbeddingWorkerEvent, 'generation'>) =>
    port.postMessage({ ...event, generation: eventGeneration } as EmbeddingWorkerEvent);
  runtime.addEventListener('progress', (event) =>
    sendEvent({ kind: 'event', event: 'progress', detail: event.detail as EmbeddingProgressEvent }),
  );
  runtime.addEventListener('status-changed', (event) =>
    sendEvent({
      kind: 'event',
      event: 'status-changed',
      detail: event.detail as { status: EmbeddingStatus },
    }),
  );
  runtime.addEventListener('ready', (event) =>
    sendEvent({
      kind: 'event',
      event: 'ready',
      detail: event.detail as { modelVersion: string; backend: EmbeddingBackend },
    }),
  );
  runtime.addEventListener('error', (event) => {
    const detail = event.detail as {
      error: unknown;
      retrying: boolean;
      retryCount?: number;
      fallbackToWasm?: boolean;
    };
    sendEvent({
      kind: 'event',
      event: 'error',
      detail: { ...detail, error: serialize(detail.error) },
    });
  });
  const handle = async (request: EmbeddingWorkerRequest): Promise<void> => {
    try {
      if (request.action === 'clear-cache') {
        if (request.generation === requestedGeneration) runtime.clearQueryCache();
        return;
      }
      if (request.action === 'embed') {
        if (request.generation !== requestedGeneration) throw new Error('旧模型请求已失效');
        const cached = await runtime.embedBatch(request.texts, request.task, request.priority);
        // 转移新副本的缓冲区，保留 runtime 的查询/段落缓存，避免下一次查询得到已分离的数组。
        const vectors = cached.map((vector) => (vector ? new Float32Array(vector) : null));
        const transfer = vectors.flatMap((vector) => (vector ? [vector.buffer] : []));
        port.postMessage(
          {
            kind: 'response',
            id: request.id,
            generation: request.generation,
            success: true,
            data: vectors,
          },
          transfer,
        );
        return;
      }
      eventGeneration = request.generation;
      if (request.action === 'reload') await runtime.reload();
      else await runtime.init();
      const error = runtime.getLastError();
      port.postMessage({
        kind: 'response',
        id: request.id,
        generation: request.generation,
        success: true,
        data: {
          status: runtime.getStatus(),
          backend: runtime.getActiveBackend(),
          error: error ? serialize(error) : null,
        },
      });
    } catch (error) {
      port.postMessage({
        kind: 'response',
        id: request.id,
        generation: request.generation,
        success: false,
        error: serialize(error),
      });
    }
  };
  port.onmessage = ({ data }) => {
    if (data.action === 'init' || data.action === 'reload') {
      requestedGeneration = Math.max(requestedGeneration, data.generation);
      lifecycle = lifecycle.then(() => handle(data));
    } else {
      void handle(data);
    }
  };
}
