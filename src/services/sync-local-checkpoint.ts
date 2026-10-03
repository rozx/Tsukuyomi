import type { LocalManifestInput } from './sync-manifest-builder';
import type { Novel } from 'src/models/novel';
import type { SyncConfig } from 'src/models/sync';
import { MANIFEST_SCHEMA_VERSION } from 'src/models/manifest';
import { getDB } from 'src/utils/indexed-db';
import { hashJson } from 'src/utils/content-hash';
import { canonicalStringify } from 'src/utils/canonical-json';
import { normalizeBookLanguages } from './localization/normalize';
import {
  sortAIModelsById,
  sortCoversById,
  stripAppSettingsLocalFields,
  stripNovelLocalFields,
} from 'src/utils/sync-strip';
import { TOMBSTONE_TTL_MS } from 'src/models/manifest';
import { reserveSyncRevision } from './localization/clock';
import { assertRevision } from './localization/revision';

type FingerprintInput = Pick<
  LocalManifestInput,
  'appSettings' | 'aiModels' | 'coverHistory' | 'novels'
>;

/** 本轮轻量快照；只在确认上传载荷和当前状态都仍匹配时建立检查点。 */
export interface SyncLocalState {
  fingerprint: string;
  actorId: string;
  bookRevisions: Record<string, number>;
  inlineChapterIds: Set<string>;
}

/** 未加载的正文由持久化修改序号覆盖；内联正文也参与指纹，保护尚未持久化的编辑。 */
function fingerprintNovel(novel: Novel, inlineChapterIds: ReadonlySet<string>): Novel {
  return stripNovelLocalFields(
    normalizeBookLanguages({
      ...novel,
      ...(novel.volumes
        ? {
            volumes: novel.volumes.map((volume) => ({
              ...volume,
              ...(volume.chapters
                ? {
                    chapters: volume.chapters.map((chapter) => ({
                      ...chapter,
                      content: inlineChapterIds.has(chapter.id) ? chapter.content : undefined,
                      // 懒加载标记不代表语义变化，统一为上传路径使用的值。
                      contentLoaded: inlineChapterIds.has(chapter.id)
                        ? chapter.contentLoaded
                        : true,
                    })),
                  }
                : {}),
            })),
          }
        : {}),
    }),
  );
}

async function fingerprint(
  input: FingerprintInput,
  config: SyncConfig,
  state: Pick<SyncLocalState, 'actorId' | 'bookRevisions' | 'inlineChapterIds'>,
): Promise<string> {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const live = <T extends { deletedAt: number }>(records: T[] | undefined) =>
    (records ?? []).filter((record) => record.deletedAt > cutoff);
  return hashJson({
    version: 1,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    actorId: state.actorId,
    gistId: config.syncParams.gistId ?? '',
    bookRevisions: state.bookRevisions,
    novels: input.novels.map((novel) => fingerprintNovel(novel, state.inlineChapterIds)),
    appSettings: stripAppSettingsLocalFields(input.appSettings),
    aiModels: sortAIModelsById(input.aiModels),
    coverHistory: sortCoversById(input.coverHistory),
    deletions: {
      novels: live(config.deletedNovelIds),
      models: live(config.deletedModelIds),
      covers: live(config.deletedCoverIds),
      coverUrls: live(config.deletedCoverUrls),
      memories: live(config.deletedMemoryIds),
    },
    tombstones: Object.fromEntries(
      Object.entries(config.knownRemoteTombstones ?? {}).filter(
        ([, deletedAt]) => new Date(deletedAt).getTime() > cutoff,
      ),
    ),
  });
}

/** 单次读取小型序号表，不读取 chapter-contents / memories。失败时回退完整同步。 */
export async function captureSyncLocalState(
  input: FingerprintInput,
  config: SyncConfig,
): Promise<SyncLocalState | undefined> {
  try {
    const db = await getDB();
    const [records, clock] = await Promise.all([
      db.getAll('book-revisions'),
      db.get('sync-metadata', 'clock'),
    ]);
    if (clock) assertRevision(clock);
    // 本地身份不进入备份；数据库重建后，即使修改序号重新从 0 开始，也不会命中旧检查点。
    const actorId = clock?.actorId ?? (await reserveSyncRevision(db)).actorId;
    const revisions = new Map(records.map((record) => [record.bookId, record.revision]));
    const bookRevisionEntries: Array<[string, number]> = [];
    const inlineChapterIds = new Set<string>();
    for (const novel of input.novels) {
      // 旧数据库没有序号时从 0 起步；后续语义写入仍通过同一事务递增。
      const revision = revisions.has(novel.id) ? revisions.get(novel.id)! : 0;
      if (!Number.isSafeInteger(revision) || revision < 0) return undefined;
      bookRevisionEntries.push([novel.id, revision]);
      for (const volume of novel.volumes ?? []) {
        for (const chapter of volume.chapters ?? []) {
          if (chapter.content !== undefined) inlineChapterIds.add(chapter.id);
        }
      }
    }
    const state = {
      actorId,
      bookRevisions: Object.fromEntries(bookRevisionEntries),
      inlineChapterIds,
    };
    return { ...state, fingerprint: await fingerprint(input, config, state) };
  } catch (error) {
    console.warn('[sync-local-checkpoint] 无法读取本地指纹，回退完整同步:', error);
    return undefined;
  }
}

/** 本轮真实载荷按原来的内联正文范围投影，防止检查期间的编辑被误记为已同步。 */
export async function syncLocalStateMatchesPayload(
  state: SyncLocalState,
  input: FingerprintInput,
  config: SyncConfig,
): Promise<boolean> {
  return state.fingerprint === (await fingerprint(input, config, state));
}

/** 远端状态与协议也必须匹配；检查点只证明本地状态，不能替代远端条件 GET。 */
export function canSkipLocalSyncScan(
  state: SyncLocalState | undefined,
  config: SyncConfig,
): boolean {
  const checkpoint = config.localSyncCheckpoint;
  return (
    !!state &&
    !!checkpoint &&
    checkpoint.version === 1 &&
    config.knownRemoteSchemaVersion === MANIFEST_SCHEMA_VERSION &&
    checkpoint.fingerprint === state.fingerprint &&
    canonicalStringify(checkpoint.hashes) === canonicalStringify(config.knownRemoteHashes ?? {})
  );
}
