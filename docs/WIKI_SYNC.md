# 文档同步到 Wiki 功能

本仓库实现了自动将帮助文档同步到 GitHub Wiki 的功能。

## 功能说明

当 `main` 分支收到推送，且以下文件发生变更时，会自动触发文档同步：

- `public/help/**` - 用户帮助文档
- `public/releaseNotes/**` - 版本发布说明
- `docs/**` - 开发者文档
- `README.md` - 项目说明
- `.github/workflows/sync-docs-to-wiki.yml` - 工作流配置

## 同步内容

### 用户帮助文档

从 `public/help/<locale>/` 同步三种语言的 `.md` 文件。GitHub Wiki 是扁平命名空间，页面名按语言区分：

| 语言     | 来源目录             | Wiki 页面名                     |
| :------- | :------------------- | :------------------------------ |
| 简体中文 | `public/help/zh-CN/` | 原文件名，例如 `front-page`     |
| 繁體中文 | `public/help/zh-TW/` | 加后缀，例如 `front-page-zh-TW` |
| English  | `public/help/en-US/` | 加后缀，例如 `front-page-en-US` |

简中保留原页面名，已有的 Wiki 链接不会失效。

### 发布说明

从 `public/releaseNotes/` 目录同步所有版本的发布说明。发布说明只有简体中文，三种语言的首页和侧边栏共用。

### 开发者文档

从 `docs/` 目录同步（仅简体中文，三种语言共用）：

- `BUILD_TROUBLESHOOTING.md` - 构建故障排查
- `THEME_GUIDE.md` - 主题指南
- `TRANSLATION_GUIDE.md` - 翻译指南

## Wiki 结构

### Home.md / Home-zh-TW.md / Home-en-US.md (首页)

每种语言各生成一个首页（标题、说明和分类名取自对应语言的 `index.json`），包含：

- 语言切换
- 项目简介
- 按分类组织的用户帮助文档索引
- 最近 5 个版本的更新日志
- 开发者文档索引
- 相关链接

### \_Sidebar.md (侧边栏)

GitHub Wiki 只有一个侧边栏，按语言分节，包含：

- 三种语言首页的切换链接
- 每种语言的首页链接
- 按分类组织的文档导航
- 开发者文档链接
- 更新日志链接

### 文档页面

每个 Markdown 文件都会被同步到 Wiki。帮助文档同步过程中会：

1. 在页面顶部加入语言切换（链接到另外两种语言的同名页面）
2. 转换内部链接：`[文本](/help/xxx#锚点)` → `[[文本|xxx-<后缀>#锚点]]`，指向同一语言的页面（简中无后缀）
3. 转换相对链接：`[文本](help/xxx)`、`[文本](./xxx.md)` → 同上
4. 保持其他内容不变

> 注意：GitHub Wiki 链接格式为 `[[Display Text|PageName]]`，即显示文本在前，页面名在后。

## 手动触发同步

可以通过 GitHub Actions 界面手动触发文档同步：

1. 访问仓库的 Actions 页面
2. 选择 "Sync Docs to Wiki" 工作流
3. 点击 "Run workflow" 按钮
4. 选择分支并运行

## 开发

### 本地测试

可以在本地测试同步脚本：

```bash
# 安装 Bun（如果尚未安装）
curl -fsSL https://bun.sh/install | bash

# 运行同步脚本
bun run scripts/sync-docs-to-wiki.ts
```

这会在本地创建一个 `wiki/` 目录，包含所有同步的文档。测试完成后可以删除该目录。也可以用 `WIKI_DIR=/tmp/wiki bun run scripts/sync-docs-to-wiki.ts` 输出到其他目录。

### 修改同步逻辑

同步逻辑在 `scripts/sync-docs-to-wiki.ts` 文件中实现。如需修改：

1. 编辑 `scripts/sync-docs-to-wiki.ts`
2. 本地测试更改
3. 提交更改到仓库

### 工作流配置

GitHub Actions 工作流配置在 `.github/workflows/sync-docs-to-wiki.yml`。

主要步骤：

1. 检出仓库代码
2. 安装 Bun 运行时
3. 克隆 Wiki 仓库到 `wiki/` 目录
4. 运行同步脚本
5. 提交并推送 Wiki 更改

## 权限要求

工作流需要 `contents: write` 权限来推送更改到 Wiki。这是 GitHub Actions 的默认权限。

## 故障排查

### Wiki 未更新

1. 检查 GitHub Actions 运行日志
2. 确认工作流已触发（查看 Actions 页面）
3. 确认 Wiki 功能已在仓库设置中启用

### 链接转换问题

如果发现 Wiki 中的链接不正确：

1. 检查原始文档中的链接格式
2. 修改 `scripts/sync-docs-to-wiki.ts` 中的链接转换逻辑
3. 重新运行工作流

### 权限错误

如果出现推送权限错误：

1. 确认仓库 Wiki 功能已启用
2. 检查工作流的权限设置
3. 如果使用自定义 PAT，确认 token 具有 Wiki 写入权限

## 注意事项

1. Wiki 内容会被完全覆盖，不要直接在 Wiki 中编辑内容
2. 所有文档更改都应该在主仓库中进行
3. 同步是单向的（仓库 → Wiki），Wiki 中的更改会被覆盖
4. `wiki/` 目录已添加到 `.gitignore`，不会被提交到仓库
