import { describe, expect, it } from 'vitest';
import './setup';
import type { Novel, Paragraph, Translation } from '../models/novel';
import type { SyncRevision } from '../models/localized-data';
import { applyParagraphTranslationEdits } from '../services/localization/paragraph-edit';
import type { ParagraphTranslationEdit } from '../services/localization/paragraph-edit';
import { mergeParagraphLanguageState } from '../services/localization/merge';
import { normalizeParagraphLanguages } from '../services/localization/normalize';
import { collectParagraphRevisions } from '../services/localization/entity-edit';
import { replaceBookLanguageSlots } from '../services/localization/book-slots';
import { canonicalStringify } from '../utils/canonical-json';
import { stripNovelLocalFields } from '../utils/sync-strip';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';

const DAY = 24 * 60 * 60 * 1000;
const rev = (counter: number, actorId = 'a'): SyncRevision => ({ counter, actorId });
const en = (id: string, text = id): Translation => ({
  id,
  translation: text,
  aiModelId: '',
  language: 'en-US',
});

/** 两台设备分叉前的共同状态：英文 e1、e2 两个版本，选用 e2。 */
function base(): Paragraph {
  return {
    id: 'p',
    text: '原文',
    selectedTranslationId: '',
    translations: [en('e1'), en('e2')],
    selectedTranslations: { 'en-US': { value: 'e2', revision: rev(1, 'base'), updatedAt: 1 } },
  };
}

function edit(
  paragraph: Paragraph,
  edits: (
    | { type: 'remove'; translationId: string }
    | { type: 'append'; translation: Translation; selectNew?: boolean }
    | { type: 'select'; translationId: string | null }
    | {
        type: 'restore-language';
        translations: Translation[];
        selectedTranslationId: string | null;
      }
  )[],
  revision: SyncRevision,
  updatedAt = 10,
): Paragraph {
  return applyParagraphTranslationEdits(
    [paragraph],
    'en-US',
    edits.map(
      (value) => ({ ...value, paragraphId: 'p', originalText: '原文' }) as ParagraphTranslationEdit,
    ),
    revision,
    updatedAt,
  )[0]!;
}

const ids = (paragraph: Paragraph) => paragraph.translations.map((value) => value.id);

/** 两个方向合并结果必须逐字一致，并且能通过规范化校验（可再次加载）。 */
function mergeBoth(a: Paragraph, b: Paragraph): Paragraph {
  const ab = mergeParagraphLanguageState(a, b);
  const ba = mergeParagraphLanguageState(b, a);
  expect(canonicalStringify(ab)).toBe(canonicalStringify(ba));
  expect(canonicalStringify(normalizeParagraphLanguages(ab))).toBe(canonicalStringify(ab));
  return ab;
}

