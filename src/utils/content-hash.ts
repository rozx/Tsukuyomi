import { serializeDates } from 'src/utils/serialize-dates';

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
 * 1. 先走 `serializeDates` 将 Date → ISO 字符串，保证哈希输入不含运行时对象
 * 2. 使用 `JSON.stringify` 序列化为字符串
 * 3. UTF-8 编码后调用 `crypto.subtle.digest('SHA-256', ...)`
 *
 * 稳定性：相同输入（相同结构、相同键顺序）产生相同哈希。
 * 本实现依赖 JSON.stringify 的默认行为，**不做** canonical key ordering——
 * 因为 manifest 的权威性是决策性的（决定同步什么），不是内容性的（最终以实际文件为准），
 * 即便偶发重复上传也不破坏数据。
 */
export async function hashJson(payload: unknown): Promise<string> {
  const serialized = serializeDates(payload);
  const json = JSON.stringify(serialized);
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
