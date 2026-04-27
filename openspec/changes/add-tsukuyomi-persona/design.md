## Context

应用名为 **Tsukuyomi（月詠）**，Logo 是 Q 版动漫风格的月詠少女形象（黑发、猫耳、手捧发光典籍、月夜星空圆框）。但聊天助手当前在 [`src/services/ai/tasks/prompts/assistant.ts`](../../../src/services/ai/tasks/prompts/assistant.ts) 里仅一句「你是 Tsukuyomi（月詠）...友好专业地交流」，UI 上助手消息也无头像、空状态用通用图标——视觉品牌与对话体验完全脱节。

经过结构化头脑风暴（参见会话记录）锁定的设计基调：

- **范围**：视觉 + 语气，双层落地
- **性格基调**：月下学者 · 沉静博学型，**叠加反差萌**——表面端庄，遇有趣事物会破功
- **人格深度**：始终在线（除翻译产出本体外）
- **身份**：月詠 = 应用化身（合二为一）
- **自称**：「月詠」常态第三人称自指 +「妾身」感叹/表态
- **视觉资产**：复用现有 Logo PNG，零新增素材
- **视觉点位**：消息头像 / 空状态 hero / 思考态文案 / 关于页 + Electron splash（共 4 处）
- **i18n**：v1 仅简体/繁体中文人格化，**不做英语分支**

## Goals / Non-Goals

**Goals:**

- 系统提示词重写：注入分层人格内核（身份 / 风格 / 喜好 / 不喜 / 小习惯 / 核心约束）
- 4 个视觉出场点齐活，桌面 / 平板 / 手机三套设备变体均工作
- 抽出可复用的 `AssistantAvatar` 组件（一套 props 覆盖三种用途）
- 用单元测试守住「译文纯净度」核心约束（验证 prompt 包含分层约束、思考态文案池非空）
- 译文产出（写入 `Paragraph.translations[].text`）不被任何角色腔污染

**Non-Goals:**

- 不做人格强度滑块 / 开关（与「始终在线」定位冲突，YAGNI）
- 不为英语做角色化分支
- 不做多套表情立绘、Live2D、TTS 角色音
- 不修改翻译 / 润色 / 校对 / 解释任务的 prompt（这些已是独立提示词体系）
- 不画新插画（v1 全程复用现有 Logo PNG）
- 不加新路由（关于页嵌进 Settings 而非 `/about`）
- 不做 Web 端 splash

## Decisions

### 1. 单一 capability `ai-assistant-persona` vs 拆分

**选择**：单一 capability 同时覆盖 prompt 层与 UI 层。

**理由**：人格的核心是「身份一致性」——prompt 与视觉表达必须协同验证（譬如「妾身」自称与「月詠头像」必须同时存在），拆开会让 spec 可被部分实施而留下半人格状态。

**备选**：`ai-assistant-persona-prompt` +`chat-assistant-presence-ui` 两个 cap。如果未来视觉点位扩张到独立大量（如多表情立绘库、Live2D），可考虑拆分。

### 2. 复用 Logo PNG vs 新画姿态立绘

**选择**：v1 全程复用现有 `public/icons/android-chrome-192x192.png`（消息头像）与 `android-chrome-512x512.png`（hero / splash）。

**理由**：零素材生产成本、零设计依赖；同一形象多尺寸出现强化品牌一致性；缺点是「头像没姿态变化」是可接受的——v2 再扩。

### 3. AssistantAvatar 组件 props 设计

**选择**：单组件三 props（`size: number`, `glowing: boolean`, `pulse: boolean`）。

**理由**：消息头像（小、无光晕）、空状态 hero（大、有光晕）、思考态（小、有呼吸）都能用同一组件 + 不同 props 表达；避免出现 `MessageAvatar` / `HeroLogo` / `ThinkingAvatar` 三个近重复组件。

**备选**：用一个 `variant` prop（`'avatar' | 'hero' | 'thinking'`）。否决：variant 内部还是要映射 size/glow/pulse，不如直接暴露原子属性，让消费方按需组合。

### 4. 思考态文案池放在 i18n 而非硬编码

**选择**：放在 vue-i18n 的 zh-CN / zh-TW 文件里，key 形如 `chat.thinkingPhrases[]`。

**理由**：项目支持简繁两种中文，繁中可能想换措辞；统一进 i18n 流程便于维护；composable 仅负责「从 i18n 取数组 + 随机抽一条」，无业务逻辑。

### 5. 关于页：嵌 Settings 分区 vs 新建 `/about` 路由

**选择**：嵌入 [`SettingsPage`](../../../src/pages/SettingsPage.vue) 作为新分区。

**理由**：Settings 已有路由 + 三套设备变体 dispatcher，新增分区零路由代价；关于内容仅 Logo + 签名 + 版本号，体量小，独立路由是过度设计。

