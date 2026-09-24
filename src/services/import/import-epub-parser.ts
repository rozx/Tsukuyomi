import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { ImportEpub, ImportEpubEntry } from 'src/models/import-parsing';
import { unpackImportZip, validateArchivePath } from './import-zip';
import { createImportWork } from './import-work-limits';
import type { ImportWorkOptions } from './import-work-limits';
import { decodeImportText } from './import-text-parser';
import { parseImportHtml } from './import-html-parser';

function elements($: CheerioAPI, name: string) {
  return $('*').filter((_, node) => 'name' in node && node.name.split(':').at(-1) === name);
}

/** URI 中的父目录仅可在 EPUB 根内解析，不映射为真实本地路径。 */
export function resolveEpubPath(
  base: string,
  href: string,
): { path: string; anchor?: string } | undefined {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return undefined;
  const [location = '', fragment] = href.split('#');
  let decoded: string;
  try {
    decoded = decodeURIComponent(location.split('?')[0]!);
  } catch {
    throw new Error('INVALID_ARCHIVE_PATH: EPUB URI 编码无效');
  }
  const segments = decoded.startsWith('/') ? [] : base.split('/').slice(0, -1);
  if (!decoded) return { path: base, ...(fragment ? { anchor: `#${fragment}` } : {}) };
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!segments.length) throw new Error('INVALID_ARCHIVE_PATH: EPUB 引用越出包根目录');
      segments.pop();
    } else segments.push(part);
  }
  const path = validateArchivePath(segments.join('/'));
  return { path, ...(fragment ? { anchor: `#${fragment}` } : {}) };
}

function packageMetadata($: CheerioAPI): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [field, tag] of [
    ['title', 'title'],
    ['author', 'creator'],
    ['description', 'description'],
    ['language', 'language'],
  ] as const) {
    const value = elements($, tag).first().text().trim();
    if (value) values[field] = value;
  }
  const subjects = new Set(
    elements($, 'subject')
      .map((_, node) => $(node).text().trim())
      .get()
      .filter(Boolean),
  );
  if (subjects.size) values.tags = [...subjects].join('\n');
  return values;
}

function readXml(files: Map<string, Uint8Array>, path: string, characterLimit: number): CheerioAPI {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`EPUB_STRUCTURE: 缺少 ${path}`);
  const { text } = decodeImportText(bytes);
  if (text.length > characterLimit) throw new Error('ARCHIVE_LIMIT: XML 资源超过解析上限');
  return load(text, { xml: true });
}

function navigation(
  files: Map<string, Uint8Array>,
  path: string,
  characterLimit: number,
  ncx: boolean,
): ImportEpub['navigation'] {
  if (!files.has(path)) return [];
  const $ = readXml(files, path, characterLimit);
  const links: ImportEpub['navigation'] = [];
  const nodes = ncx
    ? elements($, 'navPoint')
    : elements($, 'nav')
        .filter((_, node) => ($(node).attr('epub:type') ?? '').split(/\s/).includes('toc'))
        .find('a[href]');
  nodes.each((_, node) => {
    const element = $(node);
    const href = ncx ? element.children('content').attr('src') : element.attr('href');
    if (!href) return;
    const resolved = resolveEpubPath(path, href);
    if (resolved)
      links.push({
        title: (ncx ? element.children('navLabel').text() : element.text()).trim(),
        ...resolved,
      });
  });
  return links;
}

function checkEncryption(files: Map<string, Uint8Array>, characterLimit: number): void {
  if (!files.has('META-INF/encryption.xml')) return;
  const $ = readXml(files, 'META-INF/encryption.xml', characterLimit);
  elements($, 'EncryptedData').each((_, node) => {
    const encrypted = $(node);
    const method =
      encrypted
        .find('*')
        .filter((_, child) => child.name.split(':').at(-1) === 'EncryptionMethod')
        .attr('Algorithm') ?? '';
    const uri =
      encrypted
        .find('*')
        .filter((_, child) => child.name.split(':').at(-1) === 'CipherReference')
        .attr('URI') ?? '';
    const fontOnly =
      /(?:idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC)$/.test(method) &&
      /\.(?:otf|ttf|woff2?)$/i.test(uri);
    if (!fontOnly) throw new Error('EPUB_ENCRYPTED: EPUB 正文或资源已加密，无法提取');
  });
}

function parseManifest($: CheerioAPI, packagePath: string, warnings: string[]) {
  const manifest = new Map<string, { path: string; mediaType: string; properties: string[] }>();
  elements($, 'item').each((_, node) => {
    const item = $(node);
    const id = item.attr('id');
    const href = item.attr('href');
    if (!id || !href || manifest.has(id))
      throw new Error('EPUB_STRUCTURE: manifest 标识或资源无效');
    const location = resolveEpubPath(packagePath, href);
    if (!location) {
      warnings.push(`远程资源未自动读取：${href}`);
      return;
    }
    manifest.set(id, {
      path: location.path,
      mediaType: item.attr('media-type') ?? '',
      properties: (item.attr('properties') ?? '').split(/\s+/),
    });
  });
  return manifest;
}

