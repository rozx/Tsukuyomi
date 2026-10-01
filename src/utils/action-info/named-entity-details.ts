import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import type { CharacterSetting, Novel, Terminology } from 'src/models/novel';
import { getNameTranslation } from 'src/services/localization/selection';
import { translateText } from 'src/i18n/translate';
import type { ActionDetail, ActionDetailsContext } from './types';
import { detailText, joinList } from './types';

const SEX_KEYS = {
  male: 'activityUi.sex.male',
  female: 'activityUi.sex.female',
  other: 'activityUi.sex.other',
} as const;

/** 性别枚举按界面语言显示；未知值原样保留。 */
export function sexLabel(locale: AppLocale, sex: string): string {
  const key = SEX_KEYS[sex as keyof typeof SEX_KEYS];
  return key ? translateText(locale, key) : sex;
}

/**
 * 读取实体在指定语言下的译名：有语言槽时只读该语言，
 * 仅当实体尚无任何语言槽（旧数据）时回退旧的单值译名。
 */
export function entityNameTranslation(
  entity: Terminology | CharacterSetting,
  language: AppLocale,
): string | undefined {
  if (entity.translationsByLanguage === undefined) {
    return entity.translation?.translation || undefined;
  }
  return getNameTranslation(entity, language)?.translation;
}

function actionLanguage(action: MessageAction, book: Novel): AppLocale {
  return action.language ?? book.targetLanguage ?? 'zh-CN';
}

function appendTermDetails(
  details: ActionDetail[],
  term: Terminology,
  language: AppLocale,
  locale: AppLocale,
): void {
  const translation = entityNameTranslation(term, language);
  if (translation) {
    details.push({ label: detailText(locale, 'translation'), value: translation });
  }
  if (term.description) {
    details.push({ label: detailText(locale, 'entityDescription'), value: term.description });
  }
}

function appendCharacterDetails(
  details: ActionDetail[],
  character: CharacterSetting,
  language: AppLocale,
  locale: AppLocale,
): void {
  const translation = entityNameTranslation(character, language);
  if (translation) {
    details.push({ label: detailText(locale, 'translation'), value: translation });
  }
  if (character.sex) {
    details.push({ label: detailText(locale, 'sex'), value: sexLabel(locale, character.sex) });
  }
  if (character.description) {
    details.push({
      label: detailText(locale, 'entityDescription'),
      value: character.description,
    });
  }
  if (character.speakingStyle) {
    details.push({ label: detailText(locale, 'speakingStyle'), value: character.speakingStyle });
  }
  if (character.aliases && character.aliases.length > 0) {
    details.push({
      label: detailText(locale, 'aliases'),
      value: joinList(
        locale,
        character.aliases.map((a) => a.name),
      ),
    });
  }
}

/**
 * 当 action.name 存在时，从当前书籍查找 term / character 的额外信息并追加。
 */
export function appendNamedEntityDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale = 'zh-CN',
): void {
  if (!action.name) return;

  const currentBookId = context.getCurrentBookId();
  if (!currentBookId) return;

  const book = context.getBookById(currentBookId);
  if (!book) return;

  if (action.entity === 'term') {
    const term = book.terminologies?.find((t) => t.name === action.name);
    if (term) appendTermDetails(details, term, actionLanguage(action, book), locale);
    return;
  }

  if (action.entity === 'character') {
    const character = book.characterSettings?.find((c) => c.name === action.name);
    if (character) appendCharacterDetails(details, character, actionLanguage(action, book), locale);
  }
}
