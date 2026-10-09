/** 嵌入空间与 Worker 协议；不依赖浏览器页面或业务状态。 */
export const MODEL_ID = 'hotchpotch/bekko-embedding-v1-a25m';
export const MODEL_VERSION = 'bekko-embedding-v1-a25m@384@mean@raw';
export const DIMENSIONS = 384;

export type EmbeddingStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type EmbeddingBackend = 'webgpu' | 'wasm';
export type EmbeddingTask = 'query' | 'document';
export type EmbeddingEventName = 'progress' | 'status-changed' | 'ready' | 'error';

export interface EmbeddingProgressEvent {
  status: string;
  phase?: 'preparing' | 'downloading' | 'initializing' | 'ready';
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  aggregateLoaded?: number;
  aggregateTotal?: number;
  aggregatePercent?: number;
}
export interface SerializedEmbeddingError {
  name: string;
  message: string;
}
export interface EmbeddingInitResult {
  status: EmbeddingStatus;
  backend: EmbeddingBackend | null;
  error: SerializedEmbeddingError | null;
}
type RequestIdentity = { id: number; generation: number };
export type EmbeddingWorkerRequest = RequestIdentity &
  (
    | { action: 'init' | 'reload' | 'clear-cache' }
    | { action: 'embed'; texts: string[]; task: EmbeddingTask; priority: EmbeddingTask }
  );
type EventDetails = {
  progress: EmbeddingProgressEvent;
  'status-changed': { status: EmbeddingStatus };
  ready: { modelVersion: string; backend: EmbeddingBackend };
  error: {
    error: SerializedEmbeddingError;
    retrying: boolean;
    retryCount?: number;
    fallbackToWasm?: boolean;
  };
};
export type EmbeddingWorkerEvent = {
  [Name in EmbeddingEventName]: {
    kind: 'event';
    generation: number;
    event: Name;
    detail: EventDetails[Name];
  };
}[EmbeddingEventName];
export type EmbeddingWorkerData = EmbeddingInitResult | Array<Float32Array | null>;
export type EmbeddingWorkerMessage =
  | EmbeddingWorkerEvent
  | (RequestIdentity &
      (
        | { kind: 'response'; success: true; data: EmbeddingWorkerData }
        | { kind: 'response'; success: false; error: SerializedEmbeddingError }
      ));
export interface EmbeddingWorkerPort {
  onmessage: ((event: MessageEvent<EmbeddingWorkerRequest>) => void) | null;
  postMessage(message: EmbeddingWorkerMessage, transfer?: Transferable[]): void;
}
