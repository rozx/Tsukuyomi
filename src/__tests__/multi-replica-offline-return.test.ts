import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Novel } from '../models/novel';
import { normalizeBookLanguages } from '../services/localization/normalize';
import { setNameTranslation } from '../services/localization/selection';
import { entityKey } from '../services/localization/entity-identity';
import { mergeBookEntityState } from '../services/localization/entities';

const DAY = 24 * 60 * 60 * 1000;

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
      {
        id: 'd',
        name: 'Bob',
        sex: undefined,
        translation: { id: 'cn-d', translation: '鲍勃', aiModelId: 'm' },
        aliases: [],
      },
    ],
  });
}

function merge(a: Novel, b: Novel): Novel {
  return { ...base(), ...mergeBookEntityState(a, b) };
}

/** 三个副本的全部到达顺序（左折叠） */
function allOrders(replicas: Novel[]): Novel[] {
  const orders: Novel[][] = [];
  const permute = (rest: Novel[], acc: Novel[]) => {
    if (rest.length === 0) orders.push(acc);
    rest.forEach((item, index) =>
      permute([...rest.slice(0, index), ...rest.slice(index + 1)], [...acc, item]),
    );
  };
  permute(replicas, []);
  return orders.map((order) => order.slice(1).reduce(merge, order[0]!));
}

afterEach(() => vi.useRealTimers());

describe('三副本：时钟偏移与超过 90 天的离线回流', () => {
  it('删除优先、各语言译名分别保留，所有到达顺序结果一致且不受墙上时钟影响', () => {
    const now = Date.UTC(2026, 8, 30);
    // A：删除角色 c（墙上时钟正常）
    const a = base();
    a.characterSettings = a.characterSettings!.filter((character) => character.id !== 'c');
    a.entityTombstones![entityKey('character', 'c')] = {
      kind: 'character',
      id: 'c',
      revision: { counter: 5, actorId: 'A' },
      deletedAt: now,
    };
    // B：墙上时钟快一年，给 c 的别名改名，并为 d 新增英文译名
    const b = base();
    const alias = b.characterSettings![0]!.aliases[0]!;
    alias.name = 'Skewed rename';
    alias.fieldRevisions!.name = { counter: 50, actorId: 'B' };
    b.characterSettings![1] = setNameTranslation(
      b.characterSettings![1]!,
      'en-US',
      { id: 'en-d', translation: 'Bob', aiModelId: 'm' },
      { counter: 6, actorId: 'B' },
      now + 365 * DAY,
    );
    // C：离线 91 天前的旧副本，回流时带着对 c 的改名和 d 的繁中译名
    const c = base();
    c.characterSettings![0]!.name = 'Offline rename';
    c.characterSettings![0]!.fieldRevisions!.name = { counter: 99, actorId: 'C' };
    c.characterSettings![1] = setNameTranslation(
      c.characterSettings![1]!,
      'zh-TW',
      { id: 'tw-d', translation: '鮑勃', aiModelId: 'm' },
      { counter: 7, actorId: 'C' },
      now - 91 * DAY,
    );

    // 合并发生在删除 91 天之后：书内删除记录不按 90 天过期
    vi.useFakeTimers();
    vi.setSystemTime(now + 91 * DAY);
    const results = allOrders([a, b, c]);

    for (const result of results) expect(result).toEqual(results[0]);
    const merged = results[0]!;
    expect(merged.characterSettings!.map((character) => character.id)).toEqual(['d']);
    expect(merged.entityTombstones![entityKey('character', 'c')]).toBeDefined();
    const bob = merged.characterSettings![0]!;
    expect(bob.translationsByLanguage?.['en-US']?.value?.translation).toBe('Bob');
    expect(bob.translationsByLanguage?.['zh-TW']?.value?.translation).toBe('鮑勃');
    expect(bob.translationsByLanguage?.['zh-CN']?.value?.translation).toBe('鲍勃');

    // 系统时间再改变（另一台设备时钟偏移）不影响合并结果
    vi.setSystemTime(now - 30 * DAY);
    expect(merge(merge(c, a), b)).toEqual(merged);
  });
});
