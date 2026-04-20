import type * as cheerio from 'cheerio';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioNode = cheerio.Cheerio<any>;

/**
 * 根据当前标签决定本节点贡献的文本：
 * - 返回具体字符串即追加
 * - 调用 recurse() 可递归处理子节点
 */
type TagHandler = (params: { $node: CheerioNode; tagName: string; recurse: () => string }) => string;

/**
 * 遍历 Cheerio 元素的 contents：
 * - 文本节点：原样追加 $(node).text()
 * - 标签节点：交给 handleTag 决定（可通过 recurse 递归进入子元素）
 * 其它类型节点忽略。
 */
function visitCheerioContents(
  $: cheerio.CheerioAPI,
  element: CheerioNode,
  handleTag: TagHandler,
): string {
  let text = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element.contents().each((_, node: any) => {
    const nodeType = String(node.type);
    if (nodeType === 'text') {
      text += $(node).text();
      return;
    }
    if (nodeType !== 'tag') return;

    const $node = $(node);
    const tagName = node.tagName?.toLowerCase() || '';
    text += handleTag({
      $node,
      tagName,
      recurse: () => visitCheerioContents($, $node, handleTag),
    });
  });

  return text;
}

/**
 * 从 Cheerio 元素递归提取段落纯文本，保留 `<br>` 换行。
 *
 * - 文本节点：原样追加
 * - `<br>`：换行
 * - 嵌套 `<p>`：递归提取并在末尾追加换行（空 `<p>` 也换行）
 * - 其它标签：递归提取内容（不加换行）
 *
 * syosetu.org / ncode.syosetu.com 两个站点的正文解析共用此实现。
 */
export function extractParagraphText($: cheerio.CheerioAPI, element: CheerioNode): string {
  return visitCheerioContents($, element, ({ tagName, recurse }) => {
    if (tagName === 'br') return '\n';
    if (tagName === 'p') {
      const inner = recurse();
      return inner.trim() ? inner + '\n' : '\n';
    }
    return recurse();
  });
}

/**
 * 简介/描述文本提取：处理 `<br>` 为换行，跳过 `<a name="img">` 图片链接，
 * 其它标签递归提取原文。用于 syosetu.org 的 `.ss` 描述区块。
 */
export function extractDescriptionText($: cheerio.CheerioAPI, element: CheerioNode): string {
  return visitCheerioContents($, element, ({ $node, tagName, recurse }) => {
    if (tagName === 'br') return '\n';
    if (tagName === 'a' && $node.attr('name') === 'img') {
      // 跳过图片链接标记（如【挿絵表示】）
      return '';
    }
    return recurse();
  });
}

/**
 * 无 `<p>` 标签时的正文兜底提取：把 `<p>` / `<div>` 视为行容器，
 * 纯文本节点原样追加，`<br>` 换行。
 *
 * 用于 ncode.syosetu.com 某些章节页面把正文直接放在 `#novel_honbun` 下、
 * 不使用 `<p>` 包裹的场景；syosetu.org 旧排版也会走这条分支。
 */
export function extractTextWithFormatting($: cheerio.CheerioAPI, element: CheerioNode): string {
  return visitCheerioContents($, element, ({ tagName, recurse }) => {
    if (tagName === 'br') return '\n';
    if (tagName === 'p' || tagName === 'div') {
      const inner = recurse();
      if (inner.trim()) {
        return tagName === 'p' ? inner + '\n' : inner;
      }
      return tagName === 'p' ? '\n' : '';
    }
    const inner = recurse();
    return inner.trim() ? inner : '';
  });
}
