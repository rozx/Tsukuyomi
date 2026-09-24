import type { ImportNovelCandidate, ImportTask } from 'src/models/import';
import { canonicalStringify } from 'src/utils/canonical-json';

export function declareImportCandidates(
  task: ImportTask,
  candidates: ImportNovelCandidate[],
): void {
  const scope = task.draft.novelScope;
  if (canonicalStringify(scope.candidates) === canonicalStringify(candidates)) return;
  const identity = (items: ImportNovelCandidate[]) =>
    canonicalStringify(items.map(({ id, title, author }) => ({ id, title, author })));
  const identityChanged =
    scope.candidates.length > 0 && identity(scope.candidates) !== identity(candidates);
  const previous = scope.candidates.find((candidate) => candidate.id === scope.selectedCandidateId);
  if (previous)
    scope.previousSelection = {
      id: previous.id,
      title: previous.title,
      ...(previous.author ? { author: previous.author } : {}),
    };
  scope.candidates = candidates;
  scope.revision++;
  scope.requiresUserChoice ||= candidates.length > 1 || scope.needsChoice || identityChanged;
  delete scope.confirmation;
  delete scope.selectedCandidateId;
  scope.needsChoice = Boolean(scope.requiresUserChoice);
  if (scope.needsChoice) {
    const id = crypto.randomUUID();
    task.pendingQuestion = {
      id,
      toolCallId: id,
      kind: 'novel',
      required: true,
      question: '检测到多个作品或小说范围发生变化，请选择本次导入的唯一小说。',
      options: candidates.map((candidate) => ({
        id: candidate.id,
        label: `${candidate.title}${candidate.author ? ` · ${candidate.author}` : ''}`,
      })),
      scopeRevision: scope.revision,
      draftRevision: task.draft.revision + 1,
    };
    task.state = 'waiting_user';
  } else {
    scope.selectedCandidateId = candidates[0]!.id;
    if (!task.draft.metadata.title)
      task.draft.metadata.title = {
        value: candidates[0]!.title,
        origin: 'inferred',
        adopted: true,
      };
  }
}
