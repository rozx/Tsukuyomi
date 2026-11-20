import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  RELAY_DEFAULT_PORT,
  checkRelayLink,
  probeRelay,
  relayEndpointStorageKey,
} from 'src/services/agent-mcp/relay-link';

const ORIGIN = 'http://localhost:9000';

function storageWith(entries: Record<string, string>) {
  return { getItem: (key: string) => entries[key] ?? null };
}

/** 可由测试驱动的假 WebSocket */
class FakeSocket {
  static last: FakeSocket | null = null;
  listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  closed = false;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}
const createSocket = (url: string, protocols: string[]) => new FakeSocket(url, protocols);

describe('本机中继连接状态', () => {
  it('已接入记录的键与中继脚本写入的键一致', () => {
    expect(relayEndpointStorageKey(ORIGIN)).toBe(
      '__webmcp_relay_endpoint:http%3A%2F%2Flocalhost%3A9000::',
    );
    // 随应用分发的中继脚本仍在使用这套键与发现协议；升级依赖后若有变化，这里会失败
    const widget = readFileSync(resolve(process.cwd(), 'public/webmcp-relay/widget.html'), 'utf8');
    expect(widget).toContain('__webmcp_relay_endpoint:');
    expect(widget).toContain('webmcp-discovery.v1');
    expect(widget).toContain('server-hello');
    expect(widget).toContain('hello/accepted');
  });

  it('中继接受过本页、且该端口上中继仍在运行：已接入', async () => {
    const probe = vi.fn((port: number) => Promise.resolve(port === 9340));
    const status = await checkRelayLink({
      origin: ORIGIN,
      storage: storageWith({
        [relayEndpointStorageKey(ORIGIN)]: JSON.stringify({ host: '127.0.0.1', port: 9340 }),
      }),
      probe,
    });
    expect(status).toEqual({ state: 'connected', port: 9340 });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('找到了中继但本页没有被接受过：多半是允许的页面地址不一致', async () => {
    const status = await checkRelayLink({
      origin: ORIGIN,
      storage: storageWith({}),
      probe: (port) => Promise.resolve(port === RELAY_DEFAULT_PORT),
    });
    expect(status).toEqual({ state: 'not-linked', port: RELAY_DEFAULT_PORT });
  });

  it('默认端口上没有中继：未找到', async () => {
    const status = await checkRelayLink({
      origin: ORIGIN,
      storage: storageWith({}),
      probe: () => Promise.resolve(false),
    });
    expect(status).toEqual({ state: 'not-found', port: null });
  });

  it('以前接入过的中继已经停了：回到默认端口再找，找不到就是未找到', async () => {
    const probe = vi.fn((_port: number) => Promise.resolve(false));
    const status = await checkRelayLink({
      origin: ORIGIN,
      storage: storageWith({
        [relayEndpointStorageKey(ORIGIN)]: JSON.stringify({ host: '127.0.0.1', port: 9340 }),
      }),
      probe,
    });
    expect(status).toEqual({ state: 'not-found', port: null });
    expect(probe.mock.calls.map((call) => call[0])).toEqual([9340, RELAY_DEFAULT_PORT]);
  });

  it('已接入记录损坏或读不到存储时当作没有记录', async () => {
    const broken = await checkRelayLink({
      origin: ORIGIN,
      storage: storageWith({ [relayEndpointStorageKey(ORIGIN)]: '{oops' }),
      probe: () => Promise.resolve(true),
    });
    expect(broken.state).toBe('not-linked');

    const throwing = await checkRelayLink({
      origin: ORIGIN,
      storage: {
        getItem: () => {
          throw new Error('denied');
        },
      },
      probe: () => Promise.resolve(false),
    });
    expect(throwing.state).toBe('not-found');
  });

  it('探测：用发现协议连接，收到中继的问候即认为在运行，随后关闭连接', async () => {
    const result = probeRelay(9333, { createSocket, timeoutMs: 1000 });
    const socket = FakeSocket.last!;
    expect(socket.url).toBe('ws://127.0.0.1:9333');
    expect(socket.protocols).toEqual(['webmcp-discovery.v1']);
    socket.emit('message', 'not json');
    socket.emit('message', JSON.stringify({ type: 'something-else' }));
    socket.emit(
      'message',
      JSON.stringify({ type: 'server-hello', service: 'webmcp-local-relay', version: 1 }),
    );
    await expect(result).resolves.toBe(true);
    expect(socket.closed).toBe(true);
  });

  it('探测：连接失败、被关闭、超时或端口上是别的服务，都算没有中继', async () => {
    const failed = probeRelay(9333, { createSocket, timeoutMs: 1000 });
    FakeSocket.last!.emit('error');
    await expect(failed).resolves.toBe(false);

    const closed = probeRelay(9333, { createSocket, timeoutMs: 1000 });
    FakeSocket.last!.emit('close');
    await expect(closed).resolves.toBe(false);

    vi.useFakeTimers();
    const silent = probeRelay(9333, { createSocket, timeoutMs: 1000 });
    const silentSocket = FakeSocket.last!;
    silentSocket.emit('message', JSON.stringify({ type: 'server-hello', service: 'other' }));
    vi.advanceTimersByTime(1000);
    await expect(silent).resolves.toBe(false);
    expect(silentSocket.closed).toBe(true);
    vi.useRealTimers();

    // 创建连接本身抛错（例如被浏览器策略拦截）
    const blocked = await probeRelay(9333, {
      createSocket: () => {
        throw new Error('blocked');
      },
    });
    expect(blocked).toBe(false);
  });
});
