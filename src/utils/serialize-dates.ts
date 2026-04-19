/**
 * 递归将对象中的 Date 实例转换为 ISO 8601 字符串。
 * 用于同步上传前的数据规范化：Date 对象无法直接序列化为 JSON，
 * 必须转换为字符串才能通过网络传输并稳定哈希。
 *
 * 此函数与反序列化（`deserializeDates`）配对使用。反序列化仅针对
 * 日期字段白名单（lastEdited / createdAt / addedAt / lastUpdated）进行恢复，
 * 避免将内容中碰巧形如 ISO 日期的字符串误识别为 Date。
 */
export function serializeDates<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => serializeDates(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      serialized[key] = serializeDates(value);
    }
    return serialized as unknown as T;
  }

  return obj;
}

/**
 * 日期字段白名单——只有这些键的字符串值会在反序列化时转换回 Date。
 * 避免误将小说内容或消息正文里的日期字符串转换。
 */
const DATE_FIELD_NAMES = new Set<string>([
  'lastEdited',
  'createdAt',
  'addedAt',
  'lastUpdated',
]);

/**
 * 递归将 ISO 日期字符串还原为 Date 对象（仅限白名单字段）
 */
export function deserializeDates<T>(obj: T, parentKey?: string): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (
    typeof obj === 'string' &&
    parentKey &&
    DATE_FIELD_NAMES.has(parentKey) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)
  ) {
    return new Date(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deserializeDates(item, parentKey)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const deserialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      deserialized[key] = deserializeDates(value, key);
    }
    return deserialized as unknown as T;
  }

  return obj;
}
