import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerationStreamCallback,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingStore, TaskType } from './task-types';
import {
  createStreamCallback,
  createUnifiedAbortController,
  type StreamCallbackConfig,
} from './stream-handler';

export interface LLMStreamAdapterOptions {
  aiServiceConfig: AIServiceConfig;
  request: TextGenerationRequest;
  generateText: (
    config: AIServiceConfig,
    request: TextGenerationRequest,
    callback: TextGenerationStreamCallback,
  ) => Promise<TextGenerationResult>;
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  chunkText: string;
  logLabel: string;
  taskType: TaskType;
}

export async function runLLMRequest(
  options: LLMStreamAdapterOptions,
): Promise<{ result: TextGenerationResult; streamedText: string }> {
  const {
    aiServiceConfig,
    request,
    generateText,
    taskId,
    aiProcessingStore,
    chunkText,
    logLabel,
    taskType,
  } = options;

  let streamedText = '';
  const { controller: streamAbortController, cleanup: cleanupAbort } = createUnifiedAbortController(
    aiServiceConfig.signal,
  );

  const wrappedStreamCallback = createWrappedStreamCallback(
    {
      taskId,
      aiProcessingStore,
      originalText: chunkText,
      logLabel,
      taskType,
      abortController: streamAbortController,
    },
    (text) => {
      streamedText += text;
    },
  );

  try {
    const result = await generateText(
      { ...aiServiceConfig, signal: streamAbortController.signal },
      request,
      wrappedStreamCallback,
    );

    if (!result) {
      throw new Error('AI 返回结果为空');
    }

    return { result, streamedText };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('取消') || error.name === 'AbortError')) {
      throw error;
    }

    console.error(`[${logLabel}] ❌ AI 请求失败:`, error instanceof Error ? error.message : error);
    throw error;
  } finally {
    cleanupAbort();
  }
}

function createWrappedStreamCallback(
  streamCallbackConfig: StreamCallbackConfig,
  onText: (text: string) => void,
): TextGenerationStreamCallback {
  const baseCallback = createStreamCallback(streamCallbackConfig);

  return async (chunk) => {
    if (chunk.text) {
      onText(chunk.text);
    }
    return baseCallback(chunk);
  };
}
