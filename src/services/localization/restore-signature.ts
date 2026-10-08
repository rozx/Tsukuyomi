import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const PREFIX = 'sha256:';
const CHUNK_SIZE = 64 * 1024;
const encoder = new TextEncoder();
type Digest = ReturnType<typeof sha256.create>;

/** 分段编码；不能在 UTF-16 代理对中间切开，否则摘要会随分块边界改变。 */
function updateText(digest: Digest, text: string): void {
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    digest.update(encoder.encode(text.slice(start, end)));
    start = end;
  }
}

function isOmitted(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

/** JSON 对象会先枚举整数索引，再枚举其余键；与 canonicalStringify 的字节顺序一致。 */
function orderedKeys(value: object): string[] {
  const sorted = Object.keys(value).sort();
  return Object.keys(Object.fromEntries(sorted.map((key) => [key, null])));
}

type Write = (text: string) => void;

function writeObject(value: Record<string, unknown>, write: Write): void {
  write('{');
  let first = true;
  for (const key of orderedKeys(value)) {
    const child = value[key];
    if (isOmitted(child)) continue;
    if (!first) write(',');
    first = false;
    write(JSON.stringify(key));
    write(':');
    writeValue(child, write);
  }
  write('}');
}

/** 恢复数据是可持久化的 JSON DTO（允许 Date），不复制整棵对象树。 */
function writeValue(value: unknown, write: Write): void {
  if (value instanceof Date) {
    write(JSON.stringify(value.toISOString()));
  } else if (Array.isArray(value)) {
    write('[');
    for (let index = 0; index < value.length; index++) {
      if (index) write(',');
      const child: unknown = value[index];
      if (isOmitted(child)) write('null');
      else writeValue(child, write);
    }
    write(']');
  } else if (value !== null && typeof value === 'object') {
    writeObject(value as Record<string, unknown>, write);
  } else {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) write(serialized);
  }
}

/** 固定长度的恢复签名；缓冲区只持有少量 JSON 片段，不保留全库 JSON 或 UTF-8 副本。 */
export function createRestoreSignature(value: unknown): string {
  const digest = sha256.create();
  let fragments: string[] = [];
  let size = 0;
  const flush = () => {
    updateText(digest, fragments.join(''));
    fragments = [];
    size = 0;
  };
  writeValue(value, (text) => {
    fragments.push(text);
    size += text.length;
    if (size >= CHUNK_SIZE) flush();
  });
  flush();
  return PREFIX + bytesToHex(digest.digest());
}

/** 旧版本回执保存规范 JSON 原文；就地分块摘要，兼容原操作 ID 的重试。 */
export function restoreSignaturesMatch(stored: string, expected: string): boolean {
  if (stored === expected) return true;
  if (stored.startsWith(PREFIX) || !expected.startsWith(PREFIX)) return false;
  const digest = sha256.create();
  updateText(digest, stored);
  return PREFIX + bytesToHex(digest.digest()) === expected;
}
