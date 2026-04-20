import type * as cheerio from 'cheerio';

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
export function extractParagraphText(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: cheerio.Cheerio<any>,
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

    if (tagName === 'br') {
      text += '\n';
    } else if (tagName === 'p') {
      const innerText = extractParagraphText($, $node);
      text += innerText.trim() ? innerText + '\n' : '\n';
    } else {
      const innerText = extractParagraphText($, $node);
      if (innerText) text += innerText;
    }
  });

  return text;
}

/**
 * 简介/描述文本提取：处理 `<br>` 为换行，跳过 `<a name="img">` 图片链接，
 * 其它标签递归提取原文。用于 syosetu.org 的 `.ss` 描述区块。
 */
export function extractDescriptionText(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: cheerio.Cheerio<any>,
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

    if (tagName === 'br') {
      text += '\n';
      return;
    }
    if (tagName === 'a' && $node.attr('name') === 'img') {
      // 跳过图片链接标记（如【挿絵表示】）
      return;
    }
    const innerText = extractDescriptionText($, $node);
    if (innerText) text += innerText;
  });

  return text;
}

/**
 * 无 `<p>` 标签时的正文兜底提取：把 `<p>` / `<div>` 视为行容器，
 * 纯文本节点原样追加，`<br>` 换行。
 *
 * 用于 ncode.syosetu.com 某些章节页面把正文直接放在 `#novel_honbun` 下、
 * 不使用 `<p>` 包裹的场景；syosetu.org 旧排版也会走这条分支。
 */
export function extractTextWithFormatting(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: cheerio.Cheerio<any>,
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

    if (tagName === 'br') {
      text += '\n';
    } else if (tagName === 'p' || tagName === 'div') {
      const innerText = extractTextWithFormatting($, $node);
      if (innerText.trim()) {
        text += innerText;
        if (tagName === 'p') text += '\n';
      } else if (tagName === 'p') {
        text += '\n';
      }
    } else {
      const innerText = extractTextWithFormatting($, $node);
      if (innerText.trim()) text += innerText;
    }
  });

  return text;
}
