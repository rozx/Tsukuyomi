import { canonicalStringify } from 'src/utils/canonical-json';

/**
 * 将 ArrayBuffer 转为十六进制小写字符串
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * 计算 payload 的 SHA-256 哈希（十六进制小写）。
 *
 * 规则：
 * 1. `canonicalStringify` 先走 `serializeDates`（Date → ISO），
 *    再按键名字典序排序所有对象并 JSON.stringify——产出与 `serializeEntry`
 *    上传路径完全一致的字节，消除任意设备的键顺序抖动
 * 2. UTF-8 编码后调用 `crypto.subtle.digest('SHA-256', ...)`
 *
 * 必须与 `serializeEntry` 使用同一种序列化函数，否则 A 设备算出的 manifest
 * 哈希与 B 设备从同一 JSON 读回再算的哈希会出现漂移，触发空转上传。
 */
export async function hashJson(payload: unknown): Promise<string> {
  const json = canonicalStringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

/**
 * 直接对已经序列化过的字符串计算 SHA-256 哈希。
 * 用于已知输入是字符串（例如已完成 JSON.stringify）的快路径。
 */
export async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}
