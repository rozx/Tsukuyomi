import type { ImportDraft, ImportResource } from 'src/models/import';
import type {
  ImportStructureInput,
  ImportStructureResult,
  ImportTextStructureBatch,
} from 'src/models/import-text-structure';
import { structureContent } from './import-structure-content';

export function buildStructurePlan(
  resource: Extract<ImportResource, { kind: 'extraction' }>,
  result: ImportStructureResult,
  input: ImportStructureInput,
  draft: ImportDraft,
  sourceName: string,
): ImportTextStructureBatch {
  const content = structureContent(resource);
  const fallback = input.volume_id && draft.volumes.find((v) => v.id === input.volume_id);
  if (input.volume_id && !fallback) throw new Error('VOLUME_NOT_FOUND: 指定卷不存在');
  const volumes = result.volumes.map((v) =>
    v.inferred && fallback ? fallback : { ...v, id: crypto.randomUUID() },
  );
  const excluded = [...result.excluded];
  const items = result.chapters.map((c) => {
    const body = content.slice(c);
    excluded.push(...body.excluded);
    const warnings = [...c.warnings];
    const hasBody = Boolean(content.slice({ start: c.bodyStart, end: c.end }).text.trim());
    if (!hasBody && !warnings.includes('章节正文为空')) warnings.push('章节正文为空');
    return {
      ...c,
      warnings,
      hasBody,
      chapterId: crypto.randomUUID(),
      volumeTitle: volumes[c.volumeIndex]!.title,
      characters: body.text.length,
      head: body.text.slice(0, 160),
      tail: body.text.slice(-160),
      body,
    };
  });
  const chapters = items.map((item) => ({
    id: item.chapterId,
    volumeId: volumes[item.volumeIndex]!.id,
    title: item.title,
    inferredTitle: item.unassigned || input.rules.mode === 'single',
    inferredStructure: true,
    selected: !item.unassigned && item.hasBody,
    status: item.hasBody ? ('ready' as const) : ('missing' as const),
    content: item.body.refs,
    sourceIds: [resource.sourceId],
  }));
  const previews = items.map(({ body: _body, hasBody: _hasBody, ...item }) => item);
  excluded.sort((a, b) => a.start - b.start);
  return {
    input,
    volumes,
    chapters,
    items: previews,
    excluded,
    summary: {
      success: true,
      batchId: crypto.randomUUID(),
      resourceId: resource.id,
      sourceId: resource.sourceId,
      sourceName,
      snapshotId: resource.snapshotId,
      draftRevision: draft.revision,
      chapters: chapters.length,
      volumes: volumes.length,
      unassigned: items.filter((c) => c.unassigned).length,
      empty: chapters.filter((c) => c.status === 'missing').length,
      warningCount: items.reduce((sum, c) => sum + c.warnings.length, 0),
      selected: result.selected,
      totalCharacters: content.text.length,
      excludedCharacters: excluded.reduce((sum, r) => sum + r.end - r.start, 0),
      examples: previews.slice(0, 5),
    },
  };
}
