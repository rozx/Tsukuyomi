import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue';
import { throttle } from 'src/utils/throttle';

marked.setOptions({
  breaks: true,
  gfm: true,
});

// 使用独立的 DOMPurify 实例，避免下面的链接 hook 影响其他模块
// （如帮助页）对默认实例的 sanitize 行为。
const purifier = DOMPurify(window);

// 外部链接安全：强制在新窗口打开并携带 noopener noreferrer，
// 防止聊天内容里的链接直接导航 Electron 主窗口（或 SPA 页面）。
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// 渲染结果 LRU 缓存：同一段 Markdown 文本（如已完成的历史消息）只解析一次，
// 避免消息列表任何一次重渲染都对全部消息重复执行 marked.parse + DOMPurify.sanitize。
const RENDER_CACHE_MAX = 200;
const renderCache = new Map<string, string>();

const renderMarkdownRaw = (text: string): string => {
  try {
    const html = marked.parse(text) as string;
    return purifier.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'code',
        'pre',
        'ul',
        'ol',
        'li',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'a',
        'hr',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
      ],
      ALLOWED_ATTR: ['href', 'title', 'alt', 'class', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    });
  } catch (error) {
    console.error('Markdown rendering error:', error);
    return purifier.sanitize(text, { ALLOWED_TAGS: [] });
  }
};

const renderMarkdownCached = (text: string): string => {
  if (!text) return '';
  const cached = renderCache.get(text);
  if (cached !== undefined) {
    // LRU：命中后刷新为最近使用
    renderCache.delete(text);
    renderCache.set(text, cached);
    return cached;
  }
  const html = renderMarkdownRaw(text);
  renderCache.set(text, html);
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  return html;
};

export const useMarkdownRenderer = () => {
  return {
    renderMarkdown: renderMarkdownCached,
  };
};

/**
 * 流式消息的节流 Markdown 渲染：
 * 流式输出期间每个 token 都会让消息内容变长，若逐 token 全量重解析，
 * 整条流的总解析开销是 O(n²)。这里以 leading + trailing 节流（默认 120ms，
 * 与 useThinkingDisplay 的节奏一致）限制解析频率，trailing 保证流结束后
 * 最终渲染结果与完整文本严格一致（不丢尾部）。
 */
export function useThrottledMarkdown(
  source: () => string,
  render: (text: string) => string,
  delay = 120,
): Ref<string> {
  const html = ref('');
  const throttled = throttle((text: string) => {
    html.value = render(text);
  }, delay);

  watch(
    source,
    (text) => {
      if (!text) {
        // 内容清空（如条目被复用为非 content 类型）时立即清空并丢弃挂起的渲染
        throttled.cleanup();
        html.value = '';
        return;
      }
      throttled.fn(text);
    },
    { immediate: true, flush: 'sync' },
  );

  // 组件卸载/作用域销毁时清理挂起的 trailing 定时器
  if (getCurrentScope()) {
    onScopeDispose(throttled.cleanup);
  }

  return html;
}
