import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { ImportExtractionRules, ImportTextBlock } from 'src/models/import';
import type { ImportParsedContent } from 'src/models/import-parsing';

type HtmlNode = ReturnType<CheerioAPI['root']>[number]['children'][number];
type Block = Omit<ImportTextBlock, 'id'>;
type HtmlElement = Extract<HtmlNode, { name: string }>;
function isElement(node: HtmlNode | HtmlNode['parent']): node is HtmlElement {
  return Boolean(node && 'name' in node);
}
function isText(node: HtmlNode): node is Extract<HtmlNode, { data: string }> {
  return String(node.type) === 'text' && 'data' in node;
}

const BODY_PRESETS: Record<string, string[]> = {
  ncode: ['.p-novel__body > .p-novel__text', '#novel_honbun'],
  kakuyomu: [
    '.widget-episodeBody',
    '[class*="widget-episodeBody"]',
    '.episodeBody',
    '[class*="episodeBody"]',
  ],
  syosetu: [
    '#honbun',
    '#novel_honbun',
    '.novel_honbun',
    '#novel_content',
    '.novel_content',
    'div.ss',
  ],
};
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'li',
  'blockquote',
  'pre',
  'aside',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
const EXCLUDED =
  'head, script, style, noscript, nav, form, .navigation, .nav, .menu, .ad, .ads, .advertisement, .recommend, .recommendation, [epub\\:type~="toc"], [epub\\:type~="copyright-page"], .copyright';
const METADATA =
  'time, meta, [itemprop="datePublished"], [itemprop="dateModified"], .p-novel__author, .widget-episodeDate';

function nodeName(node: HtmlNode): string {
  return 'name' in node ? node.name.toLowerCase() : '';
}

function safeLink(href: string | undefined, baseUrl?: string): string | undefined {
  if (!href?.trim()) return undefined;
  const value = href.trim();
  try {
    if (!baseUrl && !/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
    const parsed = new URL(value, baseUrl);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

function metadata($: CheerioAPI, baseUrl?: string): Record<string, string> {
  const fields: Record<string, string | undefined> = {
    title:
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text() ||
      $('title').first().text(),
    author:
      $('meta[name="author"], meta[property="book:author"]').first().attr('content') ||
      $('.p-novel__author, [itemprop="author"]')
        .first()
        .text()
        .replace(/^作者[：:]\s*/, ''),
    description: $('meta[name="description"], meta[property="og:description"]')
      .first()
      .attr('content'),
    cover: safeLink(
      $('meta[property="og:image"]').attr('content') ||
        $('link[rel="image_src"]').attr('href') ||
        $('[epub\\:type~="cover"] img, img.cover').first().attr('src'),
      baseUrl,
    ),
  };
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value?.trim())
      .map(([key, value]) => [key, value!.trim()]),
  );
}

function links($: CheerioAPI, baseUrl?: string): ImportParsedContent['links'] {
  const found: ImportParsedContent['links'] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, node) => {
    const element = $(node);
    const href = safeLink(element.attr('href'), baseUrl);
    if (!href || seen.has(href)) return;
    seen.add(href);
    const name = element.text().trim() || href;
    const relation = element.closest('.ad, .ads, .recommend, .recommendation').length
      ? 'metadata'
      : /\bnext\b/i.test(element.attr('rel') ?? '') || /下一[页章]|次のページ|次へ|next/i.test(name)
        ? 'next'
        : /^(目录|目次|table of contents)$/i.test(name)
          ? 'catalog'
          : element.closest('nav, .toc, .p-eplist, .index_box, [epub\\:type~="toc"]').length
            ? 'chapter'
            : 'unknown';
    found.push({ name, href, relation });
  });
  return found;
}

function locate(node: HtmlNode): string {
  const parts: string[] = [];
  let current: HtmlNode | null = node;
  while (current && nodeName(current)) {
    const name = nodeName(current);
    const parent: HtmlNode['parent'] = current.parent;
    const siblings = parent?.children.filter((sibling) => nodeName(sibling) === name) ?? [current];
    parts.unshift(`${name}:nth-of-type(${siblings.indexOf(current) + 1})`);
    current = isElement(parent) ? parent : null;
  }
  return parts.join(' > ');
}

function blockKind($: CheerioAPI, node: HtmlNode): Block['kind'] {
  const element = $(node);
  if (
    element.closest('.p-novel__text--preface, #novel_p, [epub\\:type~="preface"], .preface').length
  )
    return 'preface';
  if (
    element.closest('.p-novel__text--afterword, #novel_a, [epub\\:type~="afterword"], .afterword')
      .length
  )
    return 'afterword';
  if (
    element.closest('[epub\\:type~="footnote"], [epub\\:type~="endnote"], .footnote, .notes').length
  )
    return 'note';
  return /^h[1-6]$/.test(nodeName(node)) ? 'heading' : 'body';
}

function selectedRoots(
  $: CheerioAPI,
  rules: ImportExtractionRules,
): { nodes: HtmlNode[]; preset: boolean } {
  if (rules.selector) return { nodes: $(rules.selector).toArray(), preset: false };
  const selectors =
    rules.preset && rules.preset !== 'auto'
      ? BODY_PRESETS[rules.preset]
      : Object.values(BODY_PRESETS).flat();
  if (!selectors) throw new Error('INVALID_PRESET: 未知的提取规则');
  for (const selector of selectors) {
    const nodes = $(selector).toArray();
    if (nodes.length) return { nodes, preset: true };
  }
  const fallback = $('article').length ? $('article') : $('main').length ? $('main') : $('body');
  return {
    nodes: fallback.length ? fallback.toArray() : $.root().contents().toArray(),
    preset: false,
  };
}

