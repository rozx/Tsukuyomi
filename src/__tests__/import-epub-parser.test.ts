import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { zipSync, strToU8 } from 'fflate';
import { parseImportEpub } from '../services/import/import-epub-parser';

function epub(extra: Record<string, Uint8Array> = {}, version = 3): Uint8Array {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OPS/book.opf': strToU8(
      `<package version="${version}.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>小说</dc:title><dc:creator>作者</dc:creator><dc:description>简介</dc:description><meta name="cover" content="cover"/></metadata><manifest><item id="second" href="chapter2.xhtml" media-type="application/xhtml+xml"/><item id="first" href="text/chapter1.xhtml" media-type="application/xhtml+xml"/><item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/></manifest><spine toc="ncx"><itemref idref="copyright" linear="no"/><itemref idref="first"/><itemref idref="second"/></spine></package>`,
    ),
    'OPS/text/chapter1.xhtml': strToU8('<html><body><p>第一章正文</p></body></html>'),
    'OPS/chapter2.xhtml': strToU8('<html><body><p>第二章正文</p></body></html>'),
    'OPS/copyright.xhtml': strToU8(
      '<html><body><section epub:type="copyright-page">版权说明</section></body></html>',
    ),
    'OPS/nav.xhtml': strToU8(
      '<html><body><nav epub:type="toc"><ol><li><a href="text/chapter1.xhtml#start">第一章</a></li><li><a href="chapter2.xhtml">第二章</a></li></ol></nav></body></html>',
    ),
    'OPS/toc.ncx': strToU8(
      '<ncx><navMap><navPoint id="a"><navLabel><text>NCX 第一章</text></navLabel><content src="text/chapter1.xhtml"/></navPoint></navMap></ncx>',
    ),
    'OPS/images/cover.png': new Uint8Array([137, 80, 78, 71]),
    'unused.txt': strToU8('归档里的无关文件'),
    ...extra,
  });
}

describe('EPUB 包结构与有界解包', () => {
  it('按 spine 保留阅读顺序，解析元信息、目录和封面，不把所有条目变成正文', async () => {
    const result = await parseImportEpub(epub());
    expect(result.metadata).toMatchObject({ title: '小说', author: '作者', description: '简介' });
    expect(
      result.entries.filter((entry) => entry.kind === 'content').map((entry) => entry.path),
    ).toEqual(['OPS/text/chapter1.xhtml', 'OPS/chapter2.xhtml']);
    expect(result.entries.find((entry) => entry.path === 'OPS/copyright.xhtml')?.kind).toBe(
      'copyright',
    );
    expect(result.entries.find((entry) => entry.path === 'OPS/nav.xhtml')?.kind).toBe('catalog');
    expect(result.entries.find((entry) => entry.path === 'unused.txt')?.kind).not.toBe('content');
    expect(result.navigation[0]).toEqual({
      title: '第一章',
      path: 'OPS/text/chapter1.xhtml',
      anchor: '#start',
    });
    expect(result.coverPath).toBe('OPS/images/cover.png');
  });

  it('缺少 EPUB 3 导航时使用 NCX，缺失正文保留待补记录', async () => {
    const result = await parseImportEpub(
      epub(
        {
          'OPS/nav.xhtml': strToU8('<html/>'),
          'OPS/book.opf': strToU8(
            '<package><metadata/><manifest><item id="a" href="missing.xhtml" media-type="application/xhtml+xml"/><item id="n" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="n"><itemref idref="a"/></spine></package>',
          ),
        },
        2,
      ),
    );
    expect(result.navigation[0]?.title).toBe('NCX 第一章');
    expect(result.missingEntries).toContain('OPS/missing.xhtml');
    expect(result.entries.filter((entry) => entry.kind === 'content')).toEqual([]);
  });

  it('拒绝目录越界、损坏归档、加密正文与超过规模上限', async () => {
    await expect(parseImportEpub(epub({ '../escape.txt': strToU8('逃逸') }))).rejects.toThrow(
      'INVALID_ARCHIVE_PATH',
    );
    await expect(parseImportEpub(new Uint8Array([1, 2, 3]))).rejects.toThrow('CORRUPT_ARCHIVE');
    await expect(
      parseImportEpub(
        epub({
          'META-INF/encryption.xml': strToU8(
            '<encryption><EncryptedData><EncryptionMethod Algorithm="drm"/><CipherData><CipherReference URI="OPS/text/chapter1.xhtml"/></CipherData></EncryptedData></encryption>',
          ),
        }),
      ),
    ).rejects.toThrow('EPUB_ENCRYPTED');
    await expect(parseImportEpub(epub(), { limits: { entries: 2 } })).rejects.toThrow(
      'ARCHIVE_LIMIT',
    );
    await expect(parseImportEpub(epub(), { limits: { entryBytes: 20 } })).rejects.toThrow(
      'ARCHIVE_LIMIT',
    );
    await expect(parseImportEpub(epub(), { limits: { totalBytes: 50 } })).rejects.toThrow(
      'ARCHIVE_LIMIT',
    );
  });

  it('校验实际解压长度与 CRC，不能仅信任中央目录声明', async () => {
    const bytes = epub();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 16, 0, true);
        break;
      }
    }
    await expect(parseImportEpub(bytes)).rejects.toThrow('CORRUPT_ARCHIVE');
  });

  it('允许 ZIP 结束记录后的少量零填充，仍拒绝非零尾部数据', async () => {
    const original = epub();
    const padded = new Uint8Array(original.length + 30);
    padded.set(original);

    const result = await parseImportEpub(padded);
    expect(result.entries.filter((entry) => entry.kind === 'content')).toHaveLength(2);

    padded[padded.length - 1] = 1;
    await expect(parseImportEpub(padded)).rejects.toThrow('CORRUPT_ARCHIVE: 没有 ZIP 中央目录');
  });

  it('取消时不返回半个包，解析过程中可分段让出', async () => {
    const controller = new AbortController();
    let yields = 0;
    await expect(
      parseImportEpub(epub(), {
        signal: controller.signal,
        yieldControl: () => {
          yields++;
          controller.abort();
          return Promise.resolve();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(yields).toBeGreaterThan(0);
  });
});
