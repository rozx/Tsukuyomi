// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebMcpRelayBridge,
  WEBMCP_RELAY_EMBED_PATH,
} from 'src/services/agent-mcp/webmcp-relay';

function fakeRuntime() {
  return {
    initializeWebModelContext: vi.fn(),
    cleanupWebModelContext: vi.fn(),
  };
}

describe('WebMCP local relay bridge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('script[data-agent-mcp-relay]').forEach((el) => el.remove());
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    delete (window as { __webModelContextOptions?: unknown }).__webModelContextOptions;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('开启时先关闭运行时的自动初始化，再以本页来源初始化，并注入一次中继脚本', async () => {
    const runtime = fakeRuntime();
    const loadRuntime = vi.fn(() => {
      // 运行时模块一旦加载就会自动初始化；必须在加载前关闭，才能传入受限的来源配置
      expect(
        (window as { __webModelContextOptions?: { autoInitialize?: boolean } })
          .__webModelContextOptions?.autoInitialize,
      ).toBe(false);
      return Promise.resolve(runtime);
    });
    const bridge = createWebMcpRelayBridge({ loadRuntime, baseUrl: '/app/' });

    expect(await bridge.enable()).toBe('enabled');
    expect(runtime.initializeWebModelContext).toHaveBeenCalledWith({
      transport: { tabServer: { allowedOrigins: [window.location.origin] } },
    });
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[data-agent-mcp-relay]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.getAttribute('src')).toBe(`/app/${WEBMCP_RELAY_EMBED_PATH}`);

    // 重复开启不重复加载、不重复注入
    expect(await bridge.enable()).toBe('enabled');
    expect(loadRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.initializeWebModelContext).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('script[data-agent-mcp-relay]')).toHaveLength(1);
    expect(bridge.isEnabled()).toBe(true);
  });

  it('关闭时移除中继脚本与中继 iframe，并清理运行时；之后可以重新开启', async () => {
    const runtime = fakeRuntime();
    const bridge = createWebMcpRelayBridge({ loadRuntime: () => Promise.resolve(runtime) });
    await bridge.enable();

    // 模拟 embed.js 注入的隐藏 iframe
    const frame = document.createElement('iframe');
    frame.setAttribute('data-webmcp-relay', '1');
    document.body.appendChild(frame);

    bridge.disable();
    expect(document.querySelector('script[data-agent-mcp-relay]')).toBeNull();
    expect(document.querySelector('[data-webmcp-relay]')).toBeNull();
    expect(runtime.cleanupWebModelContext).toHaveBeenCalledTimes(1);
    expect(bridge.isEnabled()).toBe(false);

    // 未开启时再次关闭是空操作
    bridge.disable();
    expect(runtime.cleanupWebModelContext).toHaveBeenCalledTimes(1);

    expect(await bridge.enable()).toBe('enabled');
    expect(runtime.initializeWebModelContext).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('script[data-agent-mcp-relay]')).toHaveLength(1);
  });

  it('开启还没完成就被关闭：不初始化运行时、不留下中继脚本；之后可以重新开启', async () => {
    const runtime = fakeRuntime();
    let finishLoad: (value: ReturnType<typeof fakeRuntime>) => void = () => undefined;
    const loadRuntime = vi.fn(
      () =>
        new Promise<ReturnType<typeof fakeRuntime>>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const bridge = createWebMcpRelayBridge({
      loadRuntime,
      baseUrl: '/',
      detectLegacyNative: () => Promise.resolve(false),
    });

    const pending = bridge.enable();
    await vi.waitFor(() => expect(loadRuntime).toHaveBeenCalledTimes(1));
    bridge.disable();
    finishLoad(runtime);

    expect(await pending).toBe('idle');
    expect(bridge.isEnabled()).toBe(false);
    expect(runtime.initializeWebModelContext).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-agent-mcp-relay]')).toBeNull();

    // 被取消的那次开启不影响下一次
    loadRuntime.mockImplementation(() => Promise.resolve(runtime));
    expect(await bridge.enable()).toBe('enabled');
    expect(runtime.initializeWebModelContext).toHaveBeenCalledTimes(1);
  });

  it('页面不在安全上下文时不加载运行时，返回 insecure', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const loadRuntime = vi.fn(() => Promise.resolve(fakeRuntime()));
    const bridge = createWebMcpRelayBridge({ loadRuntime });

    expect(await bridge.enable()).toBe('insecure');
    expect(loadRuntime).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-agent-mcp-relay]')).toBeNull();
    expect(bridge.isEnabled()).toBe(false);
  });

  it('运行时加载或初始化失败时返回 failed，不留下中继脚本', async () => {
    const bridge = createWebMcpRelayBridge({
      loadRuntime: () => Promise.reject(new Error('chunk load failed')),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await bridge.enable()).toBe('failed');
    expect(document.querySelector('script[data-agent-mcp-relay]')).toBeNull();
    expect(bridge.isEnabled()).toBe(false);
  });

  describe('浏览器自带旧版 WebMCP（实验开关开启、工具参数结构以字符串返回）', () => {
    /** 在 Document.prototype 上装一个模拟的原生实现；legacy 为 true 时 getTools 返回字符串形式的 inputSchema */
    function installFakeNative(legacy: boolean, configurable = true) {
      const registered = new Map<string, { inputSchema: unknown; signal?: AbortSignal }>();
      const native = {
        registerTool: vi.fn(
          (tool: { name: string; inputSchema: unknown }, options?: { signal?: AbortSignal }) => {
            registered.set(tool.name, {
              inputSchema: tool.inputSchema,
              ...(options?.signal ? { signal: options.signal } : {}),
            });
            options?.signal?.addEventListener('abort', () => registered.delete(tool.name));
            return Promise.resolve();
          },
        ),
        getTools: vi.fn(() =>
          Promise.resolve(
            [...registered].map(([name, tool]) => ({
              name,
              inputSchema: legacy ? JSON.stringify(tool.inputSchema) : tool.inputSchema,
            })),
          ),
        ),
      };
      Object.defineProperty(Document.prototype, 'modelContext', {
        configurable,
        enumerable: true,
        get: () => native,
      });
      return { native, registered };
    }

    afterEach(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'modelContext');
      if (descriptor?.configurable)
        delete (Document.prototype as { modelContext?: unknown }).modelContext;
    });

    it('探测到旧版原生接口时在本页移除它，让运行时改用 polyfill，中继照常开启', async () => {
      const { native, registered } = installFakeNative(true);
      const runtime = fakeRuntime();
      runtime.initializeWebModelContext.mockImplementation(() => {
        // 运行时初始化时原生接口必须已经让位，否则 polyfill 不会安装
        expect('modelContext' in document).toBe(false);
      });
      const bridge = createWebMcpRelayBridge({ loadRuntime: () => Promise.resolve(runtime) });

      expect(await bridge.enable()).toBe('enabled');
      expect(native.getTools).toHaveBeenCalled();
      // 探测用的临时工具用完即注销，不留在浏览器里
      expect(registered.size).toBe(0);
      expect(runtime.initializeWebModelContext).toHaveBeenCalledTimes(1);
      expect(document.querySelectorAll('script[data-agent-mcp-relay]')).toHaveLength(1);
    });

    it('原生接口是新版（参数结构为对象）时保持不动', async () => {
      installFakeNative(false);
      const runtime = fakeRuntime();
      const bridge = createWebMcpRelayBridge({ loadRuntime: () => Promise.resolve(runtime) });

      expect(await bridge.enable()).toBe('enabled');
      expect('modelContext' in document).toBe(true);
    });

    it('旧版原生接口无法移除时不加载运行时，返回 legacy-native 供界面提示', async () => {
      const loadRuntime = vi.fn(() => Promise.resolve(fakeRuntime()));
      const bridge = createWebMcpRelayBridge({
        loadRuntime,
        detectLegacyNative: () => Promise.resolve(true),
        removeLegacyNative: () => false,
      });

      expect(await bridge.enable()).toBe('legacy-native');
      expect(loadRuntime).not.toHaveBeenCalled();
      expect(document.querySelector('script[data-agent-mcp-relay]')).toBeNull();
      expect(bridge.isEnabled()).toBe(false);
    });

    it('只探测一次：关闭后再次开启不重复注册探测工具', async () => {
      const detectLegacyNative = vi.fn(() => Promise.resolve(false));
      const bridge = createWebMcpRelayBridge({
        loadRuntime: () => Promise.resolve(fakeRuntime()),
        detectLegacyNative,
      });
      await bridge.enable();
      bridge.disable();
      await bridge.enable();
      expect(detectLegacyNative).toHaveBeenCalledTimes(1);
    });
  });

  it('public/ 下随应用分发的中继文件与已安装的中继包完全一致', () => {
    const root = resolve(__dirname, '../..');
    for (const file of ['embed.js', 'widget.html']) {
      const vendored = readFileSync(resolve(root, 'public/webmcp-relay', file));
      const packaged = readFileSync(
        resolve(root, 'node_modules/@mcp-b/webmcp-local-relay/dist/browser', file),
      );
      expect(vendored.equals(packaged), `${file} 与中继包不一致，升级后需要重新复制`).toBe(true);
    }
    // 中继脚本与页面运行时必须同一主版本
    const major = (name: string) =>
      (
        JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version.split('.')[0];
    expect(major('@mcp-b/webmcp-local-relay')).toBe(major('@mcp-b/global'));
  });
});
