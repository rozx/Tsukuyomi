import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetail, ActionDetailsContext } from './types';

const SEX_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  other: '其他',
};

/**
 * 当 action.name 存在时，从当前书籍查找 term / character 的额外信息并追加。
 */
export function appendNamedEntityDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (!action.name) return;

  const currentBookId = context.getCurrentBookId();
  if (!currentBookId) return;

  const book = context.getBookById(currentBookId);
  if (!book) return;

  if (action.entity === 'term') {
    const term = book.terminologies?.find((t) => t.name === action.name);
    if (!term) return;
    if (term.translation?.translation) {
      details.push({ label: '翻译', value: term.translation.translation });
    }
    if (term.description) {
      details.push({ label: '描述', value: term.description });
    }
    return;
  }

  if (action.entity === 'character') {
    const character = book.characterSettings?.find((c) => c.name === action.name);
    if (!character) return;
    if (character.translation?.translation) {
      details.push({ label: '翻译', value: character.translation.translation });
    }
    if (character.sex) {
      details.push({ label: '性别', value: SEX_LABELS[character.sex] || character.sex });
    }
    if (character.description) {
      details.push({ label: '描述', value: character.description });
    }
    if (character.speakingStyle) {
      details.push({ label: '说话口吻', value: character.speakingStyle });
    }
    if (character.aliases && character.aliases.length > 0) {
      details.push({
        label: '别名',
        value: character.aliases.map((a) => a.name).join('、'),
      });
    }
  }
}
