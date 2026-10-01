import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ref } from 'vue';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { CharacterSettingService } from '../services/character-setting-service';
import { restoreEntityAction } from '../services/ai/tools/entity-action-restore';
import { TerminologyService } from '../services/terminology-service';
import { BookService } from '../services/book-service';
import { useChatActionHandler } from '../composables/chat/useChatActionHandler';
import { useContextStore } from '../stores/context';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { getNameTranslation } from '../services/localization/selection';
import type { ChatSessionMessage, MessageAction } from '../stores/chat-sessions';
import type { ActionInfo } from '../services/ai/tools/types';
afterEach(() => vi.restoreAllMocks());
describe('译名操作撤销', () => {
  it('撤销单语言更新保留原身份、后来简中编辑与新目标，书籍切换不改变撤销范围', async () => {
    const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const term = await TerminologyService.addTerminology(
      'fixture-book',
      { name: 'Doctor', translation: '简中旧值' },
      'zh-CN',
    );
    await TerminologyService.updateTerminology(
      'fixture-book',
      term.id,
      { translation: 'English before' },
      'en-US',
    );
    const before = (await BookService.getBookById('fixture-book'))!.terminologies![0]!;
    await TerminologyService.updateTerminology(
      'fixture-book',
      term.id,
      { translation: 'English after' },
      'en-US',
    );
    const after = (await BookService.getBookById('fixture-book'))!.terminologies![0]!;
    await books.addBook({
      id: 'other',
      title: 'Other',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      terminologies: [before],
    });
    useContextStore().setCurrentBook('other');
    const add = vi.fn();
    const handler = useChatActionHandler(
      { push: vi.fn() } as never,
      { add },
      () => {},
      () => {},
      ref<ChatSessionMessage[]>([{ id: 'message', role: 'assistant', content: '', timestamp: 0 }]),
      ref<MessageAction[]>([]),
      () => {},
      () => 0,
    );
    const action: ActionInfo = {
      type: 'update',
      entity: 'term',
      data: after,
      previousData: before,
      execution: { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') },
    };
    handler.handleAction(action, { value: 'message' });
    const revert = add.mock.calls
      .map(([value]) => value.onRevert)
      .find(Boolean) as () => Promise<void>;
    await TerminologyService.updateTerminology(
      'fixture-book',
      term.id,
      { translation: '简中新值' },
      'zh-CN',
    );
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    await revert();
    const saved = (await BookService.getBookById('fixture-book'))!;
    const restored = saved.terminologies!.find((value) => value.id === term.id)!;
    expect(restored).toBeDefined();
    expect(getNameTranslation(restored, 'en-US')?.translation).toBe('English before');
    expect(getNameTranslation(restored, 'zh-CN')?.translation).toBe('简中新值');
    expect(saved.targetLanguage).toBe('zh-TW');
    expect((await BookService.getBookById('other'))!.terminologies![0]!.id).toBe(term.id);
  });
  it('别名更新撤销保留后来其他语言和新别名，明确撤销删除分配稳定的新身份', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const character = await CharacterSettingService.addCharacterSetting(
      'fixture-book',
      {
        name: 'Person',
        translation: '主名',
        aliases: [
          { name: 'First', translation: '别名甲' },
          { name: 'Removed', translation: '别名乙' },
        ],
      },
      'zh-CN',
    );
    const firstId = character.aliases[0]!.id!;
    const removedId = character.aliases[1]!.id!;
    await CharacterSettingService.updateCharacterSetting(
      'fixture-book',
      character.id,
      {
        aliases: [
          { id: firstId, name: 'First', translation: 'English before' },
          { id: removedId, name: 'Removed', translation: 'English removed' },
        ],
      },
      'en-US',
    );
    const before = (await BookService.getBookById('fixture-book'))!.characterSettings![0]!;
    await CharacterSettingService.updateCharacterSetting(
      'fixture-book',
      character.id,
      { aliases: [{ id: firstId, name: 'First', translation: 'English after' }] },
      'en-US',
    );
    const after = (await BookService.getBookById('fixture-book'))!.characterSettings![0]!;
    await CharacterSettingService.updateCharacterSetting(
      'fixture-book',
      character.id,
      {
        description: 'Later description',
        aliases: [
          { id: firstId, name: 'First', translation: '简中新值' },
          { name: 'Later', translation: '后来别名' },
        ],
      },
      'zh-CN',
    );
    const action: ActionInfo = {
      type: 'update',
      entity: 'character',
      data: after,
      previousData: before,
      execution: { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') },
    };
    await restoreEntityAction(action, 'other', 'same-operation');
    let saved = (await BookService.getBookById('fixture-book'))!.characterSettings![0]!;
    expect(saved.id).toBe(character.id);
    expect(saved.description).toBe('Later description');
    expect(
      getNameTranslation(saved.aliases.find((alias) => alias.id === firstId)!, 'en-US')
        ?.translation,
    ).toBe('English before');
    expect(
      getNameTranslation(saved.aliases.find((alias) => alias.id === firstId)!, 'zh-CN')
        ?.translation,
    ).toBe('简中新值');
    expect(saved.aliases.some((alias) => alias.name === 'Later')).toBe(true);
    const recoveredId = saved.aliases.find((alias) => alias.name === 'Removed')!.id;
    expect(recoveredId).not.toBe(removedId);
    const ids = saved.aliases.map((alias) => alias.id);
    await restoreEntityAction(action, 'other', 'same-operation');
    saved = (await BookService.getBookById('fixture-book'))!.characterSettings![0]!;
    expect(saved.aliases.map((alias) => alias.id)).toEqual(ids);
  });
  it('更新操作的撤销不能复活之后已删除的实体', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const term = await TerminologyService.addTerminology(
      'fixture-book',
      { name: 'Term', translation: 'English' },
      'en-US',
    );
    const action: ActionInfo = {
      type: 'update',
      entity: 'term',
      data: term,
      previousData: term,
      execution: { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') },
    };
    await TerminologyService.deleteTerminology('fixture-book', term.id);
    await expect(restoreEntityAction(action, 'other', 'operation')).rejects.toThrow(
      'ENTITY_DELETED',
    );
    expect((await BookService.getBookById('fixture-book'))!.terminologies).toEqual([]);
  });
});
