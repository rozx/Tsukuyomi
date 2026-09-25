import './setup';
import { describe, expect, it } from 'vitest';
import { trackMainFrameStatus } from '../../src-electron/main-frame-status';

type Handler = (response: FakeResponse) => void;

interface FakeResponse {
  status(): number;
  request(): { isNavigationRequest(): boolean; frame(): unknown };
}

function fakePage() {
  const mainFrame = { name: 'main' };
  const handlers = new Set<Handler>();
  return {
    mainFrame: () => mainFrame,
    on: (_event: 'response', handler: Handler) => handlers.add(handler),
    off: (_event: 'response', handler: Handler) => handlers.delete(handler),
    emit(status: number, options: { navigation?: boolean; frame?: unknown } = {}) {
      const response: FakeResponse = {
        status: () => status,
        request: () => ({
          isNavigationRequest: () => options.navigation ?? true,
          frame: () => options.frame ?? mainFrame,
        }),
      };
      for (const handler of handlers) handler(response);
    },
    handlerCount: () => handlers.size,
  };
}

describe('trackMainFrameStatus', () => {
  it('质询被浏览器解决（403 → 200）时报告最后一次主框架状态 200', () => {
    const page = fakePage();
    const tracker = trackMainFrameStatus(page);
    page.emit(403);
    page.emit(200);
    expect(tracker.current()).toBe(200);
  });

  it('持续 403 时报告 403', () => {
    const page = fakePage();
    const tracker = trackMainFrameStatus(page);
    page.emit(403);
    expect(tracker.current()).toBe(403);
  });

  it('忽略子框架与非导航请求', () => {
    const page = fakePage();
    const tracker = trackMainFrameStatus(page);
    page.emit(404);
    page.emit(500, { frame: { name: 'iframe' } });
    page.emit(503, { navigation: false });
    expect(tracker.current()).toBe(404);
  });

  it('没有主框架响应时为 undefined，dispose 后移除监听', () => {
    const page = fakePage();
    const tracker = trackMainFrameStatus(page);
    expect(tracker.current()).toBeUndefined();
    tracker.dispose();
    expect(page.handlerCount()).toBe(0);
  });
});
