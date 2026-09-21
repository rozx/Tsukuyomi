import type { ImportDiscovery, ImportResource, ImportSource } from 'src/models/import';
import { ImportRepository, withImportWrite } from './import-repository';

type InputFile = Blob & { name: string };
type ObservedResource = Pick<ImportDiscovery, 'name' | 'kind' | 'locator' | 'relation'> & {
  inputResourceId?: string;
};

function networkLocation(input: string, base?: string): { url: string; anchor?: string } {
  try {
    const url = new URL(input, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error();
    const anchor = url.hash;
    url.hash = '';
    return { url: url.href, ...(anchor ? { anchor } : {}) };
  } catch {
    throw new Error('INVALID_URL: 只接受不含登录凭据的 HTTP(S) 网址');
  }
}

function relativePath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '..' || part === '.')
  ) {
    throw new Error('INVALID_PATH: 文件必须位于用户选择的目录内');
  }
  return normalized;
}

function newSource(taskId: string, name: string, kind: ImportSource['kind']): ImportSource {
  return {
    id: crypto.randomUUID(),
    taskId,
    name,
    kind,
    origin: 'user',
    purpose: 'content-root',
    status: 'registered',
    createdAt: Date.now(),
  };
}

/** 来源去重与登记共用一个事务，避免两个工具并发追加同一网址。 */
async function registerUnique(source: ImportSource): Promise<ImportSource> {
  return withImportWrite(async (tx) => {
    const task = await tx.objectStore('import-tasks').get(source.taskId);
    if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
    const store = tx.objectStore('import-sources');
    const sources = await store.index('by-task').getAll(source.taskId);
    const existing = sources.find((s) => {
      if (
        s.kind !== source.kind ||
        (s.purpose === 'metadata-only') !== (source.purpose === 'metadata-only')
      )
        return false;
      // 用户的明确授权不能被旧的 Agent 来源关系取代。
      if (source.origin === 'user' && s.origin !== 'user') return false;
      return source.kind === 'url'
        ? s.url === source.url && s.anchor === source.anchor
        : s.inputResourceId === source.inputResourceId && s.relativePath === source.relativePath;
    });
    if (existing) return existing;
    await store.add(source);
    task.updatedAt = Date.now();
    await tx.objectStore('import-tasks').put(task);
    return source;
  });
}

export class ImportSourceService {
  static async prepareMetadataUrl(
    taskId: string,
    input: string,
    name: string,
  ): Promise<{ source: ImportSource; isNew: boolean }> {
    const location = networkLocation(input);
    const db = await import('src/utils/indexed-db').then((module) => module.getDB());
    const sources = await db.getAllFromIndex('import-sources', 'by-task', taskId);
    const existing = sources.find(
      (source) =>
        source.kind === 'url' &&
        source.purpose === 'metadata-only' &&
        source.url === location.url &&
        source.anchor === location.anchor,
    );
    return existing
      ? { source: existing, isNew: false }
      : {
          source: {
            ...newSource(taskId, name, 'url'),
            ...location,
            origin: 'agent',
            purpose: 'metadata-only',
          },
          isNew: true,
        };
  }
  static async registerUrl(taskId: string, input: string): Promise<ImportSource> {
    const location = networkLocation(input);
    return registerUnique({ ...newSource(taskId, input, 'url'), ...location });
  }

  /** 仅供元信息搜索适配器调用，不作为可由模型任意调用的授权接口。 */
  static async registerMetadataUrl(
    taskId: string,
    input: string,
    name: string,
  ): Promise<ImportSource> {
    return registerUnique({
      ...newSource(taskId, name, 'url'),
      ...networkLocation(input),
      origin: 'agent',
      purpose: 'metadata-only',
    });
  }

  static async registerFiles(
    taskId: string,
    files: readonly InputFile[],
    replacesSourceId?: string,
  ): Promise<ImportSource[]> {
    if (replacesSourceId) await ImportRepository.getSource(taskId, replacesSourceId);
    const resources: ImportResource[] = [];
    const sources = files.map((file) => {
      const source = newSource(taskId, file.name, 'file');
      const id = crypto.randomUUID();
      resources.push({
        id,
        taskId,
        sourceId: source.id,
        kind: 'input',
        blob: file,
        createdAt: Date.now(),
      });
      return {
        ...source,
        inputResourceId: id,
        byteLength: file.size,
        mediaType: file.type,
        ...(replacesSourceId ? { replacesSourceId } : {}),
      };
    });
    await ImportRepository.registerSources(taskId, sources, resources);
    return sources;
  }

