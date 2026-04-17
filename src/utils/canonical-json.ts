import { serializeDates } from 'src/utils/serialize-dates';

/**
 * 将任意值转换为「规范形式」：
 * - 对象键按字典序排序（保证 JSON.stringify 输出字节稳定）
 * - 丢弃 undefined 值（JSON.stringify 默认就会丢弃，这里显式跳过以避免空位）
 * - 数组顺序保留（调用方负责在数组语义允许时主动排序，例如按 id）
 *
 * 结合 `serializeDates` 将 Date → ISO 字符串后使用，保证同步路径的
 * 哈希输入与上传字节在所有设备上完全一致。
 */
function toCanonicalForm(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(toCanonicalForm);
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const result: Record<string, unknown> = {};
    for (const [key, v] of entries) {
      if (v === undefined) continue;
      result[key] = toCanonicalForm(v);
    }
    return result;
  }
  return value;
}

/**
 * 把传入值序列化为「规范 JSON」字符串：
 * 先 serializeDates（Date → ISO），再对所有对象键按字典序排序后 JSON.stringify。
 *
 * 调用场景：
 * 1. 计算 manifest entry 的 SHA-256 哈希输入
 * 2. 上传到 Gist 的文件内容（压缩前的原始 JSON）
 *
 * 这两处都必须产出相同字节序列，才能保证任意设备读回后计算出的哈希与
 * manifest.json 记录的哈希一致——否则会触发空转上传。
 */
export function canonicalStringify(value: unknown): string {
  const serialized = serializeDates(value);
  const canonical = toCanonicalForm(serialized);
  return JSON.stringify(canonical);
}
