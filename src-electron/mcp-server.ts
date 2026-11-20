import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  DesktopMcpMethod,
  DesktopMcpServerStatus,
  DesktopMcpStartConfig,
} from '../src/models/desktop-mcp';

const MODERN_MCP_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_MCP_PROTOCOL_VERSION = '2025-03-26';
const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  MODERN_MCP_PROTOCOL_VERSION,
  LEGACY_MCP_PROTOCOL_VERSION,
] as const;

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MiB
const DISCOVER_TTL_MS = 30_000;
const TOOLS_LIST_TTL_MS = 5_000;
const PROMPTS_LIST_TTL_MS = 30_000;

export type ElectronMcpDispatchFn = (
  method: DesktopMcpMethod,
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface CreateElectronMcpServerOptions {
  version: string;
  dispatch: ElectronMcpDispatchFn;
  onStatusChange?: (status: DesktopMcpServerStatus) => void;
}

export interface RawHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface RawHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ElectronMcpServerInstance {
  start: (config: DesktopMcpStartConfig) => Promise<DesktopMcpServerStatus>;
  stop: () => Promise<DesktopMcpServerStatus>;
  updateAuthToken: (token: string) => void;
  getStatus: () => DesktopMcpServerStatus;
  handleRawRequest: (req: RawHttpRequest) => Promise<RawHttpResponse>;
}

export class McpJsonRpcError extends Error {
  readonly code: number;
  readonly httpStatus: number;
  readonly data?: unknown;

  constructor(code: number, message: string, httpStatus = 200, data?: unknown) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.data = data;
  }
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const trimmed = hostHeader.trim().toLowerCase();
  return /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(trimmed);
}

