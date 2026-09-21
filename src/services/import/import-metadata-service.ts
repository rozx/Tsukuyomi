import type { ImportDraft, ImportMetadataValue, ImportSource } from 'src/models/import';
import { ImportRepository } from './import-repository';
import { ImportSourceService } from './import-source-service';
import { ImportDraftService, invalidateImportPreview } from './import-draft-service';
import { searchWeb } from 'src/services/ai/tools/web-search-tools';
import { runAbortable } from 'src/utils/abortable-operation';

export class ImportMetadataService {
  static async prepareSearch(taskId: string, query: string, signal?: AbortSignal) {
    if (!(await ImportRepository.getTask(taskId)))
      throw new Error('TASK_NOT_FOUND: 导入任务不存在');
    if (typeof query !== 'string' || !query.trim() || query.length > 1000)
      throw new Error('INVALID_QUERY: 元信息检索词无效');
    const searched = await runAbortable(signal, () => searchWeb(query, signal));
    const newSources: ImportSource[] = [];
    const results: { title: string; snippet: string; url: string; sourceId: string }[] = [];
    const seen = new Map<string, ImportSource>();
    for (const item of searched.results ?? []) {
      if (typeof item.url !== 'string') continue;
      try {
        const prepared = await ImportSourceService.prepareMetadataUrl(
          taskId,
          item.url,
          String(item.title ?? item.url),
        );
        const key = `${prepared.source.url}${prepared.source.anchor ?? ''}`;
        const source = seen.get(key) ?? prepared.source;
        if (!seen.has(key) && prepared.isNew) newSources.push(source);
        seen.set(key, source);
        results.push({
          title: String(item.title ?? ''),
          snippet: String(item.snippet ?? '').slice(0, 4000),
          url: source.url!,
          sourceId: source.id,
        });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('INVALID_URL')) throw error;
      }
    }
    if (signal?.aborted) throw signal.reason ?? new DOMException('搜索已取消', 'AbortError');
    return {
      newSources,
      result: {
        success: searched.success,
        results,
        ...(searched.error ? { error: searched.error } : {}),
        ...(searched.message ? { message: searched.message } : {}),
        ...(searched.answer ? { answer: searched.answer } : {}),
        purpose: 'metadata-only' as const,
      },
    };
  }

  static async propose(
    taskId: string,
    revision: number,
    proposal: {
      field: keyof ImportDraft['metadata'];
      value: string;
      sourceId?: string;
      resourceId?: string;
    },
  ): Promise<ImportDraft> {
    return ImportDraftService.edit(taskId, {
      baseDraftRevision: revision,
      operations: [{ op: 'set_metadata', ...proposal }],
    });
  }

  /** 由字段候选的实际用户按钮调用，决定仅绑定当前版本和此候选。 */
  static async adopt(taskId: string, candidateId: string, revision: number): Promise<ImportDraft> {
    return ImportRepository.mutateTask(taskId, (task) => {
      if (task.draft.revision !== revision)
        throw new Error('DRAFT_CHANGED: 草稿已变化，请重新检查元信息候选');
      const candidate = task.draft.metadataCandidates?.find((item) => item.id === candidateId);
      if (!candidate || candidate.scopeRevision !== task.draft.novelScope.revision)
        throw new Error('METADATA_CHANGED: 候选或小说范围已改变');
      task.draft.metadata[candidate.field] = { ...candidate.value, adopted: true };
      task.draft.metadataCandidates = task.draft.metadataCandidates!.filter(
        (item) => item.id !== candidateId,
      );
      task.draft.revision++;
      invalidateImportPreview(task);
      return Promise.resolve(task.draft);
    });
  }

  static async setAdoption(
    taskId: string,
    field: keyof ImportDraft['metadata'],
    adopted: boolean,
    revision: number,
  ): Promise<ImportDraft> {
    return ImportRepository.mutateTask(taskId, (task) => {
      if (task.draft.revision !== revision) throw new Error('DRAFT_CHANGED: 草稿已变化');
      const value = task.draft.metadata[field];
      if (!value || typeof adopted !== 'boolean')
        throw new Error('INVALID_OPERATION: 元信息字段或选择无效');
      value.adopted = adopted;
      task.draft.revision++;
      invalidateImportPreview(task);
      return Promise.resolve(task.draft);
    });
  }

  /** 在应用事务前按需产生持久值，草稿与对话不反复保存图片 base64。 */
  static async resolveCover(taskId: string, value: ImportMetadataValue): Promise<string> {
    if (!value.value.startsWith('resource:')) {
      const url = new URL(value.value);
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('INVALID_COVER: 封面地址不能使用临时 object URL');
      return url.href;
    }
    if (!value.resourceId || !value.sourceId) throw new Error('INVALID_COVER: 缺少封面资源引用');
    const resource = await ImportRepository.getResource(taskId, value.resourceId);
    const source = await ImportRepository.getSource(taskId, value.sourceId);
    if (
      resource?.kind !== 'input' ||
      !resource.blob.type.startsWith('image/') ||
      (resource.sourceId !== source.id && source.inputResourceId !== resource.id)
    )
      throw new Error('INVALID_COVER: 图片资源不可用');
    if (resource.blob.size > 10 * 1024 * 1024) throw new Error('COVER_LIMIT: 封面超过 10 MiB');
    const bytes = new Uint8Array(await resource.blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return `data:${resource.blob.type};base64,${btoa(binary)}`;
  }
}
