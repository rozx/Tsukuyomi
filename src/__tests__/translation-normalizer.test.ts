// Bun 测试框架提供全局函数，直接使用即可
// 这些函数在运行时由 Bun 提供，无需导入
// 使用函数签名类型避免 import() 类型注解（符合 ESLint 规范）

declare const describe: (name: string, fn: () => void) => void;

declare const test: (name: string, fn: () => void | Promise<void>) => void;

declare const expect: (actual: unknown) => {
  toBe: (expected: unknown) => void;
  toBeNull: () => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
  toEqual: (expected: unknown) => void;
  toThrow: (expected?: unknown) => void;
  toHaveLength: (expected: number) => void;
  toBeGreaterThanOrEqual: (expected: number) => void;
  rejects: {
    toThrow: (expected?: unknown) => Promise<void>;
  };
};

import {
  normalizeTranslationQuotes,
  normalizeTranslationSymbols,
} from 'src/utils/translation-normalizer';

describe('normalizeTranslationQuotes', () => {
  test('应该将半角双引号转换为日语引号', () => {
    expect(normalizeTranslationQuotes('他说"你好"')).toBe('他说「你好」');
    expect(normalizeTranslationQuotes('"测试"内容')).toBe('「测试」内容');
  });

  test('应该将全角双引号转换为日语引号', () => {
    expect(normalizeTranslationQuotes('他说"你好"')).toBe('他说「你好」');
  });

  test('应该将半角单引号转换为日语单引号', () => {
    expect(normalizeTranslationQuotes("他说'你好'")).toBe('他说『你好』');
  });

  test('应该将半角标点转换为全角', () => {
    expect(normalizeTranslationQuotes('你好,世界.')).toBe('你好，世界。');
    expect(normalizeTranslationQuotes('你好?世界!')).toBe('你好？世界！');
    expect(normalizeTranslationQuotes('你好:世界;')).toBe('你好：世界；');
  });

  test('应该处理空字符串和无效输入', () => {
    expect(normalizeTranslationQuotes('')).toBe('');
    expect(normalizeTranslationQuotes(null as unknown as string)).toBe(null);
    expect(normalizeTranslationQuotes(undefined as unknown as string)).toBe(undefined);
  });

  test('应该保留已存在的「」引号，不转换为『』', () => {
    // 「让我做一下心理准备」应该保持不变
    expect(normalizeTranslationQuotes('「让我做一下心理准备」')).toBe('「让我做一下心理准备」');
    // 「「噫——」」应该保持不变（嵌套的「」引号）
    expect(normalizeTranslationQuotes('「「噫——」」')).toBe('「「噫——」」');
    // 多个嵌套的「」引号应该保持不变
    expect(normalizeTranslationQuotes('「「「测试」」」')).toBe('「「「测试」」」');
  });

  test('应该保持单个双引号不变', () => {
    // 单个引号不应该被转换，保持原样
    expect(normalizeTranslationQuotes('"测试')).toBe('"测试');
    expect(normalizeTranslationQuotes('他说"测试')).toBe('他说"测试');
    expect(normalizeTranslationQuotes('测试"')).toBe('测试"');
  });

  test('应该保持奇数个双引号不变', () => {
    // 奇数个引号不应该被转换，保持原样（除了成对的部分）
    expect(normalizeTranslationQuotes('"测试"另一个"')).toBe('「测试」另一个"');
    expect(normalizeTranslationQuotes('"a"b"c"d"')).toBe('「a」b「c」d"');
  });

  test('应该保持单个单引号不变', () => {
    // 单个单引号不应该被转换，保持原样
    expect(normalizeTranslationQuotes("'测试")).toBe("'测试");
    expect(normalizeTranslationQuotes("他说'测试")).toBe("他说'测试");
    expect(normalizeTranslationQuotes("测试'")).toBe("测试'");
  });

  test('应该保持奇数个单引号不变', () => {
    // 奇数个单引号不应该被转换，保持原样（除了成对的部分）
    expect(normalizeTranslationQuotes("'测试'另一个'")).toBe('『测试』另一个\'');
    expect(normalizeTranslationQuotes("'a'b'c'd'")).toBe('『a』b『c』d\'');
  });

  test('应该正确处理混合的单个引号', () => {
    // 单个双引号和单个单引号混合，单个引号应该保持原样
    expect(normalizeTranslationQuotes('他说"测试\'内容')).toBe('他说"测试\'内容');
    // 成对的引号会被转换，单个引号保持原样
    expect(normalizeTranslationQuotes('他说"测试\'内容"')).toBe('他说「测试\'内容」');
  });
});

