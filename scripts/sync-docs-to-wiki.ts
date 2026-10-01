#!/usr/bin/env bun
/**
 * 将 Tsukuyomi 仓库的帮助文档同步到 GitHub Wiki
 *
 * 功能：
 * 1. 复制 public/help/<locale>/*.md 到 wiki（简中保留原页面名，繁中 / 英文加 `-zh-TW` / `-en-US` 后缀）
 * 2. 复制 public/releaseNotes/*.md 与 docs/*.md 到 wiki（仅简中，三种语言共用）
 * 3. 基于各语言 index.json 生成 Home.md / Home-zh-TW.md / Home-en-US.md
 * 4. 生成包含三种语言导航的 _Sidebar.md
 * 5. 转换内部文档链接为对应语言的 wiki 链接，并在每篇帮助页顶部加语言切换
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface HelpArticle {
  id: string;
  title: string;
  file: string;
  path: string;
  category: string;
  categoryId?: string;
  description: string;
}

type WikiLocale = 'zh-CN' | 'zh-TW' | 'en-US';

interface LocaleText {
  /** 语言切换中显示的语言名 */
  name: string;
  homeTitle: string;
  intro: string;
  tagline: string;
  helpHeading: string;
  releasesHeading: string;
  releasesIntro: string;
  allReleases: string;
  /** 更新日志与开发者文档只有简中时的说明；简中为空 */
  zhOnlyNote: string;
  devHeading: string;
  devDocs: { page: string; title: string; description: string }[];
  linksHeading: string;
  links: { label: string; url: string }[];
  tip: string;
  sidebarHome: string;
  sidebarReleases: string;
}

const LOCALES: WikiLocale[] = ['zh-CN', 'zh-TW', 'en-US'];

