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
- 改动完成后进行手动测试来确保功能正常。

## 贡献指引 (简要)

1. 更新测试：在 `src/__tests__/` 中添加 `*.test.ts`；确保 `bun test` 通过。
2. 更新文档：修改本文件 `AGENTS.md`.
3. 使用简体中文撰写描述，必要时附英译术语。

## 代码规范

- 使用简体中文撰写描述，必要时附英译术语。
- 注意代码的鲁棒性和抽象性，确保代码的健壮性和可维护性。尽量创建可复用的组件和函数。
- script 必须置于template 之后，且必须使用 setup 语法。
- 使用uuid生成唯一ID。
- **ID 生成规范**：
  - 对于 `Volume`、`Chapter`、`Paragraph`、`Translation`、`Note`、`Terminology`、`CharacterSetting`，使用短 ID（8 位十六进制字符串，例如 "e58ed763"）。
  - 使用 `UniqueIdGenerator` 类（位于 `src/utils/id-generator.ts`）确保在各自的组内唯一。
  - `Novel` 的 ID 仍使用完整的 uuidv4。
  - 示例：`const idGenerator = new UniqueIdGenerator(); const id = idGenerator.generate();`
- 使用pinia管理状态。
- 使用primevue组件库。
- 使用useToastWithHistory来展示各种行为的结果，使其可以自动保存toast历史记录。
- 总是将数据类型定义在src/types目录下。
- 将Constants定义在src/constants目录下。
- 将Services定义在src/services目录下。
- 将Stores定义在src/stores目录下。
- **TypeScript/Lint 规范**：
  - 禁止使用内联 `import()` 类型注解（例如 `import('path').Type`）。应该在文件顶部导入所有需要的类型。
  - 未使用的函数参数应使用下划线前缀（例如 `_config`）以符合 lint 规范。
  - 确保所有代码都通过了vue-tsc和eslint的类型检查。