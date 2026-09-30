import { v5 } from 'uuid';
import type { ActionInfo } from './types';
import type { Alias, CharacterSetting, Terminology } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import { BookService } from 'src/services/book-service';
import { getNameTranslation } from 'src/services/localization/selection';
import { normalizeNameTranslations } from 'src/services/localization/normalize';
import { legacyRevision } from 'src/services/localization/revision';
import { canonicalStringify } from 'src/utils/canonical-json';
const RESTORE_NAMESPACE = 'ec7292ea-d584-5bd0-bf2f-8f04c9138121';
type Owner = Terminology | CharacterSetting | Alias;

function revertOwner<T extends Owner>(current: T, before: T, after: T, language: AppLocale): T {
  const desired = { ...current };
  // 只恢复本操作实际改过的共享字段，未改过的字段保留之后的编辑。
  const fields = ['name', 'description', 'sex', 'speakingStyle'] as const;
  for (const field of fields) {
    const old = (before as unknown as Record<string, unknown>)[field];
    if (
      canonicalStringify(old ?? null) !==
      canonicalStringify((after as unknown as Record<string, unknown>)[field] ?? null)
    ) {
      (desired as unknown as Record<string, unknown>)[field] = old;
    }
  }
  const oldValue = getNameTranslation(before, language) ?? null;
  const newValue = getNameTranslation(after, language) ?? null;
  if (canonicalStringify(oldValue) !== canonicalStringify(newValue)) {
    desired.translationsByLanguage = {
      ...current.translationsByLanguage,
      [language]: {
        ...(current.translationsByLanguage?.[language] ?? {
          revision: legacyRevision(oldValue),
          updatedAt: 0,
        }),
        value: oldValue,
      },
    };
  }
  return normalizeNameTranslations(desired, 0);
}
function revertAliases(
  current: CharacterSetting,
  before: CharacterSetting,
  after: CharacterSetting,
  language: AppLocale,
  bookId: string,
  operationId: string,
): Alias[] {
  const oldById = new Map(before.aliases.map((alias) => [alias.id, alias]));
  const afterById = new Map(after.aliases.map((alias) => [alias.id, alias]));
  const result = current.aliases
    .filter((alias) => !(afterById.has(alias.id) && !oldById.has(alias.id)))
    .map((alias) => {
      const old = oldById.get(alias.id);
      const changed = afterById.get(alias.id);
      return old && changed ? revertOwner(alias, old, changed, language) : alias;
    });
  for (const alias of before.aliases) {
    if (afterById.has(alias.id)) continue;
    // 明确撤销别名删除使用新身份；同一回调重试不会再分配另一身份。
    const id = v5(
      canonicalStringify([bookId, current.id, alias.id, operationId]),
      RESTORE_NAMESPACE,
    );
    if (!result.some((value) => value.id === id)) result.push({ ...alias, id });
  }
  return result;
}

/** 单语更新撤销走字段 diff；删除撤销仍走显式身份恢复协议。 */
export async function restoreEntityAction(
  action: ActionInfo,
  fallbackBookId: string,
  operationId: string,
): Promise<void> {
  const bookId = action.execution?.bookId ?? fallbackBookId;
  const kind = action.entity === 'term' ? 'term' : 'character';
  const before = action.previousData as Terminology | CharacterSetting;
  if (action.type !== 'update' || !action.execution) {
    await BookService.restoreEntity(bookId, kind, before, operationId);
    return;
  }
  const language = action.execution.languages.targetLanguage;
  const book = await BookService.getBookById(bookId);
  if (!book) throw new Error('BOOK_MISSING');
  const after = action.data as Terminology | CharacterSetting;
  if (kind === 'term') {
    const current = book.terminologies?.find((entity) => entity.id === after.id);
    if (!current) throw new Error('ENTITY_DELETED');
    const desired = revertOwner(current, before as Terminology, after as Terminology, language);
    await BookService.editEntities(
      book,
      {
        terminologies: book.terminologies!.map((entity) =>
          entity.id === desired.id ? desired : entity,
        ),
      },
      language,
    );
  } else {
    const current = book.characterSettings?.find((entity) => entity.id === after.id);
    if (!current) throw new Error('ENTITY_DELETED');
    const desired = revertOwner(
      current,
      before as CharacterSetting,
      after as CharacterSetting,
      language,
    );
    desired.aliases = revertAliases(
      current,
      before as CharacterSetting,
      after as CharacterSetting,
      language,
      bookId,
      operationId,
    );
    await BookService.editEntities(
      book,
      {
        characterSettings: book.characterSettings!.map((entity) =>
          entity.id === desired.id ? desired : entity,
        ),
      },
      language,
    );
  }
}