describe('normalizeTranslationSymbols', () => {
  test('应该规范化引号', () => {
    expect(normalizeTranslationSymbols('他说"你好"')).toBe('他说「你好」');
    expect(normalizeTranslationSymbols("他说'你好'")).toBe('他说『你好』');
  });

  test('应该规范化多个连续空格', () => {
    expect(normalizeTranslationSymbols('你好   世界')).toBe('你好　世界');
    expect(normalizeTranslationSymbols('你好  世界')).toBe('你好　世界');
    expect(normalizeTranslationSymbols('你好 世界')).toBe('你好 世界'); // 单个空格保留
  });

  test('应该规范化破折号', () => {
    expect(normalizeTranslationSymbols('他说—这是测试')).toBe('他说——这是测试');
    expect(normalizeTranslationSymbols('他说–这是测试')).toBe('他说——这是测试');
    expect(normalizeTranslationSymbols('他说——这是测试')).toBe('他说——这是测试'); // 已经是双破折号，保持不变
  });

  test('应该规范化省略号', () => {
    expect(normalizeTranslationSymbols('他说……')).toBe('他说……'); // 多个省略号不合并
    expect(normalizeTranslationSymbols('他说....')).toBe('他说…');
    expect(normalizeTranslationSymbols('他说.....')).toBe('他说…');
  });

  test('应该规范化书名号', () => {
    expect(normalizeTranslationSymbols('他读了<书名>')).toBe('他读了《书名》');
    expect(normalizeTranslationSymbols('他读了＜书名＞')).toBe('他读了《书名》');
  });

  test('应该规范化数字后的句号', () => {
    expect(normalizeTranslationSymbols('这是第1. 个测试')).toBe('这是第1。 个测试');
    expect(normalizeTranslationSymbols('这是第1.')).toBe('这是第1。');
    expect(normalizeTranslationSymbols('这是1.5')).toBe('这是1.5'); // 小数点不应转换
    expect(normalizeTranslationSymbols('这是1.5和2.0')).toBe('这是1.5和2.0'); // 小数点不应转换
  });

  test('应该移除括号内的多余空格', () => {
    expect(normalizeTranslationSymbols('他说（ 你好 ）')).toBe('他说（你好）');
    expect(normalizeTranslationSymbols('他说【 测试 】')).toBe('他说【测试】');
  });

  test('应该移除引号内的多余空格', () => {
    expect(normalizeTranslationSymbols('他说「 你好 」')).toBe('他说「你好」');
    expect(normalizeTranslationSymbols('他说『 测试 』')).toBe('他说『测试』');
  });

  test('应该规范化行尾标点', () => {
    expect(normalizeTranslationSymbols('你好，  ')).toBe('你好，');
    expect(normalizeTranslationSymbols('你好。  \n')).toBe('你好。\n');
    expect(normalizeTranslationSymbols('你好？  \n测试')).toBe('你好？\n测试');
  });

  test('应该综合处理多种符号', () => {
    const input = '他说"你好",这是测试. 还有—破折号...';
    const expected = '他说「你好」，这是测试。 还有——破折号…';
    expect(normalizeTranslationSymbols(input)).toBe(expected);
  });

  test('应该处理空字符串和无效输入', () => {
    expect(normalizeTranslationSymbols('')).toBe('');
    expect(normalizeTranslationSymbols(null as unknown as string)).toBe(null);
    expect(normalizeTranslationSymbols(undefined as unknown as string)).toBe(undefined);
  });

  test('应该处理只包含空格的字符串', () => {
    expect(normalizeTranslationSymbols('   ')).toBe('　');
    expect(normalizeTranslationSymbols('  ')).toBe('　');
    expect(normalizeTranslationSymbols(' ')).toBe(' '); // 单个空格保留
  });

  test('应该处理混合的引号类型', () => {
    expect(normalizeTranslationSymbols('"外引号"和\'内引号\'')).toBe('「外引号」和『内引号』');
  });

  test('应该处理复杂的标点组合', () => {
    const input = '他说："这是测试（内容）[注释]...';
    const result = normalizeTranslationSymbols(input);
    expect(result.includes('：')).toBe(true);
    expect(result.includes('（')).toBe(true);
    expect(result.includes('）')).toBe(true);
    expect(result.includes('【')).toBe(true);
    expect(result.includes('】')).toBe(true);
  });

  test('应该处理全角半角混合的标点', () => {
    expect(normalizeTranslationSymbols('你好,世界。')).toBe('你好，世界。');
    expect(normalizeTranslationSymbols('你好，world.')).toBe('你好，world。');
  });

  test('应该处理多个连续破折号', () => {
    expect(normalizeTranslationSymbols('他说———')).toBe('他说——'); // 多个破折号应该被处理
  });

  test('应该处理书名号中的内容', () => {
    expect(normalizeTranslationSymbols('他读了<测试书名>')).toBe('他读了《测试书名》');
    expect(normalizeTranslationSymbols('他读了<测试 书名>')).toBe('他读了《测试 书名》'); // 书名号内的单个空格保留
  });

  test('应该处理引号嵌套', () => {
    expect(normalizeTranslationSymbols('他说"这是\'嵌套\'的引号"')).toBe('他说「这是『嵌套』的引号」');
  });

  test('应该处理行尾的多种标点', () => {
    expect(normalizeTranslationSymbols('测试，  \n测试。  \n测试？  ')).toBe('测试，\n测试。\n测试？');
  });

  test('应该处理数字和标点的边界情况', () => {
    expect(normalizeTranslationSymbols('第1. 个')).toBe('第1。 个');
    expect(normalizeTranslationSymbols('第1.')).toBe('第1。');
    expect(normalizeTranslationSymbols('1.5 和 2.0')).toBe('1.5 和 2.0'); // 小数点不应转换
  });

  test('应该修复不匹配的引号对', () => {
    // 两个开引号应该修复为一个开引号和一个闭引号（多个省略号不合并）
    expect(normalizeTranslationSymbols('「………………嗯？「')).toBe('「………………嗯？」');
    // 两个闭引号应该修复为一个开引号和一个闭引号
    expect(normalizeTranslationSymbols('」………………嗯？」')).toBe('「………………嗯？」');
    // 单引号的不匹配
    expect(normalizeTranslationSymbols('『………………嗯？『')).toBe('『………………嗯？』');
    expect(normalizeTranslationSymbols('』………………嗯？』')).toBe('『………………嗯？』');
  });

  test('应该保留已存在的「」引号，不转换为『』', () => {
    // 「让我做一下心理准备」应该保持不变
    expect(normalizeTranslationSymbols('「让我做一下心理准备」')).toBe('「让我做一下心理准备」');
    // 「「噫——」」应该保持不变（嵌套的「」引号）
    expect(normalizeTranslationSymbols('「「噫——」」')).toBe('「「噫——」」');
    // 多个嵌套的「」引号应该保持不变
    expect(normalizeTranslationSymbols('「「「测试」」」')).toBe('「「「测试」」」');
    // 混合情况：外层的「」应该保持不变，内层的半角引号应该转换
    expect(normalizeTranslationSymbols('「让我做一下心理准备"test"」')).toBe('「让我做一下心理准备「test」」');
    // 确保「」引号不会被转换为『』，即使与其他引号混合
    expect(normalizeTranslationSymbols('「让我做一下心理准备」和"其他内容"')).toBe('「让我做一下心理准备」和「其他内容」');
  });
});

