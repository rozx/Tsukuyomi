// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createElectronMcpServer,
  type ElectronMcpServerInstance,
} from '../../src-electron/mcp-server';

describe('Electron Streamable HTTP MCP Server (dual-era)', () => {
  const servers: ElectronMcpServerInstance[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()!.stop();
    }
  });

  async function startTestServer(token = 'test-secret-token-123456') {
    const dispatch = vi.fn((method: string, params: Record<string, unknown>) => {
      if (method === 'tools/list') {
        return Promise.resolve({
          tools: [
            {
              name: 'list_books',
              description: 'List books',
              inputSchema: { type: 'object', properties: {} },
              annotations: { readOnlyHint: true },
            },
          ],
        });
      }
      if (method === 'tools/call') {
        return Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify({ echoed: params.name }) }],
          isError: false,
        });
      }
      if (method === 'prompts/list') {
        return Promise.resolve({
          prompts: [{ name: 'translate-chapter', description: 'Translate', arguments: [] }],
        });
      }
      if (method === 'prompts/get') {
        return Promise.resolve({
          description: 'Translate',
          messages: [
            { role: 'user', content: { type: 'text', text: `Prompt ${String(params.name)}` } },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected dispatch: ${method}`));
    });

    const server = createElectronMcpServer({
      version: '0.19.2',
      dispatch,
    });
    servers.push(server);
    const status = await server.start({ port: 0, authToken: token });
    expect(status.state).toBe('running');
    expect(status.port).toBeGreaterThan(0);

    const postJson = async (body: unknown, headers: Record<string, string> = {}) => {
      const res = await server.handleRawRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          host: `127.0.0.1:${status.port}`,
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });
      return {
        status: res.status,
        headers: res.headers,
        json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : null,
      };
    };

    return {
      server,
      dispatch,
      token,
      port: status.port!,
      postJson,
    };
  }

  it('旧代（2025-03-26）支持 initialize、notifications/initialized、ping、tools/* 与 prompts/*，且不签发会话 ID', async () => {
    const { postJson, token } = await startTestServer();
    const auth = { authorization: `Bearer ${token}` };

    const initRes = await postJson(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      auth,
    );
    expect(initRes.status).toBe(200);
    expect(initRes.headers['Mcp-Session-Id']).toBeUndefined();
    expect((initRes.json?.result as { protocolVersion: string }).protocolVersion).toBe(
      '2025-03-26',
    );

    const notifRes = await postJson({ jsonrpc: '2.0', method: 'notifications/initialized' }, auth);
    expect(notifRes.status).toBe(202);

    const pingRes = await postJson({ jsonrpc: '2.0', id: 2, method: 'ping' }, auth);
    expect(pingRes.status).toBe(200);
    expect(pingRes.json?.result).toEqual({});

    const toolsRes = await postJson({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, auth);
    expect(toolsRes.status).toBe(200);
    expect((toolsRes.json?.result as { tools: unknown[] }).tools).toHaveLength(1);

    const callRes = await postJson(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'list_books', arguments: {} },
      },
      auth,
    );
    expect(callRes.status).toBe(200);
    expect((callRes.json?.result as { isError: boolean }).isError).toBe(false);

    const promptsRes = await postJson({ jsonrpc: '2.0', id: 5, method: 'prompts/list' }, auth);
    expect(promptsRes.status).toBe(200);
    expect((promptsRes.json?.result as { prompts: unknown[] }).prompts).toHaveLength(1);
  });

  it('现代无状态（2026-07-28）支持 server/discover 与无握手直接 tools/list、tools/call、prompts/get', async () => {
    const { postJson, token } = await startTestServer();
    const baseHeaders = {
      authorization: `Bearer ${token}`,
      'mcp-protocol-version': '2026-07-28',
    };

    const discover = await postJson(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
      },
      { ...baseHeaders, 'mcp-method': 'server/discover' },
    );
    expect(discover.status).toBe(200);
    const discoverResult = discover.json?.result as Record<string, unknown>;
    expect(discoverResult.resultType).toBe('complete');
    expect(discoverResult.supportedVersions).toEqual(['2026-07-28', '2025-03-26']);
    expect(typeof discoverResult.ttlMs).toBe('number');
    expect(discoverResult.cacheScope).toBe('private');

    const listTools = await postJson(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
      },
      { ...baseHeaders, 'mcp-method': 'tools/list' },
    );
    expect(listTools.status).toBe(200);
    const listResult = listTools.json?.result as Record<string, unknown>;
    expect(listResult.resultType).toBe('complete');
    expect(typeof listResult.ttlMs).toBe('number');
    expect(listResult.cacheScope).toBe('private');

    const callTool = await postJson(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'list_books',
          arguments: {},
          _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
        },
      },
      { ...baseHeaders, 'mcp-method': 'tools/call', 'mcp-name': 'list_books' },
    );
    expect(callTool.status).toBe(200);
    expect((callTool.json?.result as Record<string, unknown>).resultType).toBe('complete');

    const getPrompt = await postJson(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'prompts/get',
        params: {
          name: 'translate-chapter',
          _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
        },
      },
      { ...baseHeaders, 'mcp-method': 'prompts/get', 'mcp-name': 'translate-chapter' },
    );
    expect(getPrompt.status).toBe(200);
    expect((getPrompt.json?.result as Record<string, unknown>).resultType).toBe('complete');
  });

  it('现代协议校验请求头不一致（400/-32020）、不支持版本（400/-32022）、未知方法（404/-32601）及 GET/DELETE（405）', async () => {
    const { server, postJson, token, dispatch, port } = await startTestServer();
    const auth = { authorization: `Bearer ${token}` };

    const headerMismatch = await postJson(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'list_books',
          arguments: {},
          _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
        },
      },
      {
        ...auth,
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'wrong_tool',
      },
    );
    expect(headerMismatch.status).toBe(400);
    expect((headerMismatch.json?.error as { code: number }).code).toBe(-32020);
    expect(dispatch).not.toHaveBeenCalled();

    const badVersion = await postJson(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } },
      },
      { ...auth, 'mcp-protocol-version': '2099-01-01', 'mcp-method': 'tools/list' },
    );
    expect(badVersion.status).toBe(400);
    expect((badVersion.json?.error as { code: number }).code).toBe(-32022);
    expect(
      (badVersion.json?.error as { data?: { supported: string[] } }).data?.supported,
    ).toContain('2026-07-28');

    // 不支持的 MCP-Protocol-Version 即使未携带 Mcp-Method 也必须先返回 -32022（不被 -32020 抢先）
    const badVersionWithoutMcpMethod = await postJson(
      { jsonrpc: '2.0', id: 22, method: 'tools/list', params: {} },
      { ...auth, 'mcp-protocol-version': '2024-11-05' },
    );
    expect(badVersionWithoutMcpMethod.status).toBe(400);
    expect((badVersionWithoutMcpMethod.json?.error as { code: number }).code).toBe(-32022);
    expect(
      (badVersionWithoutMcpMethod.json?.error as { data?: { supported: string[] } }).data
        ?.supported,
    ).toEqual(['2026-07-28', '2025-03-26']);

    const unknownMethod = await postJson(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
      },
      { ...auth, 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'resources/list' },
    );
    expect(unknownMethod.status).toBe(404);
    expect((unknownMethod.json?.error as { code: number }).code).toBe(-32601);

    const getRes = await server.handleRawRequest({
      method: 'GET',
      url: '/mcp',
      headers: { host: `127.0.0.1:${port}`, ...auth },
      body: '',
    });
    expect(getRes.status).toBe(405);

    const delRes = await server.handleRawRequest({
      method: 'DELETE',
      url: '/mcp',
      headers: { host: `127.0.0.1:${port}`, ...auth },
      body: '',
    });
    expect(delRes.status).toBe(405);
  });

  it('启动还没完成就收到停止：最终是停止的，端口没有被占用；启动、停止按调用顺序执行', async () => {
    const statuses: string[] = [];
    const server = createElectronMcpServer({
      version: '0.19.2',
      dispatch: () => Promise.resolve({}),
      onStatusChange: (status) => {
        statuses.push(status.state);
      },
    });
    servers.push(server);

    // 不等待启动完成就停止，与界面上快速开关的调用方式一致
    const starting = server.start({ port: 0, authToken: 'token-a' });
    const stopped = await server.stop();
    const started = await starting;

    expect(started.state).toBe('running');
    expect(stopped.state).toBe('stopped');
    expect(server.getStatus()).toEqual({ state: 'stopped', port: null, error: null });
    expect(statuses.at(-1)).toBe('stopped');
    // 启动时绑定的端口已经释放
    const refused = await fetch(`http://127.0.0.1:${started.port}/mcp`, { method: 'POST' }).then(
      () => false,
      () => true,
    );
    expect(refused).toBe(true);

    // 停止、再启动交错调用后，以最后一次为准
    const again = server.start({ port: 0, authToken: 'token-b' });
    void server.stop();
    const final = await server.start({ port: 0, authToken: 'token-c' });
    await again;
    expect(final.state).toBe('running');
    expect(server.getStatus().state).toBe('running');
  });

  it('启动还在排队时更换令牌：启动完成后生效的是新令牌，旧令牌被拒绝', async () => {
    const server = createElectronMcpServer({
      version: '0.19.2',
      dispatch: () => Promise.resolve({}),
    });
    servers.push(server);
    // 用一个确定的端口：端口不变时更新配置只换令牌，不重启
    const { port } = await server.start({ port: 0, authToken: 'first-token-000000' });

    // 一次带旧令牌的重启排在停止之后，还没执行时用户更换了令牌
    void server.stop();
    const restarting = server.start({ port: port!, authToken: 'old-token-111111' });
    const applied = server.applyConfig({ port: port!, authToken: 'new-token-222222' });
    const status = await restarting;
    expect(status.state).toBe('running');
    // 更新排在重启之后：返回的是重启完成后的状态，而不是调用那一刻的「已停止」
    expect(await applied).toEqual(status);

    const call = (token: string) =>
      fetch(`http://127.0.0.1:${status.port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      }).then((res) => res.status);
    expect(await call('old-token-111111')).toBe(401);
    expect(await call('new-token-222222')).not.toBe(401);
  });

  it('应用新配置：端口没变只换令牌，端口变了重启监听，服务没在运行时只记下令牌', async () => {
    const server = createElectronMcpServer({
      version: '0.19.2',
      dispatch: () => Promise.resolve({}),
    });
    servers.push(server);
    const stoppedStatus = await server.applyConfig({ port: 0, authToken: 'token-before-start' });
    expect(stoppedStatus.state).toBe('stopped');

    const first = await server.start({ port: 0, authToken: 'token-a-000000' });
    const samePort = await server.applyConfig({ port: first.port!, authToken: 'token-b-111111' });
    expect(samePort).toEqual(first);

    // 换一个确定空闲的端口：先占一个再释放
    const probe = createElectronMcpServer({
      version: '0.19.2',
      dispatch: () => Promise.resolve({}),
    });
    const free = (await probe.start({ port: 0, authToken: 'x' })).port!;
    await probe.stop();
    const moved = await server.applyConfig({ port: free, authToken: 'token-b-111111' });
    expect(moved).toEqual({ state: 'running', port: free, error: null });
    expect(moved.port).not.toBe(first.port);
  });

  it('连续两次更新配置：先换端口、紧接着又换令牌，最终生效的是后一次的令牌', async () => {
    const options = { version: '0.19.2', dispatch: () => Promise.resolve({}) };
    const server = createElectronMcpServer(options);
    servers.push(server);
    await server.start({ port: 0, authToken: 'token-0-000000' });
    const probe = createElectronMcpServer(options);
    const free = (await probe.start({ port: 0, authToken: 'x' })).port!;
    await probe.stop();

    // 两次更新都不等待完成，与界面上连续操作的调用方式一致
    const first = server.applyConfig({ port: free, authToken: 'token-a-111111' });
    const second = server.applyConfig({ port: free, authToken: 'token-b-222222' });
    await Promise.all([first, second]);

    const call = (token: string) =>
      fetch(`http://127.0.0.1:${free}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      }).then((res) => res.status);
    expect(await call('token-a-111111')).toBe(401);
    expect(await call('token-b-222222')).not.toBe(401);
  });

  it('校验 Bearer Token（401）、非本机 Host / 跨站 Origin（403）、Token 轮换立即失效、两代并发与端口冲突报错', async () => {
    const { server, postJson, token, port } = await startTestServer('token-v1');

    // 缺失令牌 -> 401
    const noAuth = await postJson({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(noAuth.status).toBe(401);

    // 跨站 Origin -> 403
    const evilOrigin = await postJson(
      { jsonrpc: '2.0', id: 2, method: 'ping' },
      { authorization: `Bearer ${token}`, origin: 'https://evil.example' },
    );
    expect(evilOrigin.status).toBe(403);

    // 非本机 Host（DNS Rebinding） -> 403
    const evilHost = await postJson(
      { jsonrpc: '2.0', id: 3, method: 'ping' },
      { host: 'attacker.example:48321', authorization: `Bearer ${token}` },
    );
    expect(evilHost.status).toBe(403);

    // 两代并发互不影响
    const [legacyRes, modernRes] = await Promise.all([
      postJson(
        { jsonrpc: '2.0', id: 10, method: 'tools/list' },
        { authorization: `Bearer ${token}` },
      ),
      postJson(
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/list',
          params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
        },
        {
          authorization: `Bearer ${token}`,
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
        },
      ),
    ]);
    expect(legacyRes.status).toBe(200);
    expect(modernRes.status).toBe(200);
    expect((modernRes.json?.result as Record<string, unknown>).resultType).toBe('complete');

    // Token 轮换后旧令牌立即 401，新令牌 200
    await server.applyConfig({ port, authToken: 'token-v2' });
    const oldTokenRes = await postJson(
      { jsonrpc: '2.0', id: 12, method: 'ping' },
      { authorization: 'Bearer token-v1' },
    );
    expect(oldTokenRes.status).toBe(401);
    const newTokenRes = await postJson(
      { jsonrpc: '2.0', id: 13, method: 'ping' },
      { authorization: 'Bearer token-v2' },
    );
    expect(newTokenRes.status).toBe(200);

    // 端口冲突优雅报错
    const conflictServer = createElectronMcpServer({
      version: '0.19.2',
      dispatch: () => Promise.resolve({}),
    });
    servers.push(conflictServer);
    const conflictStatus = await conflictServer.start({ port, authToken: 'other' });
    expect(conflictStatus.state).toBe('error');
    expect(conflictStatus.error).toContain('already in use');
  });
});
