import { importCancelled, importError } from './import-error';
import type { AppLocale } from 'src/models/locale';

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
  uiLocale?: AppLocale;
  signal?: AbortSignal;
  limits?: Partial<ImportParseLimits>;
  yieldControl?: () => Promise<void>;
}

export function createImportWork(options: ImportWorkOptions = {}) {
  const limits = { ...IMPORT_PARSE_LIMITS, ...options.limits };
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0))
    throw importError('INVALID_LIMIT', 'invalidLimitParsingLimitsMustBePositiveIntegers', {});
  const started = Date.now();
  let yielded = started;
  const check = () => {
    if (options.signal?.aborted) throw options.signal.reason ?? importCancelled('parseCancelled');
    if (Date.now() - started > limits.timeoutMs)
      throw importError('PROCESSING_LIMIT', 'processingLimitParsingExceededTheTimeLimit', {});
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
