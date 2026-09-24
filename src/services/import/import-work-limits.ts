import { delayAbortable } from 'src/utils/abortable-operation';

export interface ImportParseLimits {
  inputBytes: number;
  entryBytes: number;
  totalBytes: number;
  entries: number;
  textCharacters: number;
  timeoutMs: number;
  paragraphs: number;
  gapCells: number;
}

export const IMPORT_PARSE_LIMITS: ImportParseLimits = {
  inputBytes: 64 * 1024 * 1024,
  entryBytes: 16 * 1024 * 1024,
  totalBytes: 128 * 1024 * 1024,
  entries: 4096,
  textCharacters: 4 * 1024 * 1024,
  timeoutMs: 20000,
  paragraphs: 200000,
  gapCells: 65536,
};

export const IMPORT_FALLBACK_LIMITS: ImportParseLimits = {
  inputBytes: 4 * 1024 * 1024,
  entryBytes: 512 * 1024,
  totalBytes: 16 * 1024 * 1024,
  entries: 1024,
  textCharacters: 256 * 1024,
  timeoutMs: 10000,
  paragraphs: 5000,
  gapCells: 16384,
};

export interface ImportWorkOptions {
  signal?: AbortSignal;
  limits?: Partial<ImportParseLimits>;
  yieldControl?: () => Promise<void>;
}

export function createImportWork(options: ImportWorkOptions = {}) {
  const limits = { ...IMPORT_PARSE_LIMITS, ...options.limits };
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0))
    throw new Error('INVALID_LIMIT: 解析限额必须为正整数');
  const started = Date.now();
  let yielded = started;
  const check = () => {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException('解析已取消', 'AbortError');
    if (Date.now() - started > limits.timeoutMs)
      throw new Error('PROCESSING_LIMIT: 解析超过时间上限');
  };
  return {
    limits,
    check,
    async checkpoint(force = false) {
      check();
      if (force || Date.now() - yielded >= 8) {
        await (options.yieldControl?.() ?? delayAbortable(0, options.signal));
        yielded = Date.now();
        check();
      }
    },
  };
}
