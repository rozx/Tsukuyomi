import { describe, expect, it } from 'vitest';
import { detectBrowserKind } from 'src/utils/browser-kind';

describe('detectBrowserKind', () => {
  it('按 UA 区分 Edge、Chrome、Firefox、Safari，其余归为 other', () => {
    expect(
      detectBrowserKind(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
      ),
    ).toBe('edge');
    expect(
      detectBrowserKind(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      ),
    ).toBe('chrome');
    expect(
      detectBrowserKind('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'),
    ).toBe('firefox');
    expect(
      detectBrowserKind(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
      ),
    ).toBe('safari');
    // iOS 上的 Chrome / Firefox 用的是 Safari 内核，没有各自的实验开关
    expect(
      detectBrowserKind(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.0.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('safari');
    // Opera 等其他 Chromium 浏览器不套用 Chrome 的开关说明
    expect(
      detectBrowserKind(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 OPR/120.0.0.0',
      ),
    ).toBe('other');
    expect(detectBrowserKind('')).toBe('other');
  });
});