describe('译文版本删除记录：合并', () => {
  it('删除未选用的版本，与仍持有该版本的设备双向合并后保持删除', () => {
    const a = edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(2));
    expect(a.deletedTranslations?.e1?.revision).toEqual(rev(2));
    const merged = mergeBoth(a, base());
    expect(ids(merged)).toEqual(['e2']);
    expect(merged.deletedTranslations?.e1).toBeDefined();
  });

  it('删除当前选用版本时，选用回退且删除在合并后同样保持', () => {
    const a = edit(base(), [{ type: 'remove', translationId: 'e2' }], rev(2));
    const merged = mergeBoth(a, base());
    expect(ids(merged)).toEqual(['e1']);
    expect(merged.selectedTranslations?.['en-US']?.value).toBe('e1');
  });

  it('历史上限逐出的旧版本，与仍持有旧版本的设备合并后不会回来', () => {
    let a = base();
    for (let i = 3; i <= 6; i++)
      a = edit(a, [{ type: 'append', translation: en(`e${i}`) }], rev(i));
    expect(ids(a)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6']);
    expect(a.deletedTranslations?.e1?.revision).toEqual(rev(6));
    const merged = mergeBoth(a, base());
    expect(ids(merged)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it('删除后撤销（以更新的 revision 恢复）的版本，与另一设备合并后仍然存在', () => {
    const deleted = edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(2));
    const undone = edit(
      deleted,
      [
        {
          type: 'restore-language',
          translations: [en('e1'), en('e2')],
          selectedTranslationId: 'e2',
        },
      ],
      rev(3),
    );
    expect(undone.deletedTranslations?.e1).toBeUndefined();
    expect(undone.translations.find((value) => value.id === 'e1')?.revision).toEqual(rev(3));
    // 另一设备只见过删除（同步了删除后的状态），或仍是分叉前的旧副本
    for (const other of [deleted, base()]) expect(ids(mergeBoth(undone, other))).toContain('e1');
  });

  it('撤销新增（restore-language 去掉的版本）同样写入删除记录，合并后不复活', () => {
    const appended = edit(base(), [{ type: 'append', translation: en('e3') }], rev(2));
    const undone = edit(
      appended,
      [
        {
          type: 'restore-language',
          translations: [en('e1'), en('e2')],
          selectedTranslationId: 'e2',
        },
      ],
      rev(3),
    );
    expect(undone.deletedTranslations?.e3?.revision).toEqual(rev(3));
    expect(ids(mergeBoth(undone, appended))).toEqual(['e1', 'e2']);
  });

  it('另一设备在删除之后选用了该版本时保留该版本，不留下悬空选用', () => {
    const a = edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(2));
    const b = edit(base(), [{ type: 'select', translationId: 'e1' }], rev(3, 'b'));
    const merged = mergeBoth(a, b);
    expect(merged.selectedTranslations?.['en-US']?.value).toBe('e1');
    expect(ids(merged)).toContain('e1');
    expect(merged.deletedTranslations?.e1).toBeUndefined();
  });

  it('同一版本的两条删除记录取 revision 较新者，结果与方向无关', () => {
    const a = edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(2, 'a'));
    const b = edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(4, 'b'), 20);
    const merged = mergeBoth(a, b);
    expect(merged.deletedTranslations?.e1).toEqual({ revision: rev(4, 'b'), deletedAt: 20 });
  });

  it('删除记录早于段落最近活动 90 天以上时被清理，较新的记录保留', () => {
    const old = edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(2), 1000);
    const later = edit(old, [{ type: 'remove', translationId: 'e2' }], rev(3), 1000 + 91 * DAY);
    expect(Object.keys(later.deletedTranslations ?? {})).toEqual(['e2']);
    const recent = edit(old, [{ type: 'remove', translationId: 'e2' }], rev(3), 1000 + 89 * DAY);
    expect(Object.keys(recent.deletedTranslations ?? {})).toEqual(['e1', 'e2']);
  });
});

describe('译文版本删除记录：规范化与时钟', () => {
  it('旧数据没有删除记录时不添加该字段', () => {
    expect('deletedTranslations' in normalizeParagraphLanguages(base())).toBe(false);
  });

  it('拒绝格式错误的删除记录', () => {
    const bad = [
      { e9: { revision: rev(1), deletedAt: -1 } },
      { e9: { revision: { counter: -1, actorId: 'a' }, deletedAt: 1 } },
      { '': { revision: rev(1), deletedAt: 1 } },
      [],
    ];
    for (const records of bad)
      expect(() =>
        normalizeParagraphLanguages({
          ...base(),
          deletedTranslations: records as unknown as NonNullable<Paragraph['deletedTranslations']>,
        }),
      ).toThrow('INVALID_TRANSLATION_DELETION');
  });

  it('未升级客户端把已删除版本按旧规则合并回来（副本与记录并存）时，按合并规则裁决而不拒绝加载', () => {
    const record = { revision: rev(2), deletedAt: 1 };
    // 未修改过的旧副本输给删除记录
    const stale = normalizeParagraphLanguages({ ...base(), deletedTranslations: { e1: record } });
    expect(ids(stale)).toEqual(['e2']);
    expect(stale.deletedTranslations?.e1).toEqual(record);
    // revision 更新的副本、仍被选用的版本保留，记录撤销
    const newer = normalizeParagraphLanguages({
      ...base(),
      translations: [{ ...en('e1'), revision: rev(3) }, en('e2')],
      deletedTranslations: { e1: record },
    });
    expect(ids(newer)).toEqual(['e1', 'e2']);
    expect('deletedTranslations' in newer).toBe(false);
    const selected = normalizeParagraphLanguages({
      ...base(),
      deletedTranslations: { e2: record },
    });
    expect(ids(selected)).toEqual(['e1', 'e2']);
    expect('deletedTranslations' in selected).toBe(false);
  });

  it('删除记录的 revision 交给同步时钟观察', () => {
    const a = edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(7));
    expect(collectParagraphRevisions([{ ...a, selectedTranslations: {} }])).toContainEqual(rev(7));
  });
});

