import type { AppLocale } from '../models/locale';
import { serializeImportError } from '../services/import/import-error';
import type { ImportParseRequest } from '../models/import-parsing';
import { processImportJob } from '../services/import/import-parsing-jobs';

/** jsdom 不提供 Worker；传输边界模拟，规则计算使用实际解析入口。 */
export class ImportWorkerFixture {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate() {
    this.onmessage = null;
  }
  postMessage({
    id,
    request,
    uiLocale,
  }: {
    id: string;
    request: ImportParseRequest;
    uiLocale?: AppLocale;
  }) {
    void processImportJob(request, uiLocale ? { uiLocale } : {}).then(
      (value) => this.onmessage?.({ data: { id, success: true, value } } as MessageEvent),
      (error: Error) =>
        this.onmessage?.({
          data: { id, success: false, error: serializeImportError(error, 'WORKER_FAILED') },
        } as MessageEvent),
    );
  }
}
