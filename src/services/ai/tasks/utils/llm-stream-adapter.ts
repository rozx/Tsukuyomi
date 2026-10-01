import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerationStreamCallback,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingStore } from './task-types';
import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
import { isCancelledError } from 'src/utils/is-cancelled-error';
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
  uiLocale: AppLocale;
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
    uiLocale,
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
      uiLocale,
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
      throw new Error(translateText(uiLocale, 'aiRun.emptyResult'));
    }

    return { result, streamedText };
  } catch (error) {
    if (isCancelledError(error)) {
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
