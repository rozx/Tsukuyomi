import { describe, expect, it } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { useBooksStore } from '../stores/books';
import { characterTools } from '../services/ai/tools/character-tools';
import { CharacterSettingService } from '../services/character-setting-service';
import { BookService } from '../services/book-service';

describe('工具名称解析', () => {
  it('AI 按别名 ID 改名保留身份，按同名歧义更新被拒绝', async () => {
    setActivePinia(createPinia());
    await useBooksStore().addBook({
      id: 'b',
      title: '书',
      createdAt: new Date(0),
      lastEdited: new Date(0),
    });
    const character = await CharacterSettingService.addCharacterSetting('b', {
      name: 'Character',
      aliases: [{ name: 'Before', translation: '旧名' }],
    });
    const id = character.aliases[0]!.id!;
    const tool = characterTools.find(
      (entry) => entry.definition.function.name === 'update_character',
    )!;
    await tool.handler(
      { character_id: character.id, aliases: [{ id, name: 'After', translation: '新名' }] },
      { bookId: 'b' },
    );
    const renamed = (await BookService.getBookById('b'))!.characterSettings![0]!;
    expect(renamed.aliases[0]?.id).toBe(id);
    expect(renamed.aliases[0]?.name).toBe('After');
    await BookService.importEntities('b', 'character', [
      { ...renamed, aliases: [renamed.aliases[0]!, { ...renamed.aliases[0]!, id: 'independent' }] },
    ]);
    await useBooksStore().refreshBookFromStorage('b');
    await expect(
      tool.handler(
        { character_id: character.id, aliases: [{ name: 'After', translation: '不能猜测' }] },
        { bookId: 'b' },
      ),
    ).rejects.toThrow('AMBIGUOUS_ALIAS_NAME');
  });
  it('同名不同角色 ID 的查询拒绝歧义，不能随数组顺序选择', async () => {
    setActivePinia(createPinia());
    await useBooksStore().addBook({
      id: 'b',
      title: '书',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      characterSettings: ['one', 'two'].map((id) => ({
        id,
        name: 'Same',
        sex: undefined,
        aliases: [],
        translation: { id: `${id}-t`, translation: '同名角色', aiModelId: '' },
      })),
    });
    const tool = characterTools.find(
      (entry) => entry.definition.function.name === 'get_character',
    )!;
    await expect(
      tool.handler({ name: 'Same', include_memory: false }, { bookId: 'b' }),
    ).rejects.toThrow('AMBIGUOUS_CHARACTER_NAME');
  });
});
