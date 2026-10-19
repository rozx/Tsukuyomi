import { describe, expect, it } from 'vitest';
import { getFileInfo } from 'prettier';

/** 与 `bun run format` 相同的忽略规则：Prettier 3 默认读取 .gitignore 与 .prettierignore。 */
const isIgnored = async (path: string) =>
  (await getFileInfo(path, { ignorePath: ['.gitignore', '.prettierignore'] })).ignored;

describe('格式化不会改写字节敏感文件', () => {
  it.each([
    // 爬虫测试按字节长度断言，重排 HTML 会让结果失真
    'src/__tests__/examplePages/ncode-n2032iz-p1.html',
    'src/__tests__/examplePages/firecrawl/ncode-n2032iz-chapter-1.html',
    'src/__tests__/exampleChapterData/sample.json',
    // 由脚本生成，必须保持脚本写出的紧凑格式
    'src/services/ai/model-limits/catalog.json',
    '.fallow-baseline.json',
  ])('%s 被忽略', async (path) => {
    expect(await isIgnored(path)).toBe(true);
  });

  it('普通源码仍会被格式化', async () => {
    expect(await isIgnored('src/services/ai/providers/ai-sdk/model.ts')).toBe(false);
  });
});
