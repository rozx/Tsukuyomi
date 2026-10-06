import { EmbeddingRuntime } from 'src/services/embedding-runtime';
import { startEmbeddingWorker } from 'src/services/embedding-worker-handler';
import type { EmbeddingWorkerPort } from 'src/models/embedding';

startEmbeddingWorker(self as unknown as EmbeddingWorkerPort, EmbeddingRuntime);
