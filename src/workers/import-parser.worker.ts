import type { AppLocale } from 'src/models/locale';
import { serializeImportError } from 'src/services/import/import-error';
import type { ImportParseRequest } from 'src/models/import-parsing';
import type { ImportParseLimits } from 'src/services/import/import-work-limits';
import { processImportJob } from 'src/services/import/import-parsing-jobs';

interface Request {
  uiLocale?: AppLocale;
  id: string;
  request: ImportParseRequest;
  limits: ImportParseLimits;
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

async function handle({ id, request, limits, uiLocale }: Request): Promise<void> {
  try {
    const value = await processImportJob(request, { limits, ...(uiLocale ? { uiLocale } : {}) });
    const transfer =
      !Array.isArray(value) && 'entries' in value
        ? value.entries
            .map((entry) => entry.bytes.buffer)
            .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer)
        : [];
    scope.postMessage({ id, success: true, value }, [...new Set(transfer)]);
  } catch (error) {
    scope.postMessage({
      id,
      success: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        ...serializeImportError(error, 'WORKER_FAILED'),
      },
    });
  }
}

scope.onmessage = (event) => {
  void handle(event.data);
};
