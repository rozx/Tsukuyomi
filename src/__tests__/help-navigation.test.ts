import { describe, expect, it } from 'bun:test';
import { resolveHelpDocumentByHref } from 'src/utils/help-navigation';

describe('help navigation utils', () => {
  const docs = [
    { id: 'front-page', file: 'front-page.md' },
    { id: 'release-notes', file: 'release-notes.md' },
  ];

  it('应支持通过文档 id 解析内部链接', () => {
    const matched = resolveHelpDocumentByHref(docs, './front-page.md');
    expect(matched?.id).toBe('front-page');
  });

  it('应支持通过文件名解析内部链接', () => {
    const matched = resolveHelpDocumentByHref(docs, './release-notes.md');
    expect(matched?.file).toBe('release-notes.md');
  });

  it('找不到时返回 null', () => {
    const matched = resolveHelpDocumentByHref(docs, './not-exist.md');
    expect(matched).toBeNull();
  });
});