const TEXT: Record<WikiLocale, LocaleText> = {
  'zh-CN': {
    name: '简体中文',
    homeTitle: 'Tsukuyomi (月詠) - 帮助文档',
    intro: '欢迎来到 **Tsukuyomi** 的帮助文档 Wiki！这里包含了完整的使用指南、开发文档和发布说明。',
    tagline:
      '🌙 **Tsukuyomi (月詠)** 是一个利用 AI 模型（如 GPT、Claude、Gemini）翻译小说的现代化工具：原文不限语言，可译为简体中文、繁體中文或 English，对日文网络小说与轻小说有专门支持。',
    helpHeading: '📚 用户帮助文档',
    releasesHeading: '📋 更新日志',
    releasesIntro: '查看最近的版本更新：',
    allReleases: '查看所有更新日志',
    zhOnlyNote: '',
    devHeading: '🛠️ 开发者文档',
    devDocs: [
      {
        page: 'BUILD_TROUBLESHOOTING',
        title: '构建故障排查',
        description: '构建问题诊断和解决方案',
      },
      { page: 'THEME_GUIDE', title: '主题指南', description: '自定义主题开发指南' },
      { page: 'TRANSLATION_GUIDE', title: '翻译指南', description: '为 Tsukuyomi 贡献翻译' },
    ],
    linksHeading: '🔗 相关链接',
    links: [
      { label: 'GitHub 仓库', url: 'https://github.com/rozx/Tsukuyomi' },
      { label: '问题反馈', url: 'https://github.com/rozx/Tsukuyomi/issues' },
      { label: '讨论区', url: 'https://github.com/rozx/Tsukuyomi/discussions' },
      { label: '发布页面', url: 'https://github.com/rozx/Tsukuyomi/releases' },
    ],
    tip: '💡 **提示**: 使用右侧的侧边栏快速导航到各个文档章节。',
    sidebarHome: '🏠 首页',
    sidebarReleases: '📋 更新日志',
  },
  'zh-TW': {
    name: '繁體中文',
    homeTitle: 'Tsukuyomi (月詠) - 說明文件',
    intro: '歡迎來到 **Tsukuyomi** 的說明文件 Wiki！這裡包含完整的使用指南、開發文件和發布說明。',
    tagline:
      '🌙 **Tsukuyomi (月詠)** 是一個利用 AI 模型（如 GPT、Claude、Gemini）翻譯小說的現代化工具：原文不限語言，可譯為簡體中文、繁體中文或 English，對日文網路小說與輕小說有專門支援。',
    helpHeading: '📚 使用者說明文件',
    releasesHeading: '📋 更新紀錄',
    releasesIntro: '查看最近的版本更新：',
    allReleases: '查看所有更新紀錄',
    zhOnlyNote: '更新紀錄正文與開發者文件僅提供簡體中文。',
    devHeading: '🛠️ 開發者文件',
    devDocs: [
      {
        page: 'BUILD_TROUBLESHOOTING',
        title: '建置故障排查',
        description: '建置問題診斷和解決方案',
      },
      { page: 'THEME_GUIDE', title: '主題指南', description: '自訂主題開發指南' },
      { page: 'TRANSLATION_GUIDE', title: '翻譯指南', description: '為 Tsukuyomi 貢獻翻譯' },
    ],
    linksHeading: '🔗 相關連結',
    links: [
      { label: 'GitHub 儲存庫', url: 'https://github.com/rozx/Tsukuyomi' },
      { label: '問題回報', url: 'https://github.com/rozx/Tsukuyomi/issues' },
      { label: '討論區', url: 'https://github.com/rozx/Tsukuyomi/discussions' },
      { label: '發布頁面', url: 'https://github.com/rozx/Tsukuyomi/releases' },
    ],
    tip: '💡 **提示**: 使用右側的側邊欄快速導覽到各個文件章節。',
    sidebarHome: '🏠 首頁',
    sidebarReleases: '📋 更新紀錄',
  },
  'en-US': {
    name: 'English',
    homeTitle: 'Tsukuyomi (月詠) - Help',
    intro:
      'Welcome to the **Tsukuyomi** help wiki! It has the full user guides, developer docs, and release notes.',
    tagline:
      '🌙 **Tsukuyomi (月詠)** is a modern tool for translating novels with AI models such as GPT, Claude, and Gemini: any source language into Simplified Chinese, Traditional Chinese, or English, with dedicated support for Japanese web novels and light novels.',
    helpHeading: '📚 User guides',
    releasesHeading: '📋 Release notes',
    releasesIntro: 'Recent releases:',
    allReleases: 'All release notes',
    zhOnlyNote: 'Release note bodies and developer docs are available in Simplified Chinese only.',
    devHeading: '🛠️ Developer docs',
    devDocs: [
      {
        page: 'BUILD_TROUBLESHOOTING',
        title: 'Build troubleshooting',
        description: 'Diagnosing and fixing build problems',
      },
      { page: 'THEME_GUIDE', title: 'Theme guide', description: 'Developing custom themes' },
      {
        page: 'TRANSLATION_GUIDE',
        title: 'Translation guide',
        description: 'Contributing translations to Tsukuyomi',
      },
    ],
    linksHeading: '🔗 Links',
    links: [
      { label: 'GitHub repository', url: 'https://github.com/rozx/Tsukuyomi' },
      { label: 'Issues', url: 'https://github.com/rozx/Tsukuyomi/issues' },
      { label: 'Discussions', url: 'https://github.com/rozx/Tsukuyomi/discussions' },
      { label: 'Releases', url: 'https://github.com/rozx/Tsukuyomi/releases' },
    ],
    tip: '💡 **Tip**: use the sidebar on the right to jump between documents.',
    sidebarHome: '🏠 Home',
    sidebarReleases: '📋 Release notes',
  },
};

const REPO_ROOT = process.cwd();
// 允许用 WIKI_DIR 指向临时目录做本地预览
const WIKI_DIR = process.env.WIKI_DIR ?? join(REPO_ROOT, 'wiki');
const RECENT_RELEASE_COUNT = 5;

// 确保 wiki 目录存在
if (!existsSync(WIKI_DIR)) {
  console.log('Wiki directory does not exist. Creating it...');
  mkdirSync(WIKI_DIR, { recursive: true });
}

/** 简中保留原页面名（兼容既有链接），其他语言加后缀，保证 wiki 扁平命名空间内唯一。 */
function wikiPage(name: string, locale: WikiLocale): string {
  return locale === 'zh-CN' ? name : `${name}-${locale}`;
}