function isAllowedOrigin(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  try {
    const parsed = new URL(originHeader.trim());
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(
  headers: Record<string, string | string[] | undefined>,
  expectedToken: string,
): boolean {
  if (!expectedToken) return false;
  const auth = getHeader(headers, 'authorization');
  if (!auth) return false;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!match?.[1]) return false;
  return constantTimeEquals(match[1].trim(), expectedToken);
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): RawHttpResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function jsonRpcErrorResponse(
  httpStatus: number,
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): RawHttpResponse {
  return jsonResponse(httpStatus, {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  });
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new McpJsonRpcError(-32600, 'Request body exceeds 10 MiB limit.', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function extractMetaProtocolVersion(
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const meta = params._meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const version = (meta as Record<string, unknown>)['io.modelcontextprotocol/protocolVersion'];
  return typeof version === 'string' ? version.trim() : undefined;
}

export function createElectronMcpServer(
  options: CreateElectronMcpServerOptions,
): ElectronMcpServerInstance {
  let server: Server | null = null;
  let activeToken = '';
  let status: DesktopMcpServerStatus = {
    state: 'stopped',
    port: null,
    error: null,
  };

  const setStatus = (next: DesktopMcpServerStatus): DesktopMcpServerStatus => {
    status = { ...next };
    options.onStatusChange?.({ ...status });
    return { ...status };
  };

  const handleModernRequest = async (
    headers: Record<string, string | string[] | undefined>,
    rpc: JsonRpcRequest,
    metaVersion: string | undefined,
  ): Promise<RawHttpResponse> => {
    const id = rpc.id ?? null;
    const headerVersion = getHeader(headers, 'mcp-protocol-version')?.trim();
    const headerMethod = getHeader(headers, 'mcp-method')?.trim();
    const headerName = getHeader(headers, 'mcp-name')?.trim();

    if (!headerVersion || (metaVersion && headerVersion !== metaVersion)) {
      return jsonRpcErrorResponse(
        400,
        id,
        -32020,
        'HeaderMismatch: MCP-Protocol-Version header missing or does not match _meta protocolVersion.',
      );
    }

    // 先检查协议版本是否受支持，避免旧代或未知版本客户端因缺少现代头而被 -32020 抢先报错
    if (headerVersion !== MODERN_MCP_PROTOCOL_VERSION) {
      return jsonRpcErrorResponse(
        400,
        id,
        -32022,
        `Unsupported protocol version: ${headerVersion}`,
        {
          supported: [...SUPPORTED_MCP_PROTOCOL_VERSIONS],
        },
      );
    }

    if (!headerMethod || headerMethod !== rpc.method) {
      return jsonRpcErrorResponse(
        400,
        id,
        -32020,
        'HeaderMismatch: Mcp-Method header missing or does not match JSON-RPC method.',
      );
    }

    const params = rpc.params && typeof rpc.params === 'object' ? rpc.params : {};
    if (rpc.method === 'tools/call' || rpc.method === 'prompts/get') {
      const bodyName = typeof params.name === 'string' ? params.name : '';
      if (!headerName || headerName !== bodyName) {
        return jsonRpcErrorResponse(
          400,
          id,
          -32020,
          'HeaderMismatch: Mcp-Name header missing or does not match params.name.',
        );
      }
    }

    const responseHeaders = { 'MCP-Protocol-Version': MODERN_MCP_PROTOCOL_VERSION };

    if (rpc.method === 'server/discover') {
      return jsonResponse(
        200,
        {
          jsonrpc: '2.0',
          id,
          result: {
            resultType: 'complete',
            supportedVersions: [...SUPPORTED_MCP_PROTOCOL_VERSIONS],
            serverInfo: {
              name: 'tsukuyomi-translator',
              version: options.version,
            },
            capabilities: {
              tools: {},
              prompts: {},
            },
            ttlMs: DISCOVER_TTL_MS,
            cacheScope: 'private',
          },
        },
        responseHeaders,
      );
    }

    if (
      rpc.method === 'tools/list' ||
      rpc.method === 'tools/call' ||
      rpc.method === 'prompts/list' ||
      rpc.method === 'prompts/get'
    ) {
      const dispatched = await options.dispatch(rpc.method, params);
      const result: Record<string, unknown> = {
        resultType: 'complete',
        ...dispatched,
      };
      if (rpc.method === 'tools/list') {
        result.ttlMs = TOOLS_LIST_TTL_MS;
        result.cacheScope = 'private';
      } else if (rpc.method === 'prompts/list') {
        result.ttlMs = PROMPTS_LIST_TTL_MS;
        result.cacheScope = 'private';
      }
      return jsonResponse(200, { jsonrpc: '2.0', id, result }, responseHeaders);
    }

    return jsonRpcErrorResponse(404, id, -32601, `Method not found: ${rpc.method}`);
  };

  const handleLegacyRequest = async (rpc: JsonRpcRequest): Promise<RawHttpResponse> => {
    const isNotification = rpc.id === undefined || rpc.method === 'notifications/initialized';
    if (isNotification) {
      return { status: 202, headers: { 'Cache-Control': 'no-store' }, body: '' };
    }

    const id = rpc.id ?? null;
    const params = rpc.params && typeof rpc.params === 'object' ? rpc.params : {};

    if (rpc.method === 'initialize') {
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: LEGACY_MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            prompts: {},
          },
          serverInfo: {
            name: 'tsukuyomi-translator',
            version: options.version,
          },
        },
      });
    }

    if (rpc.method === 'ping') {
      return jsonResponse(200, { jsonrpc: '2.0', id, result: {} });
    }

    if (
      rpc.method === 'tools/list' ||
      rpc.method === 'tools/call' ||
      rpc.method === 'prompts/list' ||
      rpc.method === 'prompts/get'
    ) {
      const result = await options.dispatch(rpc.method, params);
      return jsonResponse(200, { jsonrpc: '2.0', id, result });
    }

    return jsonRpcErrorResponse(200, id, -32601, `Method not found: ${rpc.method}`);
  };

  const handleRawRequest = async (req: RawHttpRequest): Promise<RawHttpResponse> => {
    // 1. Host 与 Origin 防 DNS Rebinding / CSRF
    if (
      !isLoopbackHost(getHeader(req.headers, 'host')) ||
      !isAllowedOrigin(getHeader(req.headers, 'origin'))
    ) {
      return jsonResponse(403, { error: 'Forbidden host or origin.' });
    }

    // 2. Bearer Token 鉴权
    if (!isAuthorized(req.headers, activeToken)) {
      return jsonResponse(
        401,
        { error: 'Unauthorized: invalid or missing Bearer token.' },
        { 'WWW-Authenticate': 'Bearer realm="tsukuyomi-mcp"' },
      );
    }

    // 3. 路径检查
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (pathname !== '/mcp') {
      return jsonResponse(404, { error: 'Not Found' });
    }

    // 4. 方法检查：GET / DELETE 返回 405
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method Not Allowed. Use POST /mcp.' }, { Allow: 'POST' });
    }

    // 5. 解析 JSON-RPC 2.0 载荷
    let rpc: JsonRpcRequest;
    try {
      const parsed: unknown = JSON.parse(req.body);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (parsed as { jsonrpc?: unknown }).jsonrpc !== '2.0' ||
        typeof (parsed as { method?: unknown }).method !== 'string'
      ) {
        return jsonRpcErrorResponse(400, null, -32600, 'Invalid JSON-RPC 2.0 request.');
      }
      rpc = parsed as JsonRpcRequest;
    } catch {
      return jsonRpcErrorResponse(400, null, -32700, 'Parse error: invalid JSON payload.');
    }

    // 6. 按双代规则分流处理
    try {
      const metaVersion = extractMetaProtocolVersion(rpc.params);
      const headerVersion = getHeader(req.headers, 'mcp-protocol-version')?.trim();
      const isModern =
        rpc.method === 'server/discover' ||
        Boolean(metaVersion) ||
        (Boolean(headerVersion) &&
          headerVersion !== LEGACY_MCP_PROTOCOL_VERSION &&
          rpc.method !== 'initialize');

      if (isModern) {
        return await handleModernRequest(req.headers, rpc, metaVersion);
      }
      return await handleLegacyRequest(rpc);
    } catch (error) {
      const id = rpc.id ?? null;
      if (error instanceof McpJsonRpcError) {
        return jsonRpcErrorResponse(error.httpStatus, id, error.code, error.message, error.data);
      }
      const message = error instanceof Error ? error.message : String(error);
      return jsonRpcErrorResponse(200, id, -32002, message);
    }
  };

  const handleHttpRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const body = (req.method ?? 'GET').toUpperCase() === 'POST' ? await readBody(req) : '';
      const response = await handleRawRequest({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers,
        body,
      });
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    } catch (error) {
      const response =
        error instanceof McpJsonRpcError
          ? jsonRpcErrorResponse(error.httpStatus, null, error.code, error.message, error.data)
          : jsonRpcErrorResponse(500, null, -32603, 'Internal server error.');
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    }
  };

  /**
   * 启动与停止按调用顺序一个接一个执行。`server` 要到开始监听后才赋值，
   * 交错执行时「停止」会在启动完成前看到空值而直接报告已停止，随后启动仍然绑定端口。
   */
  let lifecycle: Promise<unknown> = Promise.resolve();
  const inOrder = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = lifecycle.then(operation, operation);
    lifecycle = run.catch(() => undefined);
    return run;
  };

  const stopNow = async (): Promise<DesktopMcpServerStatus> => {
    const current = server;
    server = null;
    if (!current) {
      return setStatus({ state: 'stopped', port: null, error: null });
    }
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
    return setStatus({ state: 'stopped', port: null, error: null });
  };

  const startNow = async (config: DesktopMcpStartConfig): Promise<DesktopMcpServerStatus> => {
    if (server) {
      await stopNow();
    }
    activeToken = config.authToken.trim();
    setStatus({ state: 'starting', port: config.port, error: null });

    const nextServer = createServer((req, res) => {
      void handleHttpRequest(req, res);
    });

    return new Promise<DesktopMcpServerStatus>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        nextServer.removeListener('listening', onListening);
        server = null;
        const message =
          err.code === 'EADDRINUSE'
            ? `Port ${config.port} is already in use.`
            : err.message || 'Failed to start local MCP server.';
        resolve(setStatus({ state: 'error', port: null, error: message }));
      };

      const onListening = () => {
        nextServer.removeListener('error', onError);
        server = nextServer;
        const address = nextServer.address() as AddressInfo | null;
        const boundPort = address?.port ?? config.port;
        resolve(setStatus({ state: 'running', port: boundPort, error: null }));
      };

      nextServer.once('error', onError);
      nextServer.once('listening', onListening);
      nextServer.listen(config.port, '127.0.0.1');
    });
  };

  const start = (config: DesktopMcpStartConfig): Promise<DesktopMcpServerStatus> =>
    inOrder(() => startNow(config));
  const stop = (): Promise<DesktopMcpServerStatus> => inOrder(stopNow);

  const updateAuthToken = (token: string): void => {
    activeToken = token.trim();
  };

  const getStatus = (): DesktopMcpServerStatus => ({ ...status });

  return {
    start,
    stop,
    updateAuthToken,
    getStatus,
    handleRawRequest,
  };
}