function excludedReason(
  $: CheerioAPI,
  node: HtmlNode,
  rules: ImportExtractionRules,
): string | undefined {
  const element = $(node);
  for (const selector of rules.excludeSelectors ?? [])
    if (element.is(selector)) return `用户指定排除 ${selector}`;
  if (element.is(METADATA)) return '元信息';
  if (element.is(EXCLUDED)) return `排除 ${nodeName(node)} 导航、脚本或非正文资源`;
  return undefined;
}

function extractBlocks(
  $: CheerioAPI,
  html: string,
  roots: HtmlNode[],
  rules: ImportExtractionRules,
): Pick<ImportParsedContent, 'blocks' | 'excluded'> {
  const blocks: Block[] = [];
  const excluded: ImportParsedContent['excluded'] = [];
  const selected = new Set(roots);
  function visit(node: HtmlNode, inheritedKind: Block['kind']): void {
    const reason = excludedReason($, node, rules);
    if (reason) {
      if (node.startIndex !== null && node.endIndex !== null) {
        excluded.push({
          start: node.startIndex,
          end: node.endIndex + 1,
          text: html.slice(node.startIndex, node.endIndex + 1),
          reason,
        });
      }
      return;
    }
    const kind = nodeName(node) ? blockKind($, node) : inheritedKind;
    if (!('children' in node)) {
      if (isText(node) && node.data)
        blocks.push({
          start: node.startIndex ?? 0,
          end: (node.endIndex ?? html.length - 1) + 1,
          text: node.data,
          kind: node.data.trim() ? kind : 'whitespace',
          locator: locate(isElement(node.parent) ? node.parent : node),
        });
      return;
    }
    let text = '';
    let start = node.startIndex ?? 0;
    let end = start;
    const flush = () => {
      if (text)
        blocks.push({
          start,
          end,
          text,
          kind: text.trim() ? kind : 'whitespace',
          locator: locate(node),
        });
      text = '';
    };
    const inline = (child: HtmlNode): void => {
      const excludedAt = excludedReason($, child, rules);
      if (excludedAt) {
        visit(child, kind);
        return;
      }
      if (BLOCK_TAGS.has(nodeName(child))) {
        flush();
        visit(child, kind);
        return;
      }
      if (!text) start = child.startIndex ?? start;
      end = (child.endIndex ?? end - 1) + 1;
      if (isText(child)) text += child.data;
      else if (nodeName(child) === 'br') text += '\n';
      else if ('children' in child) child.children.forEach(inline);
    };
    node.children.forEach(inline);
    if (
      !text &&
      nodeName(node) === 'p' &&
      !node.children.some((child) => BLOCK_TAGS.has(nodeName(child)))
    ) {
      blocks.push({
        start: node.startIndex ?? 0,
        end: (node.endIndex ?? html.length - 1) + 1,
        text: '',
        kind: 'whitespace',
        locator: locate(node),
      });
    }
    flush();
  }
  for (const root of roots) {
    let ancestor = root.parent;
    let nested = false;
    while (ancestor) {
      if (isElement(ancestor) && selected.has(ancestor)) {
        nested = true;
        break;
      }
      ancestor = ancestor.parent;
    }
    if (!nested) visit(root, 'body');
  }
  return { blocks, excluded };
}

function classifyPage(
  $: CheerioAPI,
  verification: boolean,
  hasBody: boolean,
  foundLinks: ImportParsedContent['links'],
): ImportParsedContent['kind'] {
  if (verification) return 'verification';
  if (hasBody) return 'content';
  if ($('[epub\\:type~="copyright-page"], .copyright').length) return 'copyright';
  if (foundLinks.some((link) => link.relation === 'chapter')) return 'catalog';
  if ($('[epub\\:type~="cover"], img.cover').length) return 'cover';
  if ($('#app, #root, #__next').length && $('script').length) return 'dynamic';
  return 'empty';
}

/** 只解析传入字符串，不执行脚本，也不加载图片或后续链接。 */
export function parseImportHtml(
  html: string,
  rules: ImportExtractionRules = {},
  baseUrl?: string,
): ImportParsedContent {
  const $ = load(html, { xml: { xmlMode: false, withStartIndices: true, withEndIndices: true } });
  let selected: ReturnType<typeof selectedRoots>;
  try {
    for (const selector of rules.excludeSelectors ?? []) $(selector);
    selected = selectedRoots($, rules);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('INVALID_PRESET')) throw error;
    throw new Error('INVALID_SELECTOR: CSS 范围或排除规则无效');
  }
  const info = metadata($, baseUrl);
  const foundLinks = links($, baseUrl);
  const gateTitle =
    /^(?:ログイン|sign in|log in|年齢確認|成人認証|验证码|访问验证|just a moment|attention required)[\s.!…！。]*$/i.test(
      $('title, h1').first().text().trim(),
    );
  const verification =
    !selected.preset &&
    (gateTitle || $('input[type="password"], #challenge-form, .g-recaptcha, #yes18').length > 0);
  const extracted = verification
    ? { blocks: [], excluded: [] }
    : extractBlocks($, html, selected.nodes, rules);
  const hasBody = extracted.blocks.some(
    (block) => block.text.trim() && !['heading', 'metadata', 'whitespace'].includes(block.kind),
  );
  const kind = classifyPage($, verification, hasBody, foundLinks);
  return {
    format: 'html',
    kind,
    ...extracted,
    metadata: info,
    links: foundLinks,
    rules,
    warnings:
      !selected.preset && !rules.selector && kind === 'content'
        ? ['使用通用正文范围，请检查是否包含页眉或附属文字。']
        : [],
  };
}
