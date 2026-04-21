import { describe, expect, it } from 'bun:test';
import { appendNamedEntityDetails } from 'src/utils/action-info/named-entity-details';
import type { ActionDetail, ActionDetailsContext } from 'src/utils/action-info/types';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { Novel, Terminology, CharacterSetting, Alias } from 'src/models/novel';

function makeTerm(over: Partial<Terminology> = {}): Terminology {
  return {
    id: 't1',
    name: '术语A',
    lastEdited: new Date(),
    ...over,
  } as Terminology;
}

function makeCharacter(over: Partial<CharacterSetting> = {}): CharacterSetting {
  return {
    id: 'c1',
    name: '角色A',
    lastEdited: new Date(),
    ...over,
  } as CharacterSetting;
}

function makeNovel(over: Partial<Novel> = {}): Novel {
  return {
    id: 'b1',
    title: '测试书',
    createdAt: new Date(),
    lastEdited: new Date(),
    ...over,
  };
}

function makeContext(over: Partial<ActionDetailsContext> = {}): ActionDetailsContext {
  return {
    getBookById: () => undefined,
    getCurrentBookId: () => null,
    ...over,
  };
}

function makeAction(over: Partial<MessageAction>): MessageAction {
  return {
    type: 'update',
    entity: 'term',
    timestamp: 0,
    ...over,
  } as MessageAction;
}

describe('appendNamedEntityDetails', () => {
  it('no-op when action.name is missing', () => {
    const details: ActionDetail[] = [];
    appendNamedEntityDetails(details, makeAction({}), makeContext());
    expect(details).toEqual([]);
  });

  it('no-op when current book id is null', () => {
    const details: ActionDetail[] = [];
    appendNamedEntityDetails(
      details,
      makeAction({ name: '术语A' }),
      makeContext({ getCurrentBookId: () => null }),
    );
    expect(details).toEqual([]);
  });

  it('no-op when book lookup returns undefined', () => {
    const details: ActionDetail[] = [];
    appendNamedEntityDetails(
      details,
      makeAction({ name: '术语A' }),
      makeContext({ getCurrentBookId: () => 'b1', getBookById: () => undefined }),
    );
    expect(details).toEqual([]);
  });

  describe('term entity', () => {
    it('no-op when term is not found', () => {
      const details: ActionDetail[] = [];
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'term', name: '不存在' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ terminologies: [] }),
        }),
      );
      expect(details).toEqual([]);
    });

    it('no-op when terminologies is undefined', () => {
      const details: ActionDetail[] = [];
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'term', name: '术语A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel(),
        }),
      );
      expect(details).toEqual([]);
    });

    it('appends translation when present', () => {
      const details: ActionDetail[] = [];
      const term = makeTerm({
        name: '术语A',
        translation: { id: 'tr1', translation: '译文A', aiModelId: '' },
      });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'term', name: '术语A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ terminologies: [term] }),
        }),
      );
      expect(details).toContainEqual({ label: '翻译', value: '译文A' });
    });

    it('appends description when present', () => {
      const details: ActionDetail[] = [];
      const term = makeTerm({ name: '术语A', description: '描述A' });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'term', name: '术语A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ terminologies: [term] }),
        }),
      );
      expect(details).toContainEqual({ label: '描述', value: '描述A' });
    });

    it('appends both translation and description when both present', () => {
      const details: ActionDetail[] = [];
      const term = makeTerm({
        name: '术语A',
        translation: { id: 'tr1', translation: '译文A', aiModelId: '' },
        description: '描述A',
      });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'term', name: '术语A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ terminologies: [term] }),
        }),
      );
      expect(details).toHaveLength(2);
    });

    it('skips translation with empty string', () => {
      const details: ActionDetail[] = [];
      const term = makeTerm({
        name: '术语A',
        translation: { id: 'tr1', translation: '', aiModelId: '' },
      });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'term', name: '术语A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ terminologies: [term] }),
        }),
      );
      expect(details).toEqual([]);
    });
  });

  describe('character entity', () => {
    it('no-op when character is not found', () => {
      const details: ActionDetail[] = [];
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'character', name: '不存在' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ characterSettings: [] }),
        }),
      );
      expect(details).toEqual([]);
    });

    it('appends translation when present', () => {
      const details: ActionDetail[] = [];
      const character = makeCharacter({
        name: '角色A',
        translation: { id: 'tr1', translation: '译名A', aiModelId: '' },
      });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'character', name: '角色A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ characterSettings: [character] }),
        }),
      );
      expect(details).toContainEqual({ label: '翻译', value: '译名A' });
    });

    it('maps known sex values to Chinese labels', () => {
      for (const [sex, label] of [
        ['male', '男'],
        ['female', '女'],
        ['other', '其他'],
      ] as const) {
        const details: ActionDetail[] = [];
        const character = makeCharacter({ name: '角色A', sex });
        appendNamedEntityDetails(
          details,
          makeAction({ entity: 'character', name: '角色A' }),
          makeContext({
            getCurrentBookId: () => 'b1',
            getBookById: () => makeNovel({ characterSettings: [character] }),
          }),
        );
        expect(details).toContainEqual({ label: '性别', value: label });
      }
    });

    it('falls back to raw sex value for unknown mappings', () => {
      const details: ActionDetail[] = [];
      const character = makeCharacter({
        name: '角色A',
        sex: 'nonbinary' as unknown as CharacterSetting['sex'],
      });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'character', name: '角色A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ characterSettings: [character] }),
        }),
      );
      expect(details).toContainEqual({ label: '性别', value: 'nonbinary' });
    });

    it('appends description, speakingStyle, and aliases', () => {
      const details: ActionDetail[] = [];
      const character = makeCharacter({
        name: '角色A',
        description: '外表描述',
        speakingStyle: '温柔',
        aliases: [{ name: '别名1' }, { name: '别名2' }] as Alias[],
      });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'character', name: '角色A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ characterSettings: [character] }),
        }),
      );
      expect(details).toContainEqual({ label: '描述', value: '外表描述' });
      expect(details).toContainEqual({ label: '说话口吻', value: '温柔' });
      expect(details).toContainEqual({ label: '别名', value: '别名1、别名2' });
    });

    it('skips empty aliases array', () => {
      const details: ActionDetail[] = [];
      const character = makeCharacter({ name: '角色A', aliases: [] });
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'character', name: '角色A' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ characterSettings: [character] }),
        }),
      );
      expect(details.find((d) => d.label === '别名')).toBeUndefined();
    });
  });

  describe('unknown entity type', () => {
    it('no-op for non-term/character entity', () => {
      const details: ActionDetail[] = [];
      appendNamedEntityDetails(
        details,
        makeAction({ entity: 'memory' as MessageAction['entity'], name: 'mem1' }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => makeNovel({ terminologies: [], characterSettings: [] }),
        }),
      );
      expect(details).toEqual([]);
    });
  });
});
