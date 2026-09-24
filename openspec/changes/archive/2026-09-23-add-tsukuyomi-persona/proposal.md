## Why

应用 Logo 上是 Q 版动漫月詠少女（黑发、猫耳、手捧发光典籍、月夜星空），但聊天助手当前只在系统提示词里写了一句「你是 Tsukuyomi（月詠）...友好专业地交流」——既无角色识别度，也未在 UI 中露脸，与品牌视觉脱节。给助手赋予完整人格（沉静博学的月之神官 + 反差萌的猫耳书虫 + 4 个视觉出场点）能强化品牌、提升陪伴感、让长时翻译会话更有温度。

## What Changes

- 重写 [`assistant.ts`](../../../src/services/ai/tasks/prompts/assistant.ts) 的 `getAssistantSystemPrompt`，引入分层人格内核（身份与自称、说话风格、喜好/不喜/小习惯、核心约束）
- 新增可复用头像组件 `AssistantAvatar.vue`（`size` / `glowing` / `pulse` 三个 props）
- 改造 [`ChatMessageList.vue`](../../../src/components/layout/ChatMessageList.vue)：
  - 助手消息左侧加 32px 圆形头像
  - 空状态换成 128px Logo + 「妾身月詠，于此恭候」hero
  - 思考态文案改为池化随机抽取（5 条角色化等待句）
- 新增思考态文案池 composable `useThinkingPhrase.ts`
- [`SettingsPage`](../../../src/pages/SettingsPage.vue) 三套设备变体加「关于」分区（大 Logo + 签名 + 版本号）
- `quasar.config.ts` Electron splash 配置：Logo + 「月詠 · Tsukuyomi」标题
- 新增两个单测：`assistant-prompt.test.ts`（人格关键标识 + 译文纯净度规则）、`thinking-phrase.test.ts`（文案池抽取）
- v1 不加「人格开关」设置项（YAGNI；定位为始终在线）
- v1 仅简体 / 繁体中文支持人格；不为英语做角色化分支

**核心约束**：写入 `Paragraph.translations[].text` 的译文本体**必须**保持纯净中文译文，不混入角色口吻——人格语气只覆盖对话回答、解释、工具反馈、思考态、问候。

## Capabilities

### New Capabilities

- `ai-assistant-persona`: 定义 AI 聊天助手「月詠」的身份、说话风格、喜好/不喜/小习惯、视觉出场规则，以及「角色语气不污染翻译产出」这一核心约束。覆盖系统提示词层与 UI 视觉表现层。

### Modified Capabilities

无。本次为新增能力，不修改现有 spec 的要求。

## Impact

- **Prompt 层**：[`src/services/ai/tasks/prompts/assistant.ts`](../../../src/services/ai/tasks/prompts/assistant.ts) 系统提示词重写——影响所有 Assistant 任务的回答风格；不影响翻译/润色/校对/解释任务的输出（这些任务有独立 prompt）
- **聊天 UI**：[`src/components/layout/ChatMessageList.vue`](../../../src/components/layout/ChatMessageList.vue) 助手消息渲染、空状态、思考态——三套设备变体（desktop / tablet / mobile）均需联动改动
- **新增组件**：[`src/components/layout/AssistantAvatar.vue`](../../../src/components/layout/AssistantAvatar.vue)
- **新增 composable**：[`src/composables/chat/useThinkingPhrase.ts`](../../../src/composables/chat/useThinkingPhrase.ts)
- **设置页**：[`src/pages/SettingsPage.vue`](../../../src/pages/SettingsPage.vue) + 其 desktop/tablet/mobile 变体加「关于」分区
- **构建配置**：`quasar.config.ts` Electron splash 配置（仅 Electron 端；Web SPA 不加 splash）
- **资产**：复用现有 `public/icons/android-chrome-192x192.png` 与 `android-chrome-512x512.png`，不新增图片资产
- **测试**：新增两个 Vitest 单测；现有测试套件无破坏性影响
- **i18n**：v1 不为英语做角色化分支；现有 zh-CN / zh-TW 文案沿用，新增 4-5 条人格相关 i18n key（hero 标语、思考态文案、关于页签名）
- **数据兼容**：无数据模型变更；无迁移
- **依赖**：无新增依赖
