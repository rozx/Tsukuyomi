# 实施前审查（2026-09-24）

已核对 proposal、design、全部 delta specs、tasks，以及既有的 model-cors-toggle、model-custom-headers、ai-ask-user-tool 规范。OpenSpec 严格校验通过。第 1 组依赖升级不受以下设计问题影响，已完成验证。

## 已确认的存储决策

**D14–D15 的 512 KB 跳过策略无法实现它承诺的回退。**

- `src/composables/chat/useChatSending.ts:275`：新 API 历史序列化长度超过 512,000 时，只输出警告，完全不更新历史。
- `src/utils/ai-context-utils.ts:48`：只要旧 `apiMessageHistory` 非空，下一次请求就优先读取它；不会检查摘要索引后回退到可见消息。
- `design.md` D14 要把 `summarizeAndReset` 改为不删除旧 API 历史的 `applyCompaction`，因此 D15 所称的“跳过时下次请求从可见消息重建”不成立。

复现：使用当前 `buildAssistantMessageHistory` 的源码，模拟 D14 保存新摘要但保留旧历史；新历史序列化长度为 520,068，触发现有跳过分支。下一次构建的请求仍是“旧问题 / 旧回答”，而非“当前问题 / 新结果”。这是对拟议设计的复现，未修改运行时代码。

用户于 2026-09-24 确认修订 D14–D15、持久化 spec、任务 8.5/9.3：取消 512,000 字符的静默跳过，将摘要、保留历史、可见消息索引和锚点作为同一份候选会话状态保存；持久化失败不提交候选状态，保留旧状态并向用户报错。普通结果也使用同一保存入口，避免部分写入。补充大历史、存储失败以及请求中途切换会话的验收场景。

## 已确认的现状与实施注意点

- 厂商边界成立：`AIServiceFactory` 集中提供 OpenAI/Gemini 实例，返回类型与 raw 工具参数由共享类型定义；兼容测试可直接驱动这两个服务。
- Gemini 生成请求未传 baseUrl，也未调用代理；模型列表已有代理逻辑。因此生成路由与 signature 是新实现专属测试，不能伪称旧实现已满足。
- `AssistantExecution.beforeRequest` 在保存检查点后按估算值暂停，任务 9.2 必须删除该旧硬停。
- `persistChatResult` 已绑定发起请求的会话；改保存入口时必须保持该绑定。
- `ImportAgentService.converse` 已有一次外层压缩与继续。接入 AssistantService 的一次超限恢复时必须统一重试预算，避免内外两层分别再重试一次；最终超限失败保持暂停，显式压缩后恢复仍保留。
- D12 的锚点实现还需保存历史前缀指纹及锚点时的 system/tools 估算值，才能完成任务 7.1 要求的前缀校验和提示词差值计算；单靠 historyLength 与 promptFingerprint 无法算出差值。

第 1–3 组已实现并通过自动化检查，详细版本、用例和构建记录见 tasks.md。新增契约测试还修复了缺失工具 ID、reasoning_details、缺失 usage 被 SDK 补零、408/409 默认重试、浏览器连接错误分类和名称晚到达时并行调用顺序的问题。

用户导入模型后，六种模型经当前 OpenAI 兼容路由通过多轮助手与整章翻译，真实助手界面和章节落盘也已核对。真实 gate 额外发现并修复 system 消息入口和不含 token 的 context window 错误漏判，任务 7.3 因此提前接入。详见 [validation/spike-report.md](validation/spike-report.md)。

用户于 2026-09-24 确认“按当前范围验收，完成切换”。原生 Gemini/OpenRouter 直连未覆盖、FlashX 订阅限制和 DeepSeek 不透明错误继续作为明确限制记录，不伪称通过；按这一已批准的范围删除 legacy。上下文与原子持久化已实现，真实两次压缩、超限恢复和导入验证见 [validation/context-report.md](validation/context-report.md)。
