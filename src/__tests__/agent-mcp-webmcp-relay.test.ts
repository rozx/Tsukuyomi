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
