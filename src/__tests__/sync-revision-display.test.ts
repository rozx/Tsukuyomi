import './setup';
import { describe, expect, it } from 'vitest';
import { getGroupedFiles } from '../components/settings/sync-revision-display';

describe('修订清单按书籍归组', () => {
  it('书籍、正文分组及记忆合为一行，保留全部文件并汇总大小', () => {
    const files = [
      { filename: 'book-b1.json', status: 'modified' as const, size: 100, sizeDiff: 0 },
      { filename: 'chapters-b1_0.json', status: 'modified' as const, size: 300, sizeDiff: 20 },
      { filename: 'chapters-b1_f.json', status: 'modified' as const, size: 500, sizeDiff: -10 },
      { filename: 'memories-b1.json', status: 'modified' as const, size: 50, sizeDiff: 0 },
    ];
    const groups = getGroupedFiles(files, [{ id: 'b1', title: '月之书' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      displayName: '月之书',
      kind: 'book',
      size: 950,
      sizeDiff: 10,
      files: expect.arrayContaining(files.map((file) => expect.objectContaining(file))),
    });
  });

  it('旧布局迁移和删除混合时不误报整本已删除，删除大小从差值中扣除', () => {
    const groups = getGroupedFiles(
      [
        { filename: 'novel-chunk-unknown#0.json', status: 'removed', size: 500 },
        { filename: 'novel-unknown.meta.json', status: 'removed', size: 20 },
        { filename: 'v6-book-unknown.json', status: 'added', size: 100, sizeDiff: 100 },
        {
          filename: 'v6-chapters-chunk-unknown_a_0.json',
          status: 'added',
          size: 200,
          sizeDiff: 200,
        },
        { filename: 'memories-chunk-unknown_0.json', status: 'modified', size: 50, sizeDiff: 0 },
      ],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      displayName: '书籍 unknown',
      status: 'modified',
      size: 350,
      sizeDiff: -220,
    });
    expect(groups[0]?.files).toHaveLength(5);
    expect(groups[0]?.files.find((file) => file.status === 'removed')?.sizeDiff).toBe(-500);
  });

  it('未知大小保持未知；相同大小不等于内容未修改；删除状态来自远端记录', () => {
    const groups = getGroupedFiles(
      [
        { filename: 'book-b1.json', status: 'modified', size: 100, sizeDiff: 0 },
        { filename: 'chapters-b1_f.json', status: 'modified' },
        { filename: 'book-gone.json', status: 'removed', size: 50 },
      ],
      [{ id: 'gone', title: '本地仍有的书' }],
    );
    const missing = groups.find((group) => group.displayName === '书籍 b1');
    expect(missing).toMatchObject({ status: 'modified' });
    expect(missing?.size).toBeUndefined();
    expect(missing?.sizeDiff).toBeUndefined();
    expect(groups.find((group) => group.displayName === '本地仍有的书')).toMatchObject({
      status: 'removed',
      size: 0,
      sizeDiff: -50,
    });
  });

  it('配置文件合并，书籍优先；未知格式保留，空清单安全', () => {
    expect(getGroupedFiles([], [])).toEqual([]);
    const groups = getGroupedFiles(
      [
        'manifest.json',
        'ai-models.json',
        'tsukuyomi-settings.json',
        'cover-history.json',
        'future-layout.json',
        'book-b1.json',
      ].map((filename) => ({ filename, status: 'modified' })),
      [{ id: 'b1', title: '月之书' }],
    );
    expect(groups.map((group) => group.kind)).toEqual(['book', 'settings', 'system', 'other']);
    expect(groups[1]).toMatchObject({ displayName: '应用配置' });
    expect(groups[1]?.files).toHaveLength(3);
    expect(groups[3]?.files[0]?.filename).toBe('future-layout.json');
  });

  it('将权威书库之外的多个旧书籍合并为遗留文件，缺少本地书名的有效书仍正常显示', () => {
    const groups = getGroupedFiles(
      [
        { filename: 'book-active.json', status: 'modified', size: 100 },
        { filename: 'novel-old1.json', status: 'modified', size: 200 },
        { filename: 'memories-old1.json', status: 'modified', size: 20 },
        { filename: 'novel-old2.json', status: 'modified', size: 300 },
        { filename: 'future.json', status: 'modified', size: 10 },
      ],
      [],
      'zh-CN',
      ['active'],
    );
    expect(groups.map((group) => group.kind)).toEqual(['book', 'other', 'legacy']);
    expect(groups[0]?.displayName).toBe('书籍 active');
    expect(groups[2]).toMatchObject({
      displayName: '历史遗留文件',
      description: '不在此修订的恢复书库中 · 3 个文件',
      size: 520,
    });
    expect(groups[2]?.files).toHaveLength(3);
  });

  it('没有权威清单时保持中立；本次删除记录仍保留在书籍变更中', () => {
    const files = [{ filename: 'novel-old.json', status: 'modified' as const }];
    expect(getGroupedFiles(files, [])[0]?.kind).toBe('book');
    expect(getGroupedFiles(files, [], 'zh-CN', [])[0]?.kind).toBe('legacy');
    expect(
      getGroupedFiles([{ filename: 'novel-old.json', status: 'removed' }], [], 'zh-CN', [])[0],
    ).toMatchObject({ kind: 'book', status: 'removed' });
  });
});