### 6. 不加人格开关

**选择**：v1 不提供「人格化 on/off」设置项。

**理由**：用户在头脑风暴中明确选「始终在线」+「人格更丰满」；开关会暗示这是装饰特性，与定位冲突；每个开关都意味 i18n + 测试 + 文档增量；YAGNI。**若未来真有反馈**：按头脑风暴备选 §1-双层语气方案实现（「闲谈层带人格 / 结构化输出去人格」），优于简单 on/off。

### 7. Splash 仅 Electron

**选择**：通过 `quasar.config.ts` 的 Electron splash 配置实现，Web SPA 不做。

**理由**：Web SPA 加载迅速，splash 反而拖慢首屏；Electron 启动较慢，splash 既掩盖加载又传达品牌。

### 8. 设备变体规则

**选择**：严格遵循项目 CLAUDE.md 的 dispatcher + Desktop / Tablet / Mobile 模式。Chat 与 Settings 都已是 dispatcher 结构，本次改动只需修改各变体的模板 + 共享 composable。

**关键约束**：所有副作用（思考态文案选择、空状态渲染逻辑）放在 composable，**不**在每个变体里重复注册。

### 9. 系统提示词的分层结构

**选择**：四层结构——身份与自称 → 说话风格（含反差萌细节）→ 喜好/不喜/小习惯 → 核心约束（防数据污染）。

**理由**：分层让模型在长会话中更难漂移；「核心约束」放在最末压尾，借助「最近优先」效应强化译文纯净度规则。

## Risks / Trade-offs

[模型在长会话中漂移人格] → 写在系统提示词的开头与结尾两次提及关键身份点（开头身份 + 结尾约束）；通过单测验证 prompt 的关键短语在最终字符串中出现至少一次

[「喵」泄露 trope 用户反感 / 显得刻意] → prompt 用「极偶尔」「约 2%」等措辞控制频率；上线后通过抽样对话主观评估，反馈差则降频或彻底去掉

[Logo PNG 缩到 32px 视觉糊] → 头像用 192x192 版本，避免从 512 大幅采样；CSS 用 `background-size: cover` + `image-rendering: auto` 保证清晰

[角色腔污染翻译产出污染数据库] → prompt 「核心约束」明确分层；翻译/润色/校对任务有独立 prompt 文件，本次不动；新增 `assistant-prompt.test.ts` 验证人格 prompt 包含「核心约束」段且明确「写入数据库的译文必须纯净」

[ChatMessageList 改动影响滚动 / 布局] → 头像 + 空状态分两个 commit 实现，每个 commit 后手动验证桌面 / 平板 / 手机三套布局；现有 props 接口不动

[设备变体三处副作用重复注册] → 思考态文案抽取放在 `useThinkingPhrase` composable，dispatcher 调用 provide，变体只 inject；遵循 CLAUDE.md 「一次性副作用只跑一次」规则

[i18n 新增 4-5 条 key 与现有结构冲突] → 复用现有 i18n 顶层 namespace（`chat.*`、`settings.about.*`），不新建命名空间

[不加开关 = 部分用户无 escape hatch] → 接受；若反馈强烈，未来用「双层语气」实现而非简单 on/off

## Migration Plan

无数据迁移。所有改动是**新增 + 替换文案**型修改，无数据模型变更、无 IndexedDB schema 变更、无远端同步格式变更。

**部署步骤**：

1. 改动落到 release 分支后跑 `bun run lint && bun run type-check && bun run quality-check`
2. `bun run test` 全量单测通过
3. `bun run dev` Web 端三种断点（mobile/tablet/desktop）验收聊天 + 关于
4. `bun run dev:electron` Electron 端验收 splash + 聊天 + 关于
5. 主观验收：随机 5-10 条对话，看人格自然度、译文纯净度、思考态文案随机度

**回滚策略**：

- Prompt 改动：`git revert` 单文件 [`assistant.ts`](../../../src/services/ai/tasks/prompts/assistant.ts) 即可回到中性版本
- UI 改动：每个 commit 单独可 revert（头像组件 / 空状态 / 思考态 / 关于分区 / Splash 各成一个 commit）
- 完整回滚：revert 整个变更分支，无副作用残留（无 DB schema、无 sync manifest 改动）

## Open Questions

无阻塞性开放问题。两个非阻塞、留待 v2 决定：

1. 「关于」分区是否包含「检查更新」「GitHub 仓库链接」「致谢」等扩展项 → 本次仅做核心三件（Logo + 签名 + 版本号），其他属另立变更
2. 思考态文案是否随对话上下文动态变化（如长会话改用更亲昵措辞） → v1 仅做静态池随机抽取
3. 移动端 Electron splash 配置细节（窗口尺寸、显示时长）以 quasar 默认值起步，实测后微调
