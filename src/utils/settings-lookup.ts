/**
 * 设置查询叶子工具 — 直接从 IndexedDB 读取部分设置值，供需要读设置但又
 * 不能 import `stores/settings` 的模块使用（如 embedding-queue）。
 *
 * 设置的权威存储是 IndexedDB 的 `settings` 表（key = 'app'）；Pinia store
 * 在启动时从这里加载、变更时写回。本模块从同一数据源读，保证一致。
 *
 * 注意：这里不做缓存 — 调用频率低（eq 在 run loop 中偶尔检查一次），缓存
 * 反而增加一致性风险。
 */

import { getDB } from 'src/utils/indexed-db';

const SETTINGS_DB_KEY = 'app';

/**
 * 直接读取 `enableLocalEmbedding` 字段。读不到或出错时返回 undefined。
 */
export async function readEnableLocalEmbeddingFromDB(): Promise<boolean | undefined> {
  try {
    const db = await getDB();
    const stored = (await db.get('settings', SETTINGS_DB_KEY)) as
      | { enableLocalEmbedding?: boolean }
      | undefined;
    return stored?.enableLocalEmbedding;
  } catch {
    return undefined;
  }
}
