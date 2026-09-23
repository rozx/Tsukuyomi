import { describe, expect, it } from 'vitest';
import {
  draftOverview,
  sourceOverview,
  sourceRows,
} from 'src/composables/import-page/import-workspace-overview';
import type { ImportDraft, ImportDraftChapter, ImportSource } from 'src/models/import';

function source(id: string, partial: Partial<ImportSource> = {}): ImportSource {
  return {
    id,
    taskId: 't',
    name: `${id}.txt`,
    kind: 'file',
    origin: 'user',
    purpose: 'content-root',
    status: 'registered',
    createdAt: 0,
    ...partial,
  };
}

function chapter(id: string, partial: Partial<ImportDraftChapter> = {}): ImportDraftChapter {
  return {
    id,
    volumeId: 'v1',
    title: id,
    inferredTitle: false,
    inferredStructure: false,
    selected: true,
    content: [],
    sourceIds: [],
    status: 'ready',
    ...partial,
  };
}

describe('来源概览', () => {
  it('统计总数、各状态数量、月詠发现与仅元信息的来源', () => {
    const overview = sourceOverview([
      source('a', { status: 'extracted' }),
      source('b', { status: 'failed', origin: 'agent' }),
      source('c', { origin: 'agent', purpose: 'metadata-only' }),
    ]);
    expect(overview).toMatchObject({ total: 3, agent: 2, metadataOnly: 1 });
    expect(overview.status).toMatchObject({ extracted: 1, failed: 1, registered: 1 });
  });

  it('不筛选时按父子关系展开并缩进，父来源缺失时作为根', () => {
    const rows = sourceRows(
      [
        source('dir', { kind: 'directory' }),
        source('child', { parentSourceId: 'dir' }),
        source('grand', { parentSourceId: 'child' }),
        source('orphan', { parentSourceId: 'gone' }),
      ],
      'all',
    );
    expect(rows.map((row) => [row.source.id, row.depth])).toEqual([
      ['dir', 0],
      ['child', 1],
      ['grand', 2],
      ['orphan', 0],
    ]);
  });

  it('按状态筛选时只列出匹配的来源且不缩进', () => {
    const rows = sourceRows(
      [
        source('dir', { kind: 'directory', status: 'inspected' }),
        source('bad', { parentSourceId: 'dir', status: 'failed' }),
        source('ok', { parentSourceId: 'dir', status: 'extracted' }),
      ],
      'failed',
    );
    expect(rows.map((row) => [row.source.id, row.depth])).toEqual([['bad', 0]]);
  });
});

describe('草稿概览', () => {
  it('统计卷数、章数、已选、各正文状态与未归属卷的章节', () => {
    const draft = {
      volumes: [{ id: 'v1', title: '卷一', inferred: false }],
      chapters: [
        chapter('a'),
        chapter('b', { selected: false }),
        chapter('c', { status: 'missing' }),
        chapter('d', { status: 'failed' }),
        chapter('e', { status: 'pending', volumeId: 'gone' }),
      ],
    } as Pick<ImportDraft, 'volumes' | 'chapters'>;
    expect(draftOverview(draft)).toEqual({
      volumes: 1,
      chapters: 5,
      selected: 4,
      ready: 2,
      missing: 1,
      failed: 1,
      pending: 1,
      orphans: 1,
    });
  });
});
