/**
 * 来源页与草稿页的概览统计：来源状态分布、来源树展开与筛选、卷章状态汇总。
 */
import type { ImportDraft, ImportSource } from 'src/models/import';

export type SourceFilter = 'all' | ImportSource['status'];

export interface SourceOverview {
  total: number;
  status: Record<ImportSource['status'], number>;
  /** 月詠追加的来源。 */
  agent: number;
  metadataOnly: number;
}

export function sourceOverview(sources: readonly ImportSource[]): SourceOverview {
  const status: SourceOverview['status'] = {
    registered: 0,
    inspected: 0,
    extracted: 0,
    failed: 0,
    excluded: 0,
  };
  let agent = 0;
  let metadataOnly = 0;
  for (const source of sources) {
    status[source.status]++;
    if (source.origin === 'agent') agent++;
    if (source.purpose === 'metadata-only') metadataOnly++;
  }
  return { total: sources.length, status, agent, metadataOnly };
}

/**
 * 列表行。不筛选时按父子关系展开并缩进（父来源不在列表中时作为根）；
 * 按状态筛选时只列出匹配的来源，不缩进。
 */
export function sourceRows(
  sources: readonly ImportSource[],
  filter: SourceFilter,
): { source: ImportSource; depth: number }[] {
  if (filter !== 'all')
    return sources
      .filter((source) => source.status === filter)
      .map((source) => ({ source, depth: 0 }));
  const ids = new Set(sources.map((source) => source.id));
  const children = new Map<string, ImportSource[]>();
  const roots: ImportSource[] = [];
  for (const source of sources) {
    const parent = source.parentSourceId;
    if (parent && ids.has(parent)) children.set(parent, [...(children.get(parent) ?? []), source]);
    else roots.push(source);
  }
  const rows: { source: ImportSource; depth: number }[] = [];
  const visit = (source: ImportSource, depth: number) => {
    rows.push({ source, depth });
    for (const child of children.get(source.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return rows;
}

export interface DraftOverview {
  volumes: number;
  chapters: number;
  selected: number;
  ready: number;
  missing: number;
  failed: number;
  pending: number;
  /** 所属卷不存在的章节。 */
  orphans: number;
}

export function draftOverview(draft: Pick<ImportDraft, 'volumes' | 'chapters'>): DraftOverview {
  const volumeIds = new Set(draft.volumes.map((volume) => volume.id));
  const overview: DraftOverview = {
    volumes: draft.volumes.length,
    chapters: draft.chapters.length,
    selected: 0,
    ready: 0,
    missing: 0,
    failed: 0,
    pending: 0,
    orphans: 0,
  };
  for (const chapter of draft.chapters) {
    if (chapter.selected) overview.selected++;
    overview[chapter.status]++;
    if (!volumeIds.has(chapter.volumeId)) overview.orphans++;
  }
  return overview;
}
