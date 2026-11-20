import type { Chapter, Novel, Volume } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';

/**
 * 移动章节：调整卷内顺序，或移到另一卷（含新建的卷）。
 * 站内 Agent 的工具与外部 Agent（MCP）的工具共用这一份；界面上的拖拽排序走的是
 * ChapterService.moveChapter，写入方式相同（更新书籍的卷章结构）。
 */
export interface MoveChaptersRequest {
  /** 要移动的章节，按希望的先后顺序；多章作为一个整体移动 */
  chapterIds: readonly string[];
  /** 目标卷；用 before / after 定位时可省略 */
  targetVolumeId?: string | undefined;
  /** 新建一卷并移过去（与其他定位方式互斥） */
  newVolumeTitle?: string | undefined;
  /** 放在这一章之前 */
  beforeChapterId?: string | undefined;
  /** 放在这一章之后 */
  afterChapterId?: string | undefined;
  /** 没有 before / after 时放在卷首还是卷尾，默认卷尾 */
  position?: 'start' | 'end' | undefined;
}

export type MoveChaptersFailureCode =
  | 'BOOK_NOT_FOUND'
  | 'CHAPTER_IDS_REQUIRED'
  | 'CHAPTER_NOT_FOUND'
  | 'DUPLICATE_CHAPTER'
  | 'VOLUME_NOT_FOUND'
  | 'ANCHOR_NOT_FOUND'
  | 'ANCHOR_IS_MOVED'
  | 'TARGET_CONFLICT'
  | 'TARGET_REQUIRED';

export interface MoveChaptersFailure {
  ok: false;
  code: MoveChaptersFailureCode;
  /** 出问题的 ID（章节或卷），没有时为空 */
  id?: string;
}

export interface MoveChaptersPlan {
  ok: true;
  volumes: Volume[];
  targetVolumeId: string;
  /** 是否新建了卷 */
  createdVolume: boolean;
  /** 各章节移动前后的位置；index 是在目标卷里的序号（从 0 开始） */
  moved: Array<{ chapterId: string; fromVolumeId: string; toVolumeId: string; index: number }>;
  /** 移动后顺序与原来完全一样 */
  unchanged: boolean;
}

const fail = (code: MoveChaptersFailureCode, id?: string): MoveChaptersFailure => ({
  ok: false,
  code,
  ...(id !== undefined ? { id } : {}),
});

const chapterOrder = (volumes: readonly Volume[]): string =>
  JSON.stringify(volumes.map((vol) => [vol.id, (vol.chapters ?? []).map((ch) => ch.id)]));

/** 找出目标卷与定位用的章节；互相冲突或不存在时返回失败 */
function resolveTarget(
  volumes: Volume[],
  request: MoveChaptersRequest,
  locate: Map<string, string>,
  moving: ReadonlySet<string>,
): MoveChaptersFailure | { volumes: Volume[]; targetVolumeId: string; createdVolume: boolean } {
  const { beforeChapterId, afterChapterId, targetVolumeId } = request;
  const newVolumeTitle = request.newVolumeTitle?.trim();
  const anchorId = beforeChapterId ?? afterChapterId;

  if (anchorId !== undefined) {
    if (beforeChapterId !== undefined && afterChapterId !== undefined)
      return fail('TARGET_CONFLICT');
    if (newVolumeTitle) return fail('TARGET_CONFLICT');
    if (moving.has(anchorId)) return fail('ANCHOR_IS_MOVED', anchorId);
    const anchorVolumeId = locate.get(anchorId);
    if (!anchorVolumeId) return fail('ANCHOR_NOT_FOUND', anchorId);
    if (targetVolumeId && targetVolumeId !== anchorVolumeId) return fail('TARGET_CONFLICT');
    return { volumes, targetVolumeId: anchorVolumeId, createdVolume: false };
  }
  if (newVolumeTitle) {
    if (targetVolumeId) return fail('TARGET_CONFLICT');
    const withNew = ChapterService.addVolume({ volumes } as Novel, newVolumeTitle);
    return {
      volumes: withNew,
      targetVolumeId: withNew[withNew.length - 1]!.id,
      createdVolume: true,
    };
  }
  if (targetVolumeId) {
    if (!volumes.some((vol) => vol.id === targetVolumeId))
      return fail('VOLUME_NOT_FOUND', targetVolumeId);
    return { volumes, targetVolumeId, createdVolume: false };
  }
  // 没有说明目标：只有当要移动的章节都在同一卷时，才理解为在该卷内调整顺序
  const sourceVolumes = new Set([...moving].map((id) => locate.get(id)!));
  if (sourceVolumes.size !== 1) return fail('TARGET_REQUIRED');
  return { volumes, targetVolumeId: [...sourceVolumes][0]!, createdVolume: false };
}

