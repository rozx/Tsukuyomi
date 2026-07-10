/**
 * useMarkdownRenderer 回归测试：
 * 1. 相同 Markdown 文本重复渲染必须命中缓存（marked.parse 只解析一次），
 *    修复流式输出时每个 token 触发整段 O(n²) 重解析的问题；
 * 2. 外部链接必须强制 target="_blank" + rel="noopener noreferrer"，
 *    避免 Electron 窗口被链接导航劫持；
 * 3. useThrottledMarkdown 在流式追加内容时按节流频率渲染，且流结束后
 *    最终渲染结果与完整文本完全一致（不丢尾部）。
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { effectScope, ref } from 'vue';
import { marked } from 'marked';
import { useMarkdownRenderer, useThrottledMarkdown } from 'src/composables/chat/useMarkdownRenderer';

describe('useMarkdownRenderer 缓存', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('相同文本重复渲染只解析一次（缓存命中）', () => {
    const parseSpy = vi.spyOn(marked, 'parse');
    const { renderMarkdown } = useMarkdownRenderer();
    const text = '# 缓存测试标题\n\n这是一段 **加粗** 文本。';

    const first = renderMarkdown(text);
    const second = renderMarkdown(text);

    expect(first).toContain('缓存测试标题');
    expect(second).toBe(first);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it('不同文本各自解析且互不污染', () => {
    const { renderMarkdown } = useMarkdownRenderer();
    const a = renderMarkdown('文本甲 alpha');
    const b = renderMarkdown('文本乙 beta');
    expect(a).toContain('alpha');
    expect(b).toContain('beta');
    expect(a).not.toBe(b);
  });

  it('跨 composable 实例共享缓存（同一文本仍只解析一次）', () => {
    const text = '跨实例缓存测试 unique-string-xyz';
    const first = useMarkdownRenderer().renderMarkdown(text);
    const parseSpy = vi.spyOn(marked, 'parse');
    const second = useMarkdownRenderer().renderMarkdown(text);
    expect(second).toBe(first);
    expect(parseSpy).not.toHaveBeenCalled();
  });
});

describe('useMarkdownRenderer 链接安全属性', () => {
  it('外部链接强制 target="_blank" 和 rel="noopener noreferrer"', () => {
    const { renderMarkdown } = useMarkdownRenderer();
    const html = renderMarkdown('[示例链接](https://example.com/page)');
    expect(html).toContain('href="https://example.com/page"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('多个链接全部带安全属性', () => {
    const { renderMarkdown } = useMarkdownRenderer();
    const html = renderMarkdown('[甲](https://a.example) 与 [乙](https://b.example)');
    const matches = html.match(/target="_blank"/g) ?? [];
    expect(matches.length).toBe(2);
    expect((html.match(/rel="noopener noreferrer"/g) ?? []).length).toBe(2);
  });
});

describe('useThrottledMarkdown 流式节流渲染', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('流式追加 token 时渲染次数受节流限制，最终内容完整', () => {
    vi.useFakeTimers();
    const text = ref('token0');
    let renderCount = 0;
    const render = (t: string) => {
      renderCount++;
      return `<p>${t}</p>`;
    };

    const scope = effectScope();
    let html!: ReturnType<typeof useThrottledMarkdown>;
    scope.run(() => {
      html = useThrottledMarkdown(() => text.value, render, 120);
    });

    // 初始内容立即渲染（leading）
    expect(html.value).toBe('<p>token0</p>');
    expect(renderCount).toBe(1);

    // 连续 30 个 token 在节流窗口内到达
    for (let i = 1; i <= 30; i++) {
      text.value += ` token${i}`;
    }
    // 窗口内不应逐 token 渲染
    expect(renderCount).toBe(1);

    // 节流窗口结束后 trailing 渲染出最终完整文本（不丢尾部）
    vi.advanceTimersByTime(120);
    expect(renderCount).toBe(2);
    expect(html.value).toBe(`<p>${text.value}</p>`);

    scope.stop();
  });

  it('内容清空时立即清空渲染结果', () => {
    vi.useFakeTimers();
    const text = ref('有内容');
    const scope = effectScope();
    let html!: ReturnType<typeof useThrottledMarkdown>;
    scope.run(() => {
      html = useThrottledMarkdown(() => text.value, (t) => `<p>${t}</p>`, 120);
    });
    expect(html.value).toBe('<p>有内容</p>');
    text.value = '';
    expect(html.value).toBe('');
    scope.stop();
  });

  it('作用域销毁后不再触发挂起的 trailing 渲染', () => {
    vi.useFakeTimers();
    const text = ref('a');
    let renderCount = 0;
    const scope = effectScope();
    scope.run(() => {
      useThrottledMarkdown(
        () => text.value,
        (t) => {
          renderCount++;
          return t;
        },
        120,
      );
    });
    expect(renderCount).toBe(1);
    text.value = 'ab';
    scope.stop();
    vi.advanceTimersByTime(500);
    expect(renderCount).toBe(1);
  });
});