  static async registerDirectory(
    taskId: string,
    files: readonly { file: InputFile; path: string }[],
  ): Promise<ImportSource> {
    if (!files.length) throw new Error('EMPTY_DIRECTORY: 未选择文件');
    const entries = files.map(({ file, path }) => ({
      name: file.name,
      path: relativePath(path),
      inputResourceId: crypto.randomUUID(),
      byteLength: file.size,
      mediaType: file.type,
    }));
    if (new Set(entries.map((entry) => entry.path)).size !== entries.length)
      throw new Error('INVALID_PATH: 文件路径重复');
    const source = newSource(taskId, entries[0]!.path.split('/')[0]!, 'directory');
    source.inputResourceId = crypto.randomUUID();
    const resources: ImportResource[] = files.map(({ file }, index) => ({
      id: entries[index]!.inputResourceId,
      taskId,
      sourceId: source.id,
      kind: 'input',
      blob: file,
      createdAt: Date.now(),
    }));
    resources.push({
      id: source.inputResourceId,
      taskId,
      sourceId: source.id,
      kind: 'directory',
      entries,
      createdAt: Date.now(),
    });
    await ImportRepository.registerSources(taskId, [source], resources);
    return source;
  }

  static async inspectDirectory(taskId: string, sourceId: string): Promise<ImportDiscovery[]> {
    const source = await ImportRepository.getSource(taskId, sourceId);
    const resource =
      source.inputResourceId &&
      (await ImportRepository.getResource(taskId, source.inputResourceId));
    if (!resource || resource.kind !== 'directory')
      throw new Error('NOT_DIRECTORY: 来源不是已登记目录');
    return this.recordDiscoveries(
      taskId,
      sourceId,
      resource.entries.map((entry) => ({
        name: entry.name,
        kind: 'file',
        locator: entry.path,
        relation: 'file',
        inputResourceId: entry.inputResourceId,
      })),
    );
  }

  /** 由实际解析器提供观察结果，工具入参只接受这里返回的引用 ID。 */
  static async recordDiscoveries(
    taskId: string,
    sourceId: string,
    observed: ObservedResource[],
  ): Promise<ImportDiscovery[]> {
    const prepared = await this.prepareDiscoveries(taskId, sourceId, observed);
    await ImportRepository.saveStep(taskId, { resources: prepared.resources });
    return prepared.discoveries;
  }

  /** 供工具执行器把发现引用、原始资源和工具完成回执一起提交。 */
  static async prepareDiscoveries(
    taskId: string,
    sourceId: string,
    observed: ObservedResource[],
    prepared: { resources?: ImportResource[]; snapshotId?: string } = {},
  ): Promise<{ discoveries: ImportDiscovery[]; resources: ImportResource[] }> {
    const source = await ImportRepository.getSource(taskId, sourceId);
    const discoveries: ImportDiscovery[] = [];
    for (const item of observed) {
      let locator = item.locator;
      if (item.kind === 'url') {
        const location = networkLocation(item.locator, source.url);
        locator = location.url + (location.anchor ?? '');
      } else {
        locator = relativePath(locator);
        const input =
          item.inputResourceId &&
          (prepared.resources?.find((resource) => resource.id === item.inputResourceId) ??
            (await ImportRepository.getResource(taskId, item.inputResourceId)));
        if (!input || input.sourceId !== sourceId)
          throw new Error('SOURCE_SCOPE: 文件不在当前来源范围内');
      }
      const metadata =
        source.purpose === 'metadata-only' || ['metadata', 'cover'].includes(item.relation);
      discoveries.push({
        ...item,
        locator,
        id: crypto.randomUUID(),
        taskId,
        sourceId,
        purpose: metadata ? 'metadata-only' : 'content-derived',
        ...((prepared.snapshotId ?? source.currentSnapshotId)
          ? { snapshotId: prepared.snapshotId ?? source.currentSnapshotId! }
          : {}),
      });
    }
    const resources: ImportResource[] = discoveries.map((discovery) => ({
      id: discovery.id,
      taskId,
      sourceId,
      kind: 'discovery',
      discovery,
      createdAt: Date.now(),
    }));
    return { discoveries, resources };
  }

  static async addDiscovered(taskId: string, discoveryId: string): Promise<ImportSource> {
    const resource = await ImportRepository.getResource(taskId, discoveryId);
    if (resource?.kind !== 'discovery') throw new Error('SOURCE_SCOPE: 未找到已观察到的资源引用');
    const discovery = resource.discovery;
    const parent = await ImportRepository.getSource(taskId, discovery.sourceId);
    const source: ImportSource = {
      ...newSource(taskId, discovery.name, discovery.kind),
      origin: 'agent',
      purpose: parent.purpose === 'metadata-only' ? 'metadata-only' : discovery.purpose,
      parentSourceId: parent.id,
      discoveryId,
      ...(discovery.kind === 'url'
        ? networkLocation(discovery.locator)
        : { relativePath: discovery.locator }),
      ...(discovery.inputResourceId ? { inputResourceId: discovery.inputResourceId } : {}),
    };
    return registerUnique(source);
  }
}
