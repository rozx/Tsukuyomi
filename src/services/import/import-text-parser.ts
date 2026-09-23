import { marked } from 'marked';
import type { ImportTextBlock } from 'src/models/import';

type ParsedBlock = Omit<ImportTextBlock, 'id'>;

function decode(bytes: Uint8Array, encoding: string): string {
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  // eslint-disable-next-line no-control-regex -- 此处有意检测二进制控制字符，不能把它们作为小说正文。
  if (/[\u0000-\u0008\u000e-\u001f\u007f]/u.test(text))
    throw new Error('BINARY_CONTENT: 内容包含二进制控制字符');
  return text;
}

/** 不根据扩展名拒绝输入；编码不确定时要求用户指定，绝不让模型修复乱码。 */
export function decodeImportText(
  bytes: Uint8Array,
  explicitEncoding?: string,
): {
  text: string;
  encoding: string;
  bomBytes: number;
  warnings: string[];
} {
  let encoding = explicitEncoding;
  let bomBytes = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = 'utf-8';
    bomBytes = 3;
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le';
    bomBytes = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be';
    bomBytes = 2;
  }
  if (encoding) {
    try {
      return {
        text: decode(bytes, encoding),
        encoding: new TextDecoder(encoding).encoding,
        bomBytes,
        warnings: [],
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('BINARY_CONTENT')) throw error;
      throw new Error(`ENCODING_REQUIRED: 无法按 ${encoding} 解码，请检查编码或文件完整性`);
    }
  }
  try {
    return { text: decode(bytes, 'utf-8'), encoding: 'utf-8', bomBytes: 0, warnings: [] };
  } catch {
    const candidates: { text: string; encoding: string }[] = [];
    for (const label of ['shift_jis', 'euc-jp']) {
      try {
        const text = decode(bytes, label);
        const meaningful = text.replace(/\s/gu, '');
        const japanese = meaningful.match(/[\u3040-\u30ff\u3400-\u9fff]/gu)?.length ?? 0;
        if (japanese > 0 && japanese / Math.max(meaningful.length, 1) >= 0.3)
          candidates.push({ text, encoding: label });
      } catch {
        /* 尝试下一个已知日文编码，不接受有替代字符的容错解码。 */
      }
    }
    if (candidates.length === 1)
      return {
        ...candidates[0]!,
        bomBytes: 0,
        warnings: ['UTF-8 解码失败，按唯一可读的日文编码候选解码；请检查预览。'],
      };
    throw new Error('ENCODING_REQUIRED: 无法可靠判断文本编码，请指定编码或提供可读文件');
  }
}

export function parseImportText(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (const match of text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!match[0]) continue;
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      kind: match[0].trim() ? 'body' : 'whitespace',
    });
  }
  return blocks;
}

/** 每个规范化 UTF-16 边界对应原文边界，CRLF 不会造成之后所有范围偏移。 */
function normalizeMarkdown(text: string): { normalized: string; offsets: number[] } {
  let normalized = '';
  const offsets = [0];
  for (let index = 0; index < text.length; ) {
    const char = text[index]!;
    if (char === '\r') {
      normalized += '\n';
      index += text[index + 1] === '\n' ? 2 : 1;
    } else {
      normalized += char;
      index += 1;
    }
    offsets.push(index);
  }
  return { normalized, offsets };
}

export function parseImportMarkdown(text: string): ParsedBlock[] {
  const { normalized, offsets } = normalizeMarkdown(text);
  const blocks: ParsedBlock[] = [];
  let position = 0;
  // 只处理顶层 token，避免嵌套列表或引用块重复计算原文。
  for (const token of marked.lexer(normalized)) {
    if (!token.raw || normalized.slice(position, position + token.raw.length) !== token.raw)
      throw new Error('MARKDOWN_POSITION: 无法核对 Markdown 原文位置');
    const start = offsets[position]!;
    position += token.raw.length;
    const end = offsets[position]!;
    const kind =
      token.type === 'heading'
        ? 'heading'
        : token.type === 'def'
          ? 'metadata'
          : token.type === 'space'
            ? 'whitespace'
            : 'body';
    blocks.push({
      start,
      end,
      text: text.slice(start, end),
      kind,
      ...(token.type === 'heading' ? { headingLevel: token.depth, headingTitle: token.text } : {}),
    });
  }
  if (position !== normalized.length)
    throw new Error('MARKDOWN_POSITION: Markdown 块没有覆盖完整原文');
  return blocks;
}
