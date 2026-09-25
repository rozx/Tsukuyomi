/**
 * 记录页面主框架文档导航响应的最后一个 HTTP 状态码。
 *
 * Puppeteer stealth 可能先收到 403 质询、随后由浏览器解决并跳转到 200 的正文页；
 * 取「最后一次」主框架导航响应，才能区分「质询已解决」与「持续被拦截」。
 */

interface NavigationResponse {
  status(): number;
  request(): { isNavigationRequest(): boolean; frame(): unknown };
}

interface ResponseSource<R extends NavigationResponse> {
  mainFrame(): unknown;
  on(event: 'response', handler: (response: R) => void): unknown;
  off(event: 'response', handler: (response: R) => void): unknown;
}

export function trackMainFrameStatus<R extends NavigationResponse>(
  page: ResponseSource<R>,
): { current(): number | undefined; dispose(): void } {
  let last: number | undefined;
  const handler = (response: R) => {
    const request = response.request();
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
    last = response.status();
  };
  page.on('response', handler);
  return {
    current: () => last,
    dispose: () => {
      page.off('response', handler);
    },
  };
}