/** 计算移动后的卷章结构，不写入 */
export function planChapterMove(
  book: Pick<Novel, 'volumes'>,
  request: MoveChaptersRequest,
): MoveChaptersPlan | MoveChaptersFailure {
  const original = book.volumes ?? [];
  const ids = [...request.chapterIds];
  if (ids.length === 0) return fail('CHAPTER_IDS_REQUIRED');

  /** 章节 ID → 所在卷 ID */
  const locate = new Map<string, string>();
  const byId = new Map<string, Chapter>();
  for (const vol of original) {
    for (const ch of vol.chapters ?? []) {
      locate.set(ch.id, vol.id);
      byId.set(ch.id, ch);
    }
  }
  const moving = new Set<string>();
  for (const id of ids) {
    if (!byId.has(id)) return fail('CHAPTER_NOT_FOUND', id);
    if (moving.has(id)) return fail('DUPLICATE_CHAPTER', id);
    moving.add(id);
  }

  const target = resolveTarget(original, request, locate, moving);
  if ('ok' in target) return target;

  // 先把要移动的章节从各卷取出，再整体插入目标位置
  const volumes = target.volumes.map((vol) => ({
    ...vol,
    chapters: (vol.chapters ?? []).filter((ch) => !moving.has(ch.id)),
  }));
  const targetVolume = volumes.find((vol) => vol.id === target.targetVolumeId)!;
  const anchorId = request.beforeChapterId ?? request.afterChapterId;
  let insertAt = request.position === 'start' ? 0 : targetVolume.chapters.length;
  if (anchorId !== undefined) {
    const anchorIndex = targetVolume.chapters.findIndex((ch) => ch.id === anchorId);
    insertAt = request.afterChapterId !== undefined ? anchorIndex + 1 : anchorIndex;
  }
  targetVolume.chapters.splice(insertAt, 0, ...ids.map((id) => byId.get(id)!));

  return {
    ok: true,
    volumes,
    targetVolumeId: target.targetVolumeId,
    createdVolume: target.createdVolume,
    moved: ids.map((id, offset) => ({
      chapterId: id,
      fromVolumeId: locate.get(id)!,
      toVolumeId: target.targetVolumeId,
      index: insertAt + offset,
    })),
    unchanged: !target.createdVolume && chapterOrder(volumes) === chapterOrder(original),
  };
}

/** 移动章节并写入书库；顺序没有变化时不写入 */
export async function moveChapters(
  bookId: string,
  request: MoveChaptersRequest,
): Promise<MoveChaptersPlan | MoveChaptersFailure> {
  const booksStore = useBooksStore();
  const book = booksStore.getBookById(bookId);
  if (!book) return fail('BOOK_NOT_FOUND', bookId);
  const plan = planChapterMove(book, request);
  if (!plan.ok || plan.unchanged) return plan;
  // 与界面上拖拽排序的写入方式相同
  await booksStore.updateBook(bookId, { volumes: plan.volumes, lastEdited: new Date() });
  return plan;
}

/** 从工具参数读出移动请求；站内与外部工具的参数名相同 */
export function readMoveChaptersRequest(args: Record<string, unknown>): MoveChaptersRequest {
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  return {
    chapterIds: Array.isArray(args.chapter_ids)
      ? args.chapter_ids.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      : [],
    targetVolumeId: text(args.target_volume_id),
    newVolumeTitle: text(args.new_volume_title),
    beforeChapterId: text(args.before_chapter_id),
    afterChapterId: text(args.after_chapter_id),
    position: args.position === 'start' ? 'start' : 'end',
  };
}

/** 站内与外部的 move_chapters 工具共用的参数定义；说明文字由调用方按各自的方式提供 */
export function moveChaptersParameters(describe: (parameter: string) => string) {
  const text = (name: string) => ({ type: 'string' as const, description: describe(name) });
  return {
    chapter_ids: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: describe('chapter_ids'),
    },
    target_volume_id: text('target_volume_id'),
    new_volume_title: text('new_volume_title'),
    before_chapter_id: text('before_chapter_id'),
    after_chapter_id: text('after_chapter_id'),
    position: {
      type: 'string' as const,
      enum: ['start', 'end'],
      description: describe('position'),
    },
  };
}
