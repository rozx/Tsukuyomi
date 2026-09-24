# 模型资料、可用性与思考等级补充验证

2026-09-24，按用户新增要求实施。

## 行为

- **获取模型资料**：仅查询由 [models.dev](https://models.dev) 生成的离线目录。未收录时保留已有值，并提示手动填写；不再发送模型自述提示词。兼容 `gpt-6-sol(high)` 等常见思考后缀，实际 API 请求保留原始模型 id。
- **测试可用性**：当前表单的 endpoint、key、headers、CORS 和思考等级进入一条短生成调用，最多等待 30 秒，输出上限最多 2,048 tokens。显示结果和耗时，不修改或保存模型字段。编辑或关闭时取消，迟到响应不会标记新配置为可用。
- **思考等级**：provider-default / none / minimal / low / medium / high / xhigh。使用 AI SDK 7 的标准 reasoning 参数；OpenAI 兼容 provider 生成 reasoning_effort，Google provider 按型号生成 thinkingLevel 或 thinkingBudget。具体型号可能只接受部分等级，可用测试验证。字段随新增、编辑、导入导出和同步保留，全部任务入口使用公共配置构造器。

## 自动化

2,820 项测试通过、5 项既有测试跳过；lint、type-check、Fallow、OpenSpec strict 和 diff 检查通过。覆盖厂商请求体（含 Gemini 2.5/3）、各任务传参、默认行为、目录别名、保存/同步与清除等级、超时/取消、过期响应及初始化时可见的弹窗。

## 浏览器

- 原有 GPT-6 Sol 配置，资料查询得到 922,000 / 128,000；显式选择“高”，点击独立可用性测试，真实服务成功响应，2,478 ms。
- 手机 390×844 下新增 gpt-4o，无密钥即可查询 128,000 / 16,384 的目录资料，测试按钮仍禁用；改为未知型号后保留数值并显示目录未收录提示。
- 所有测试表单改动通过“放弃修改并关闭”清理，未保存模型改动；viewport 已恢复。未新增模型或改变任务路由。

![桌面独立可用性测试](/Users/rozx/.codex/visualizations/2026/09/24/01a0d477-c01a-7001-a533-d24e76061034/model-options/desktop.png)

![手机模型资料与思考等级](/Users/rozx/.codex/visualizations/2026/09/24/01a0d477-c01a-7001-a533-d24e76061034/model-options/mobile.png)
