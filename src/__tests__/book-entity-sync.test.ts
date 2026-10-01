import './setup';
import { describe, expect, it } from 'bun:test';
import type { Novel } from '../models/novel';
import { normalizeBookLanguages } from '../services/localization/normalize';
import { setNameTranslation } from '../services/localization/selection';
import { entityKey } from '../services/localization/entity-identity';
import { mergeBookEntityState } from '../services/localization/entities';

function base(): Novel {
  return normalizeBookLanguages({
    id: 'b',
    title: 'Book',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    characterSettings: [
      {
        id: 'c',
        name: 'Alice',
        sex: undefined,
        translation: { id: 'cn-c', translation: '爱丽丝', aiModelId: 'm' },
        aliases: [
          {
            id: 'alias',
            name: 'Al',
            translation: { id: 'cn-a', translation: '小爱', aiModelId: 'm' },
          },
        ],
      },
    ],
  });
}
function merge(a: Novel, b: Novel): Novel {
  return { ...base(), ...mergeBookEntityState(a, b) };
}

describe('书内实体的删除优先同步', () => {
  it('同一别名改名和另一设备新增英文译名可同时保留', () => {
    const a = base();
    const b = base();
    const alias = a.characterSettings![0]!.aliases[0]!;
    alias.name = 'New name';
    alias.fieldRevisions!.name = { counter: 2, actorId: 'A' };
    b.characterSettings![0]!.aliases[0] = setNameTranslation(
      b.characterSettings![0]!.aliases[0]!,
      'en-US',
      { id: 'en-a', translation: 'Al', aiModelId: 'm' },
      { counter: 3, actorId: 'B' },
      10,
    );
    const result = merge(a, b).characterSettings![0]!.aliases[0]!;
    expect(result.id).toBe('alias');
    expect(result.name).toBe('New name');
    expect(result.translationsByLanguage?.['en-US']?.value?.translation).toBe('Al');
    expect(merge(a, b)).toEqual(merge(b, a));
  });

  it('删除压过任何迟到编辑，三副本合并满足交换、结合与幂等', () => {
    const a = base();
    const b = base();
    const c = base();
    a.characterSettings![0]!.aliases = [];
    a.entityTombstones![entityKey('alias', 'alias', 'c')] = {
      kind: 'alias',
      id: 'alias',
      parentId: 'c',
      revision: { counter: 1, actorId: 'A' },
      deletedAt: 1,
    };
    const alias = b.characterSettings![0]!.aliases[0]!;
    alias.name = 'Late edit';
    alias.fieldRevisions!.name = { counter: 999, actorId: 'B' };
    expect(merge(a, b).characterSettings![0]!.aliases).toEqual([]);
    expect(merge(a, b)).toEqual(merge(b, a));
    expect(merge(a, a)).toEqual(merge(merge(a, a), a));
    expect(merge(merge(a, b), c)).toEqual(merge(a, merge(b, c)));
  });
});

it('描述、口吻和不同语言译名分别合并，三副本任意到达顺序哈希一致', () => {
  const a = base();
  const b = base();
  const c = base();
  a.characterSettings![0]!.description = 'Description';
  a.characterSettings![0]!.fieldRevisions!.description = { counter: 5, actorId: 'A' };
  b.characterSettings![0]!.speakingStyle = 'Style';
  b.characterSettings![0]!.fieldRevisions!.speakingStyle = { counter: 5, actorId: 'B' };
  b.characterSettings![0] = setNameTranslation(
    b.characterSettings![0]!,
    'en-US',
    { id: 'en', translation: 'Alice', aiModelId: 'm' },
    { counter: 6, actorId: 'B' },
    1,
  );
  c.characterSettings![0] = setNameTranslation(
    c.characterSettings![0]!,
    'zh-TW',
    { id: 'tw', translation: '愛麗絲', aiModelId: 'm' },
    { counter: 6, actorId: 'C' },
    2,
  );
  const result = merge(merge(a, b), c);
  for (const [x, y, z] of [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ]) {
    expect(merge(merge(x!, y!), z!)).toEqual(result);
    expect(merge(x!, merge(y!, z!))).toEqual(result);
  }
  expect(result.characterSettings![0]).toMatchObject({
    description: 'Description',
    speakingStyle: 'Style',
  });
});
