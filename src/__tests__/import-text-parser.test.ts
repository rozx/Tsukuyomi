import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import {
  decodeImportText,
  parseImportText,
  parseImportMarkdown,
} from '../services/import/import-text-parser';

describe('导入文本解码', () => {
  it('UTF-8 与 UTF-16 BOM、显式编码正确读取，保留换行', () => {
    expect(
      decodeImportText(
        new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('正文\r\n下一段')]),
      ).text,
    ).toBe('正文\r\n下一段');
    expect(decodeImportText(new Uint8Array([0xff, 0xfe, 0xe5, 0x65, 0x2c, 0x67])).text).toBe(
      '日本',
    );
    expect(decodeImportText(new Uint8Array([0xfe, 0xff, 0x65, 0xe5, 0x67, 0x2c])).text).toBe(
      '日本',
    );
    expect(decodeImportText(new Uint8Array([0xe9]), 'windows-1252').text).toBe('é');
  });

  it('无 BOM 的日文可给出可解释编码候选，乱码、二进制与不支持编码明确失败', () => {
    const japanese = decodeImportText(new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]));
    expect(japanese.text).toBe('日本語');
    expect(japanese.encoding).toBe('shift_jis');
    expect(japanese.warnings.length).toBeGreaterThan(0);
    expect(() => decodeImportText(new Uint8Array([0xff, 0x00, 0x01]))).toThrow('ENCODING_REQUIRED');
    expect(() => decodeImportText(new Uint8Array([0xc3]))).toThrow('ENCODING_REQUIRED');
    expect(() => decodeImportText(new Uint8Array([0x00, 0x00, 0x00]), 'utf-8')).toThrow(
      'BINARY_CONTENT',
    );
    expect(() => decodeImportText(new Uint8Array([65]), 'unknown-encoding')).toThrow(
      'ENCODING_REQUIRED',
    );
    expect(decodeImportText(new Uint8Array()).text).toBe('');
  });

  it('空输入、重复行和单行长文本均保留原始范围，不依赖扩展名', () => {
    expect(parseImportText('')).toEqual([]);
    const source = '重复\r\n\r\n重复\r末行\n';
    const blocks = parseImportText(source);
    expect(blocks.map((b) => source.slice(b.start, b.end)).join('')).toBe(source);
    expect(blocks.map((b) => b.text).join('')).toBe(source);
    expect(blocks.some((b) => b.kind === 'whitespace')).toBe(true);
    const long = '字'.repeat(30000);
    expect(parseImportText(long)).toEqual([{ start: 0, end: 30000, text: long, kind: 'body' }]);
  });
});

describe('Markdown 原文偏移', () => {
  for (const source of [
    '# 标题\r\n\r\n正文😀\r\n',
    '  \r\r> 第一行\r> 第二行\r\r- 项目\r  - 嵌套\r',
    '段落\n\n[ref]: https://example.com\n\n[文字][ref]\n',
    '```html\r\n<script>window.shouldNotRun = true</script>\r\n```\r\n',
    '![图片](https://example.com/tracking.png)\n\n<script>alert(1)</script>',
    '',
  ]) {
    it(`顶层块原文往返：${JSON.stringify(source).slice(0, 36)}`, () => {
      const blocks = parseImportMarkdown(source);
      expect(blocks.map((b) => b.text).join('')).toBe(source);
      expect(blocks.map((b) => source.slice(b.start, b.end)).join('')).toBe(source);
      expect(blocks.every((b, i) => b.start === (blocks[i - 1]?.end ?? 0))).toBe(true);
    });
  }
});