async function collectEntries(
  files: Map<string, Uint8Array>,
  manifest: ReturnType<typeof parseManifest>,
  spine: Map<string, { index: number; linear: boolean }>,
  nav: ImportEpub['navigation'],
  paths: { cover: string | undefined; nav: string | undefined; ncx: string | undefined },
  work: ReturnType<typeof createImportWork>,
): Promise<ImportEpubEntry[]> {
  const entries: ImportEpubEntry[] = [];
  const byPath = new Map([...manifest.values()].map((item) => [item.path, item]));
  for (const [path, data] of files) {
    const item = byPath.get(path);
    const reading = spine.get(path);
    let kind: ImportEpubEntry['kind'] =
      path === paths.cover
        ? 'cover'
        : path === paths.nav || path === paths.ncx
          ? 'catalog'
          : 'resource';
    if (reading && /(?:xhtml|html)/.test(item?.mediaType ?? '')) {
      const decoded = decodeImportText(data).text;
      if (decoded.length > work.limits.textCharacters)
        throw new Error('ARCHIVE_LIMIT: EPUB 文本条目超过解析上限');
      const parsed = parseImportHtml(decoded);
      kind = ['catalog', 'copyright', 'cover'].includes(parsed.kind)
        ? (parsed.kind as ImportEpubEntry['kind'])
        : 'content';
    }
    const title = nav.find((entry) => entry.path === path)?.title;
    entries.push({
      path,
      bytes: data,
      mediaType: item?.mediaType ?? 'application/octet-stream',
      kind,
      ...(reading ? { spineIndex: reading.index, linear: reading.linear } : {}),
      ...(title ? { title } : {}),
    });
    await work.checkpoint();
  }
  entries.sort((a, b) => (a.spineIndex ?? Infinity) - (b.spineIndex ?? Infinity));
  return entries;
}

export async function parseImportEpub(
  bytes: Uint8Array,
  options: ImportWorkOptions = {},
): Promise<ImportEpub> {
  const work = createImportWork(options);
  const files = await unpackImportZip(bytes, options);
  if (new TextDecoder().decode(files.get('mimetype')).trim() !== 'application/epub+zip')
    throw new Error('EPUB_STRUCTURE: 文件不是 EPUB 容器');
  checkEncryption(files, work.limits.textCharacters);
  const container = readXml(files, 'META-INF/container.xml', work.limits.textCharacters);
  const packagePaths = elements(container, 'rootfile')
    .toArray()
    .map((node) => container(node).attr('full-path'))
    .filter((path): path is string => Boolean(path));
  if (!packagePaths.length) throw new Error('EPUB_STRUCTURE: 容器缺少 OPF');
  const packages = packagePaths.map((path) => ({
    path: validateArchivePath(path),
    ...packageMetadata(readXml(files, path, work.limits.textCharacters)),
  }));
  const packagePath = packagePaths[0]!;
  const $ = readXml(files, packagePath, work.limits.textCharacters);
  const info = packageMetadata($);
  const warnings: string[] =
    packages.length > 1 ? ['EPUB 包含多个 package，请检查它们是否属于同一部作品。'] : [];
  const manifest = parseManifest($, packagePath, warnings);
  const spine = new Map<string, { index: number; linear: boolean }>();
  const missingEntries: string[] = [];
  elements($, 'itemref').each((index, node) => {
    const id = $(node).attr('idref') ?? '';
    const item = manifest.get(id);
    if (!item) {
      missingEntries.push(`manifest:${id}`);
      return;
    }
    if (spine.has(item.path)) throw new Error('EPUB_STRUCTURE: spine 重复引用同一正文资源');
    spine.set(item.path, { index, linear: $(node).attr('linear') !== 'no' });
    if (!files.has(item.path)) missingEntries.push(item.path);
  });
  const navItem = [...manifest.values()].find((item) => item.properties.includes('nav'));
  const ncxItem =
    manifest.get(elements($, 'spine').attr('toc') ?? '') ??
    [...manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml');
  let nav = navItem ? navigation(files, navItem.path, work.limits.textCharacters, false) : [];
  if (!nav.length && ncxItem)
    nav = navigation(files, ncxItem.path, work.limits.textCharacters, true);
  const coverId = elements($, 'meta')
    .filter((_, node) => $(node).attr('name') === 'cover')
    .attr('content');
  const cover =
    [...manifest.values()].find((item) => item.properties.includes('cover-image')) ??
    (coverId ? manifest.get(coverId) : undefined);
  const entries = await collectEntries(
    files,
    manifest,
    spine,
    nav,
    { cover: cover?.path, nav: navItem?.path, ncx: ncxItem?.path },
    work,
  );
  if (missingEntries.length) warnings.push(`EPUB 缺少 ${missingEntries.length} 个阅读资源。`);
  return {
    packages,
    metadata: info,
    entries,
    navigation: nav,
    missingEntries,
    warnings,
    ...(cover && files.has(cover.path) ? { coverPath: cover.path } : {}),
  };
}
