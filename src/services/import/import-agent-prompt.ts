import { localizeImportFeedback } from './import-error';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { ImportRepository } from './import-repository';
import { getDB } from 'src/utils/indexed-db';

export async function importAgentPrompt(
  taskId: string,
  summary: string | undefined,
  uiLocale: AppLocale,
): Promise<string> {
  const task = await ImportRepository.getTask(taskId);
  if (!task)
    throw new Error('TASK_NOT_FOUND: ' + translateText(uiLocale, 'aiImportPrompt.taskMissing'));
  const sources = await ImportRepository.listSources(taskId, { limit: 20 });
  const repair =
    task.purpose?.kind === 'recipe-repair'
      ? {
          bookId: task.purpose.bookId,
          previousRecipe:
            (await (await getDB()).get('books', task.purpose.bookId))?.updateRecipe ?? null,
          reason: task.purpose.reason,
        }
      : null;
  const state = {
    taskName: task.name,
    taskNamedBy: task.nameSource ?? null,
    draftRevision: task.draft.revision,
    target: task.draft.target,
    metadata: task.draft.metadata,
    novelScope: task.draft.novelScope,
    chapterCount: task.draft.chapters.length,
    batchProgress: task.batchProgress,
    pendingQuestion: task.pendingQuestion,
    sources: sources.items,
    moreSources: Boolean(sources.cursor),
    todos: task.todos,
    updateRecipe: task.draft.updateRecipe
      ? {
          declaredAtRevision: task.draft.updateRecipe.declaredAtRevision,
          catalogUrls: task.draft.updateRecipe.recipe.catalogUrls,
          selfTest: task.draft.updateRecipe.selfTest,
        }
      : null,
    repair,
  };
  const rules = Array.from(
    { length: 16 },
    (_, index) =>
      String(index + 1) +
      '. ' +
      translateText(uiLocale, ('aiImportPrompt.rules.' + String(index + 1)) as MessageKey),
  ).join('\n');
  return [
    translateText(uiLocale, 'aiAssistant.persona'),
    translateText(uiLocale, 'aiImportPrompt.intro'),
    translateText(uiLocale, 'aiImportPrompt.workflow') + '\n' + rules,
    summary ? translateText(uiLocale, 'aiImportPrompt.summary', { summary }) : '',
    translateText(uiLocale, 'aiImportPrompt.snapshot', {
      state: JSON.stringify(localizeImportFeedback(state, uiLocale)),
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}
