/**
 * 判断本页是否真的接上了本机的 WebMCP 中继。
 *
 * 随应用分发的中继脚本（public/webmcp-relay）不会把连接状态告诉页面，但有两处可以观察：
 * - 中继接受本页后，脚本会在 sessionStorage 里记下它连上的地址；被拒绝时会删掉这条记录。
 *   脚本运行在本页创建的同源 iframe 里，所以本页读得到。
 * - 中继支持一个只用于「发现」的 WebSocket 子协议：连上后中继先发一条问候。
 *   用它探测不会把本页登记成工具来源。
 *
 * 这两处都是中继脚本的内部约定，升级依赖时由 agent-mcp-relay-link.test.ts 校验。
 */

/** 中继默认监听的端口；多个 Agent 客户端各自启动的中继会汇聚到同一个端口上 */
export const RELAY_DEFAULT_PORT = 9333;
const DISCOVERY_PROTOCOL = 'webmcp-discovery.v1';
const PROBE_TIMEOUT_MS = 1500;

export type RelayLinkState =
  /** 中继在运行，并且接受过本页 */
  | 'connected'
  /** 中继在运行，但本页没有被接受：多半是中继只允许的页面地址与本页不一致 */
  | 'not-linked'
  /** 没有找到中继：Agent 客户端还没有启动它 */
  | 'not-found';

export interface RelayLinkStatus {
  state: RelayLinkState;
  port: number | null;
}

/** 中继脚本记录「已接入的中继地址」所用的 sessionStorage 键 */
export function relayEndpointStorageKey(origin: string): string {
  // 后两段是中继 ID 与工作区，本应用没有配置，为空
  return `__webmcp_relay_endpoint:${[origin, '', ''].map(encodeURIComponent).join(':')}`;
}

function readAcceptedPort(storage: Pick<Storage, 'getItem'>, origin: string): number | null {
  try {
    const raw = storage.getItem(relayEndpointStorageKey(origin));
    if (!raw) return null;
    const port = (JSON.parse(raw) as { port?: unknown }).port;
    return typeof port === 'number' && Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

interface ProbeSocket {
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void;
  close: () => void;
}

function isRelayGreeting(data: unknown): boolean {
  try {
    const message = JSON.parse(String(data)) as { type?: unknown; service?: unknown };
    return message.type === 'server-hello' && message.service === 'webmcp-local-relay';
  } catch {
    return false;
  }
}

/** 探测本机某个端口上是否有中继在运行 */
export function probeRelay(
  port: number,
  options: {
    timeoutMs?: number;
    createSocket?: (url: string, protocols: string[]) => ProbeSocket;
  } = {},
): Promise<boolean> {
  const createSocket =
    options.createSocket ?? ((url, protocols) => new WebSocket(url, protocols) as ProbeSocket);
  return new Promise((resolve) => {
    let socket: ProbeSocket;
    try {
      socket = createSocket(`ws://127.0.0.1:${port}`, [DISCOVERY_PROTOCOL]);
    } catch {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (found: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // 连接没有建立时关闭可能抛错，不影响结果
      }
      resolve(found);
    };
    const timer = setTimeout(() => finish(false), options.timeoutMs ?? PROBE_TIMEOUT_MS);
    socket.addEventListener('message', (event) => {
      if (isRelayGreeting(event.data)) finish(true);
    });
    socket.addEventListener('error', () => finish(false));
    socket.addEventListener('close', () => finish(false));
  });
}

export async function checkRelayLink(deps: {
  origin: string;
  storage: Pick<Storage, 'getItem'>;
  probe?: (port: number) => Promise<boolean>;
}): Promise<RelayLinkStatus> {
  const probe = deps.probe ?? ((port: number) => probeRelay(port));
  const acceptedPort = readAcceptedPort(deps.storage, deps.origin);
  if (acceptedPort !== null && (await probe(acceptedPort))) {
    return { state: 'connected', port: acceptedPort };
  }
  // 没有接入记录，或记录里的中继已经停了：看默认端口上有没有中继
  if (acceptedPort !== RELAY_DEFAULT_PORT && (await probe(RELAY_DEFAULT_PORT))) {
    return { state: 'not-linked', port: RELAY_DEFAULT_PORT };
  }
  return { state: 'not-found', port: null };
}
