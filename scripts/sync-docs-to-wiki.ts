#!/usr/bin/env bun
/**
 * 将 Tsukuyomi 仓库的帮助文档同步到 GitHub Wiki
 *
 * 功能：
 * 1. 复制 public/help/*.md 文件到 wiki
 * 2. 复制 docs/*.md 文件到 wiki
 * 3. 基于 public/help/index.json 生成 Home.md（首页）
 * 4. 基于 public/help/index.json 生成 _Sidebar.md（侧边栏）
 * 5. 转换内部文档链接为 wiki 链接
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface HelpArticle {
  id: string;
  title: string;
  file: string;
  path: string;
  category: string;
  description: string;
}

const REPO_ROOT = process.cwd();
const WIKI_DIR = join(REPO_ROOT, 'wiki');

// 确保 wiki 目录存在
if (!existsSync(WIKI_DIR)) {
  console.log('Wiki directory does not exist. Creating it...');
  mkdirSync(WIKI_DIR);
}

// 1. 读取帮助文档索引
console.log('📖 Reading help documentation index...');
const indexPath = join(REPO_ROOT, 'public/help/index.json');
const helpIndex: HelpArticle[] = JSON.parse(readFileSync(indexPath, 'utf-8'));

// 2. 复制帮助文档文件到 wiki
console.log('📝 Copying help documentation files...');
const helpDir = join(REPO_ROOT, 'public/help');
const helpFiles = readdirSync(helpDir).filter((file) => file.endsWith('.md'));

for (const file of helpFiles) {
  const sourcePath = join(helpDir, file);
  let content = readFileSync(sourcePath, 'utf-8');

  // 转换内部链接：/help/xxx -> [[文本|xxx]] (wiki 链接格式: [[Display Text|Page Name]])
  content = content.replace(/\[([^\]]+)\]\(\/help\/([^)]+)\)/g, '[[$1|$2]]');

  // 转换相对链接：help/xxx -> [[文本|xxx]]
  content = content.replace(/\[([^\]]+)\]\(help\/([^)]+)\)/g, '[[$1|$2]]');

  // 保持原始文件名（不含 .md），wiki 会自动处理
  const wikiFileName = file;
  const destPath = join(WIKI_DIR, wikiFileName);

  writeFileSync(destPath, content, 'utf-8');
  console.log(`  ✓ Copied ${file}`);
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

// 3. 复制发布说明文档
console.log('📋 Copying release notes...');
const releaseFiles = copyMarkdownFilesFromDir(join(REPO_ROOT, 'public/releaseNotes'));

// 4. 复制开发文档
console.log('🛠️  Copying developer documentation...');
const docFiles = copyMarkdownFilesFromDir(join(REPO_ROOT, 'docs'));

// 5. 生成 Home.md（首页）
console.log('🏠 Generating Home.md...');
const categories = new Map<string, HelpArticle[]>();

// 按分类组织文档
for (const article of helpIndex) {
  if (!categories.has(article.category)) {
    categories.set(article.category, []);
  }
  categories.get(article.category)!.push(article);
}

let homeContent = `# Tsukuyomi (月詠) - 帮助文档

欢迎来到 **Tsukuyomi** 的帮助文档 Wiki！这里包含了完整的使用指南、开发文档和发布说明。

> 🌙 **Tsukuyomi (月詠)** 是一个利用 AI 模型（如 GPT、Claude、Gemini）进行日本轻小说翻译的现代化工具。

---

## 📚 用户帮助文档

`;

// 生成分类导航
for (const [category, articles] of categories) {
  // 跳过更新日志分类（太多了）
  if (category === '更新日志') {
    continue;
  }

  homeContent += `\n### ${category}\n\n`;

  for (const article of articles) {
    // 生成 wiki 链接（文件名不含 .md 后缀）
    const wikiLink = article.file.replace('.md', '');
    homeContent += `- **[[${article.title}|${wikiLink}]]** - ${article.description}\n`;
  }
}

// 添加更新日志部分
const releaseNotes = helpIndex.filter((article) => article.category === '更新日志');
if (releaseNotes.length > 0) {
  homeContent += `\n### 📋 更新日志\n\n`;
  homeContent += `查看最近的版本更新：\n\n`;

  // 只显示最近 5 个版本
  const recentReleases = releaseNotes.slice(0, 5);
  for (const article of recentReleases) {
    const wikiLink = article.file.replace('.md', '');
    homeContent += `- **[[${article.title}|${wikiLink}]]** - ${article.description}\n`;
  }

  if (releaseNotes.length > 5) {
    homeContent += `\n[查看所有更新日志](https://github.com/rozx/Tsukuyomi/releases)\n`;
  }
}

// 添加开发者文档部分
homeContent += `\n---

## 🛠️ 开发者文档

- **[[构建故障排查|BUILD_TROUBLESHOOTING]]** - 构建问题诊断和解决方案
- **[[主题指南|THEME_GUIDE]]** - 自定义主题开发指南
- **[[翻译指南|TRANSLATION_GUIDE]]** - 为 Tsukuyomi 贡献翻译

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/rozx/Tsukuyomi)
- [问题反馈](https://github.com/rozx/Tsukuyomi/issues)
- [讨论区](https://github.com/rozx/Tsukuyomi/discussions)
- [发布页面](https://github.com/rozx/Tsukuyomi/releases)

---

> 💡 **提示**: 使用右侧的侧边栏快速导航到各个文档章节。
`;

writeFileSync(join(WIKI_DIR, 'Home.md'), homeContent, 'utf-8');
console.log('  ✓ Generated Home.md');

// 6. 生成 _Sidebar.md（侧边栏）
console.log('📑 Generating _Sidebar.md...');
let sidebarContent = `**[[🏠 首页|Home]]**

---

`;

// 生成分类导航
for (const [category, articles] of categories) {
  // 跳过更新日志分类
  if (category === '更新日志') {
    continue;
  }

  sidebarContent += `**${category}**\n`;

  for (const article of articles) {
    const wikiLink = article.file.replace('.md', '');
    sidebarContent += `- [[${article.title}|${wikiLink}]]\n`;
  }

  sidebarContent += '\n';
}

// 添加开发者文档
sidebarContent += `**开发者文档**
- [[构建故障排查|BUILD_TROUBLESHOOTING]]
- [[主题指南|THEME_GUIDE]]
- [[翻译指南|TRANSLATION_GUIDE]]

---

`;

// 添加更新日志链接（使用最新版本）
const latestRelease = releaseNotes[0];
if (latestRelease) {
  const latestReleaseLink = latestRelease.file.replace('.md', '');
  sidebarContent += `**[[📋 更新日志|${latestReleaseLink}]]**\n`;
} else {
  // 如果没有发布说明，链接到首页（通常不会发生）
  sidebarContent += `**[[📋 更新日志|Home]]**\n`;
}

writeFileSync(join(WIKI_DIR, '_Sidebar.md'), sidebarContent, 'utf-8');
console.log('  ✓ Generated _Sidebar.md');

console.log('\n✅ Documentation sync completed successfully!');
console.log(`   📁 Wiki directory: ${WIKI_DIR}`);
console.log(`   📄 Total files: ${helpFiles.length + docFiles.length + releaseFiles.length + 2}`);
