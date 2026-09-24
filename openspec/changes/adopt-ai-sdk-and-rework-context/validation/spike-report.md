# AI SDK 真实兼容性验证（2026-09-24）

## 范围

在浏览器中的本地应用执行真实 API 请求，使用用户已配置的自建 OpenAI 兼容路由。六个导入模型中五个可正常使用；另外验证了路由模型列表提供的 `kimi-k3`，未把该临时模型写入用户模型配置。原生 Gemini 与 OpenRouter 直连尚未配置，不能将路由测试视为它们的直连验证。

助手使用同一段只读请求：先 `list_help_docs`，等待结果，再 `get_help_doc`，最后回答。翻译使用独立验证书籍的四段日文样本，每个模型对应独立章节，走实际 TranslationService、工具循环、书籍执行锁及增量保存回调，并从章节存储读回译文。

## 正常请求矩阵

| 模型                  | 多轮助手                 | 完整章节                       | usage |
| --------------------- | ------------------------ | ------------------------------ | ----- |
| `gpt-6-luna`          | 通过，3 次请求           | 通过，4/4 落盘；15             | 有    |
| `gpt-6-sol(high)`     | 通过，3 次请求           | 通过，4/4 落盘；15             | 有    |
| `deepseek-v4-pro`     | 通过，3 次请求           | 通过，4/4 落盘；9              | 有    |
| `deepseek-v4.1-flash` | 通过，3 次请求           | 通过，4/4 落盘；8              | 有    |
| `glm-5.3`             | 通过，3 次请求           | 通过，4/4 落盘；8              | 有    |
| `kimi-k3`             | 通过，3 次请求           | 通过，4/4 落盘；未保留完整计数 | 有    |
| `glm-5.3-flashx`      | 未通过：上游订阅权限不足 | 未执行                         | 无    |

Kimi 章节在页面导航后从持久化任务的 `end` 状态和 4/4 已选译文核对成功；最后部分请求明细未保留，故不推测其请求总数。Kimi 的 usage 从已记录的助手请求确认。

## 实测发现并修复

1. **AI SDK 7 的 system 消息入口**：非空 system 消息放入 `messages` 会在发送前被 SDK 拒绝。适配器改为提取至 `instructions`，保留多条指令顺序。先红后绿的契约测试覆盖 OpenAI/Gemini；真实助手与翻译均复测通过。
2. **真实上下文错误漏判**：旧逻辑要求包含 `token`，未识别 GPT 返回的 `context window` 错误。提前接入原计划任务 7.3 的 `isContextOverflowError`，使用真实错误样本验证公共 AssistantService 恢复路径；不会把配额、鉴权或无信息的 HTTP 400 猜成上下文错误。

## 真实超限恢复

使用 7,200,027 字符的合成历史，填充部分的本地基础计数为 1,200,000 tokens。未使用用户书籍内容。模型窗口只在测试副本中设为未知，让服务端实际拒绝请求，未修改保存的模型配置。

- GPT-6 Luna 原文：`Your input exceeds the context window of this model. Please adjust your input and try again.`，HTTP 400，错误码 `context_too_large`。
- 修复后：首次拒绝 → 生成 85 字摘要 → 重试一次成功，共 3 次请求；摘要开始/结束事件各一次。
- 摘要请求报告 input 865 / output 65；恢复请求报告 input 12,129 / output 20。
- 实际回复：“本次验证旨在确认对话摘要后能否继续正常回复。”
- DeepSeek V4.1 Flash 对同类超长输入仅返回 HTTP 400 和 `{"model":"deepseek-v4.1-flash"}`，没有可识别的超限信息。此路径保持失败，不能宣称恢复通过，也不能把所有 HTTP 400 都当作超限。

## 上游限制

FlashX 返回：`All credentials for model glm-5.3-flashx are cooling down via provider openai-compatible-glm (last error: 1311: Your current subscription plan does not yet include access to GLM-5.3-FlashX)`。旧适配器对照也以 `Request timed out.` 结束，取消传播未及时终止等待；没有修改订阅或模型配置。

## 界面与存储复核

- 验证书籍：`AI SDK 验证样本 · 2026-09-24`，本地 ID `18633539-e202-4d09-9c6d-0e09666261f0`；界面显示六章 100%，FlashX 预留章 0%。保留样本供用户检查。
- 从真实助手输入框发送只读测试，完成两轮帮助文档工具调用及最终回复；3 次请求，保存 6 条 API 消息，工具链完整。
- 临时 fetch/服务拦截已移除，localStorage 测试开关已恢复为原状态；该 checkpoint 的代码默认仍为 legacy；后续验收结论见文末。

### 章节写回界面

![验证章节已译 4 段](/Users/rozx/.codex/visualizations/2026/09/24/01a0d477-c01a-7001-a533-d24e76061034/ai-sdk-validation/chapter-verified.png)

### 助手工具往返界面

![真实助手完成两轮工具调用](/Users/rozx/.codex/visualizations/2026/09/24/01a0d477-c01a-7001-a533-d24e76061034/ai-sdk-validation/chat-verified.png)

## 测试设置记录

早期一次无章节关联的翻译测试没有可提交译文的工具，另一次遗漏调用方保存回调，一次请求数上限过低。均保留为测试设置失败记录，修正为完整书籍/章节、增量保存和有界完整任务流程后复测通过，不把这些设置问题归因于 SDK 或厂商。

## 自动化验证与 gate

- 全量测试：2,757 通过，1 个已记录的 legacy 预期失败，5 个跳过。
- lint、type-check、quality-check、SPA 生产构建、OpenSpec 严格校验通过。
- 任务 7.3 已提前完成。原生 Gemini/OpenRouter 矩阵、FlashX 权限与 DeepSeek 不透明错误仍存在限制；这一 checkpoint 尚未批准调整验收范围，因此当时未切换默认实现或删除 legacy。
- 原始的去敏感记录见 `spike-progress.json`。测试错误原文来自实际 API，未编造缺失的状态或 usage。

## 最终验收范围确认

用户于 2026-09-24 明确选择“按当前范围验收，完成切换”：以现有兼容路由下六种可用模型的真实验证为验收范围。原生 Gemini/OpenRouter 直连未覆盖、FlashX 订阅受限、DeepSeek 不透明超限错误作为已知限制保留。按此确认移除旧实现和开关，AI SDK 成为唯一后端。后续上下文验收见 [context-report.md](context-report.md)，最终质量与构建数据见 ../tasks.md。
