# Agent Architecture (日本語→简体中文 翻译)

> 项目名称: `luna-ai-translator`
> 框架与运行环境: 使用 Quasar (Vue 3 + Vite) 构建桌面应用，运行/脚本管理由 **Bun** 驱动。主界面语言为 **简体中文**。
> 目标: 将日本小说文本高质量翻译为自然流畅的简体中文，并支持后续校对与语料优化。

## 与 Quasar + Bun 的结合

- 开发：`bun run dev` 启动 Quasar Vite 开发环境。
- 构建桌面：利用 Quasar Electron 模式 (目录 `src-electron/`) 生成跨平台桌面应用。
- 测试：`bun test` 运行位于 `src/__tests__/` 的单元测试。

## 测试策略

- 基础函数纯单元测试（输入 / 输出格式）。

## 贡献指引 (简要)

1. 更新测试：在 `src/__tests__/` 中添加 `*.test.ts`；确保 `bun test` 通过。
2. 更新文档：修改本文件 `AGENTS.md`.
3. 使用简体中文撰写描述，必要时附英译术语。

## 代码规范

- 使用简体中文撰写描述，必要时附英译术语。
- script 必须置于template 之后，且必须使用 setup 语法。
- 使用uuid生成唯一ID。
- 使用pinia管理状态。
- 使用primevue组件库。