function book(paragraph: Paragraph): Novel {
  return {
    id: 'b',
    title: '书',
    targetLanguage: 'en-US',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v',
        title: '卷',
        chapters: [
          {
            id: 'c',
            title: '章',
            createdAt: new Date(0),
            lastEdited: new Date(0),
            content: [paragraph],
          },
        ],
      },
    ],
  };
}
const para = (value: Novel) => value.volumes![0]!.chapters![0]!.content![0]!;

describe('译文版本删除记录：强制覆盖 / 快照恢复', () => {
  it('覆盖时另一侧独有的版本写入删除记录，保留的版本压过另一侧的删除记录', () => {
    const local = book({ ...base(), translations: [en('e1')], selectedTranslations: {} });
    const remote = book(
      edit(
        edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(2)),
        [{ type: 'append', translation: en('e3') }],
        rev(3),
      ),
    );
    replaceBookLanguageSlots(local, remote, rev(9, 'me'), 50);
    expect(para(local).deletedTranslations?.e3).toEqual({ revision: rev(9, 'me'), deletedAt: 50 });
    expect(para(local).deletedTranslations?.e2).toEqual({ revision: rev(9, 'me'), deletedAt: 50 });
    expect(para(local).translations[0]!.revision).toEqual(rev(9, 'me'));
    expect(ids(mergeBoth(para(local), para(remote)))).toEqual(['e1']);
  });

  it('覆盖时保留对端已有的删除记录，第三台仍持有旧版本的设备合并后不会复活', () => {
    const local = book({ ...base(), translations: [en('e2')], selectedTranslations: {} });
    const remote = book(edit(base(), [{ type: 'remove', translationId: 'e1' }], rev(2)));
    replaceBookLanguageSlots(local, remote, rev(9, 'me'), 50);
    expect(para(local).deletedTranslations?.e1?.revision).toEqual(rev(2));
    expect(ids(mergeBoth(para(local), base()))).toEqual(['e2']);
  });
});

describe('译文版本删除记录：与 Object.prototype 同名的版本 ID', () => {
  it('删除 ID 为 constructor / toString / __proto__ 的版本同样写入记录并在合并后保持删除', () => {
    for (const id of ['constructor', 'toString', '__proto__']) {
      const start: Paragraph = { ...base(), translations: [en(id), en('e2')] };
      const deleted = edit(start, [{ type: 'remove', translationId: id }], rev(2));
      expect(Object.hasOwn(deleted.deletedTranslations ?? {}, id)).toBe(true);
      const roundTrip = JSON.parse(canonicalStringify(deleted)) as Paragraph;
      expect(ids(mergeBoth(roundTrip, start))).toEqual(['e2']);
      // 没有该 ID 记录的段落不会把继承属性误当成删除记录
      expect(ids(mergeBoth(start, base()))).toContain(id);
    }
  });
});

describe('译文版本删除记录：持久化与同步序列化', () => {
  it('删除记录随章节正文保存、重新加载，并保留在同步上传的数据中', async () => {
    await BookService.saveBook({ ...book(base()), id: 'del-book' });
    await BookService.editParagraphTranslations('del-book', 'c', 'en-US', [
      { type: 'remove', paragraphId: 'p', originalText: '原文', translationId: 'e1' },
    ]);
    const [saved] = (await ChapterContentService.loadChapterContent('c'))!;
    expect(ids(saved!)).toEqual(['e2']);
    expect(saved!.deletedTranslations?.e1?.revision.counter).toBeGreaterThan(0);
    const uploaded = JSON.parse(canonicalStringify(stripNovelLocalFields(book(saved!)))) as Novel;
    expect(para(uploaded).deletedTranslations).toEqual(saved!.deletedTranslations);
    expect(ids(mergeBoth(para(uploaded), base()))).toEqual(['e2']);
  });
});