function pageName(file: string): string {
  return file.replace(/\.md$/, '');
}

function languageSwitcher(name: string, current: WikiLocale): string {
  const items = LOCALES.map((locale) =>
    locale === current
      ? `**${TEXT[locale].name}**`
      : `[[${TEXT[locale].name}|${wikiPage(name, locale)}]]`,
  );
  return `> 🌐 ${items.join(' · ')}`;
}

/** 把 `/help/xxx`、`help/xxx`、`./xxx.md` 形式的站内链接转为同语言的 wiki 链接，保留 #锚点。 */
function convertHelpLinks(content: string, locale: WikiLocale): string {
  const toWiki = (text: string, target: string) => {
    const [rawPage = '', anchor] = target.split('#', 2);
    const page = wikiPage(pageName(rawPage), locale);
    return `[[${text}|${anchor ? `${page}#${anchor}` : page}]]`;
  };
  return content
    .replace(/\[([^\]]+)\]\(\/help\/([^)]+)\)/g, (_, text: string, target: string) =>
      toWiki(text, target),
    )
    .replace(/\[([^\]]+)\]\(help\/([^)]+)\)/g, (_, text: string, target: string) =>
      toWiki(text, target),
    )
    .replace(/\[([^\]]+)\]\(\.\/([\w-]+\.md(?:#[^)]*)?)\)/g, (_, text: string, target: string) =>
      toWiki(text, target),
    );
}

function readIndex(locale: WikiLocale): HelpArticle[] {
  const indexPath = join(REPO_ROOT, 'public/help', locale, 'index.json');
  return JSON.parse(readFileSync(indexPath, 'utf-8')) as HelpArticle[];
}

function isReleaseNote(article: HelpArticle): boolean {
  return article.categoryId === 'release-notes' || article.path === 'releaseNotes';
}

// 1. 复制各语言帮助文档
let helpPageTotal = 0;
const indexes = new Map<WikiLocale, HelpArticle[]>();
for (const locale of LOCALES) {
  console.log(`📝 Copying ${locale} help documentation...`);
  indexes.set(locale, readIndex(locale));
  const helpDir = join(REPO_ROOT, 'public/help', locale);
  const helpFiles = readdirSync(helpDir).filter((file) => file.endsWith('.md'));
  for (const file of helpFiles) {
    const name = pageName(file);
    const content = convertHelpLinks(readFileSync(join(helpDir, file), 'utf-8'), locale);
    const destFile = `${wikiPage(name, locale)}.md`;
    writeFileSync(
      join(WIKI_DIR, destFile),
      `${languageSwitcher(name, locale)}\n\n${content}`,
      'utf-8',
    );
    console.log(`  ✓ Copied ${locale}/${file} → ${destFile}`);
  }
  helpPageTotal += helpFiles.length;
}

// 从源目录拷贝所有 .md 到 WIKI_DIR；目录不存在时安全跳过，返回实际拷贝的文件名。
function copyMarkdownFilesFromDir(sourceDir: string): string[] {
  if (!existsSync(sourceDir)) return [];
  const files = readdirSync(sourceDir).filter((file) => file.endsWith('.md'));
  for (const file of files) {
    const sourcePath = join(sourceDir, file);
    const content = readFileSync(sourcePath, 'utf-8');
    const destPath = join(WIKI_DIR, file);
    writeFileSync(destPath, content, 'utf-8');
    console.log(`  ✓ Copied ${file}`);
  }
  return files;
}

// 2. 复制发布说明文档
console.log('📋 Copying release notes...');
const releaseFiles = copyMarkdownFilesFromDir(join(REPO_ROOT, 'public/releaseNotes'));

// 3. 复制开发文档
console.log('🛠️  Copying developer documentation...');
const docFiles = copyMarkdownFilesFromDir(join(REPO_ROOT, 'docs'));

function groupGuides(index: HelpArticle[]): Map<string, HelpArticle[]> {
  const categories = new Map<string, HelpArticle[]>();
  for (const article of index) {
    if (isReleaseNote(article)) continue;
    if (!categories.has(article.category)) categories.set(article.category, []);
    categories.get(article.category)!.push(article);
  }
  return categories;
}

// 4. 生成各语言首页
for (const locale of LOCALES) {
  const text = TEXT[locale];
  const index = indexes.get(locale)!;
  const homeFile = `${wikiPage('Home', locale)}.md`;
  console.log(`🏠 Generating ${homeFile}...`);

  let homeContent = `${languageSwitcher('Home', locale)}

# ${text.homeTitle}

${text.intro}

> ${text.tagline}

---

## ${text.helpHeading}
`;

  for (const [category, articles] of groupGuides(index)) {
    homeContent += `\n### ${category}\n\n`;
    for (const article of articles) {
      const link = wikiPage(pageName(article.file), locale);
      homeContent += `- **[[${article.title}|${link}]]** - ${article.description}\n`;
    }
  }

  const releaseNotes = index.filter(isReleaseNote);
  if (releaseNotes.length > 0) {
    homeContent += `\n### ${text.releasesHeading}\n\n${text.releasesIntro}\n\n`;
    for (const article of releaseNotes.slice(0, RECENT_RELEASE_COUNT)) {
      homeContent += `- **[[${article.title}|${pageName(article.file)}]]** - ${article.description}\n`;
    }
    if (releaseNotes.length > RECENT_RELEASE_COUNT) {
      homeContent += `\n[${text.allReleases}](https://github.com/rozx/Tsukuyomi/releases)\n`;
    }
  }

  homeContent += `\n---\n\n## ${text.devHeading}\n\n`;
  for (const doc of text.devDocs) {
    homeContent += `- **[[${doc.title}|${doc.page}]]** - ${doc.description}\n`;
  }
  if (text.zhOnlyNote) homeContent += `\n> ${text.zhOnlyNote}\n`;

  homeContent += `\n---\n\n## ${text.linksHeading}\n\n`;
  for (const link of text.links) homeContent += `- [${link.label}](${link.url})\n`;
  homeContent += `\n---\n\n> ${text.tip}\n`;

  writeFileSync(join(WIKI_DIR, homeFile), homeContent, 'utf-8');
  console.log(`  ✓ Generated ${homeFile}`);
}

// 5. 生成 _Sidebar.md（GitHub Wiki 只有一个侧边栏，按语言分节）
console.log('📑 Generating _Sidebar.md...');
let sidebarContent = `🌐 ${LOCALES.map((locale) => `[[${TEXT[locale].name}|${wikiPage('Home', locale)}]]`).join(' · ')}\n`;

for (const locale of LOCALES) {
  const text = TEXT[locale];
  const index = indexes.get(locale)!;
  sidebarContent += `\n---\n\n### ${text.name}\n\n**[[${text.sidebarHome}|${wikiPage('Home', locale)}]]**\n\n`;

  for (const [category, articles] of groupGuides(index)) {
    sidebarContent += `**${category}**\n`;
    for (const article of articles) {
      sidebarContent += `- [[${article.title}|${wikiPage(pageName(article.file), locale)}]]\n`;
    }
    sidebarContent += '\n';
  }

  sidebarContent += `**${text.devHeading.replace(/^\S+\s/, '')}**\n`;
  for (const doc of text.devDocs) sidebarContent += `- [[${doc.title}|${doc.page}]]\n`;

  // 更新日志链接（使用最新版本）
  const latestRelease = index.find(isReleaseNote);
  const releaseLink = latestRelease ? pageName(latestRelease.file) : wikiPage('Home', locale);
  sidebarContent += `\n**[[${text.sidebarReleases}|${releaseLink}]]**\n`;
}

writeFileSync(join(WIKI_DIR, '_Sidebar.md'), sidebarContent, 'utf-8');
console.log('  ✓ Generated _Sidebar.md');

console.log('\n✅ Documentation sync completed successfully!');
console.log(`   📁 Wiki directory: ${WIKI_DIR}`);
console.log(
  `   📄 Total files: ${helpPageTotal + docFiles.length + releaseFiles.length + LOCALES.length + 1}`,
);
