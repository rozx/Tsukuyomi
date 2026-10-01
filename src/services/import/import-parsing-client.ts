import { importCancelled, restoreImportError, importError } from './import-error';

import type { ImportFailure } from 'src/models/import-feedback';

import type { ImportParseRequest, ImportParseResponse } from 'src/models/import-parsing';
import type { ImportParseLimits, ImportWorkOptions } from './import-work-limits';
import { IMPORT_FALLBACK_LIMITS, IMPORT_PARSE_LIMITS } from './import-work-limits';

function usesRegex(request: ImportParseRequest): boolean {
  if (request.kind === 'pattern') return request.pattern.mode === 'regex';
  if (request.kind !== 'structure') return false;
  const r = request.rules;
  return [
    r.chapter_pattern,
    r.volume_pattern,
    r.selection?.start,
    r.selection?.end,
    r.selection?.body,
  ].some((p) => p?.mode === 'regex');
}

type Result<T extends ImportParseRequest> = {
  value: ImportParseResponse<T>;
  execution: 'worker' | 'main';
};

function boundedLimits(
  base: ImportParseLimits,
  requested?: Partial<ImportParseLimits>,
): ImportParseLimits {
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      Math.min(value, requested?.[key as keyof ImportParseLimits] ?? value),
    ]),
  ) as unknown as ImportParseLimits;
}

export class ImportParsingClient {
  constructor(
    private readonly createWorker: () => Worker | undefined = () =>
      typeof Worker === 'undefined'
        ? undefined
        : new Worker(new URL('../../workers/import-parser.worker.ts', import.meta.url), {
            type: 'module',
          }),
  ) {}

  private async fallback<T extends ImportParseRequest>(
    request: T,
    options: ImportWorkOptions,
  ): Promise<Result<T>> {
    if (usesRegex(request))
      throw importError(
        'REGEX_WORKER_REQUIRED',
        'regexWorkerRequiredRegexProcessingRequiresAWorkerUse',
        {},
      );
    const { processImportJob } = await import('./import-parsing-jobs');
    const value = await processImportJob(request, {
      ...options,
      limits: boundedLimits(IMPORT_FALLBACK_LIMITS, options.limits),
    });
    return { value, execution: 'main' };
  }

  async run<T extends ImportParseRequest>(
    request: T,
    options: ImportWorkOptions = {},
  ): Promise<Result<T>> {
    if (options.signal?.aborted) throw options.signal.reason ?? importCancelled('parseCancelled');
    let worker: Worker | undefined;
    try {
      worker = this.createWorker();
    } catch {
      /* Worker 被运行环境禁用时使用有界回退。 */
    }
    if (!worker) return this.fallback(request, options);
    const active = worker;
    const id = crypto.randomUUID();
    const limits = boundedLimits(IMPORT_PARSE_LIMITS, options.limits);
    return new Promise<Result<T>>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        active.terminate();
        active.onmessage = null;
        active.onerror = null;
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
      };
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      };
      const abort = () => fail(importCancelled('parseCancelled'));
      const timeout = setTimeout(
        () => fail(importError('PROCESSING_LIMIT', 'processingLimitWorkerParsingTimedOut', {})),
        request.kind === 'pattern' || usesRegex(request)
          ? Math.min(limits.timeoutMs, 3000)
          : limits.timeoutMs,
      );
      options.signal?.addEventListener('abort', abort, { once: true });
      active.onmessage = (
        event: MessageEvent<{
          id: string;
          success: boolean;
          value?: ImportParseResponse<T>;
          error?: Partial<ImportFailure> & { message: string; name?: string };
        }>,
      ) => {
        if (settled || event.data.id !== id) return;
        if (!event.data.success || event.data.value === undefined) {
          const record = event.data.error;
          const error = record
            ? restoreImportError({
                ...record,
                code: record.code ?? /^([A-Z_]+):/.exec(record.message)?.[1] ?? 'WORKER_FAILED',
              })
            : importError('WORKER_FAILED', 'workerFailed');
          if (record?.name) error.name = record.name;
          fail(error);
          return;
        }
        settled = true;
        cleanup();
        resolve({ value: event.data.value, execution: 'worker' });
      };
      active.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.fallback(request, options).then(resolve, reject);
      };
      // 保留宿主输入，模块 Worker 启动失败时才能安全走受限回退。
      try {
        active.postMessage({ id, request, limits, uiLocale: options.uiLocale });
      } catch {
        active.onerror?.(new ErrorEvent('error'));
      }
    });
  }
}
