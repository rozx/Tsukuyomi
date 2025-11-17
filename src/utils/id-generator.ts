import { v4 as uuidv4 } from 'uuid';

/**
 * 生成短 ID（uuidv4 的前 8 个字符）
 * @returns 8 位十六进制字符串，例如 "e58ed763"
 */
export function generateShortId(): string {
  return uuidv4().replace(/-/g, '').substring(0, 8);
}

/**
 * ID 生成器类，确保在各自的组内是唯一的
 */
export class UniqueIdGenerator {
  private usedIds: Set<string>;

  constructor(existingIds: string[] = []) {
    this.usedIds = new Set(existingIds);
  }

  /**
   * 生成一个唯一的短 ID
   * @param maxAttempts 最大尝试次数，默认 100
   * @returns 唯一的 8 位十六进制字符串
   */
  generate(maxAttempts: number = 100): string {
    let attempts = 0;
    while (attempts < maxAttempts) {
      const id = generateShortId();
      if (!this.usedIds.has(id)) {
        this.usedIds.add(id);
        return id;
      }
      attempts++;
    }
    throw new Error(`无法生成唯一 ID，已尝试 ${maxAttempts} 次`);
  }

  /**
   * 添加已使用的 ID
   * @param id ID 字符串
   */
  addUsedId(id: string): void {
    this.usedIds.add(id);
  }

  /**
   * 添加多个已使用的 ID
   * @param ids ID 字符串数组
   */
  addUsedIds(ids: string[]): void {
    ids.forEach((id) => this.usedIds.add(id));
  }

  /**
   * 检查 ID 是否已被使用
   * @param id ID 字符串
   * @returns 是否已被使用
   */
  isUsed(id: string): boolean {
    return this.usedIds.has(id);
  }

  /**
   * 清除所有已使用的 ID
   */
  clear(): void {
    this.usedIds.clear();
  }
}

/**
 * 从对象数组中提取 ID
 * @param items 对象数组
 * @param idKey ID 字段名，默认为 'id'
 * @returns ID 字符串数组
 */
export function extractIds<T extends Record<string, any>>(
  items: T[],
  idKey: keyof T = 'id' as keyof T,
): string[] {
  return items.map((item) => String(item[idKey])).filter((id) => id);
}
