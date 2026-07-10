## ADDED Requirements

### Requirement: Novel 数据模型的任务模型覆盖字段

系统 SHALL 在 `Novel` 数据模型中提供可选字段 `taskModelOverrides`（`{ translation?: string | null; proofreading?: string | null }`），值为 AI 模型 ID；`undefined` 或 `null` 表示跟随全局默认。该字段 SHALL 随 novel 条目整书序列化同步（Gist manifest），MUST 向后兼容（旧数据无此字段时行为与现状一致）。

#### Scenario: 旧版书籍数据无此字段

- **GIVEN** `Novel` 对象无 `taskModelOverrides` 字段
- **WHEN** 系统为该书籍解析任务模型
- **THEN** 系统 SHALL 使用全局默认模型，行为与引入本功能前一致

#### Scenario: 覆盖随书同步

- **GIVEN** 用户为某书籍设置了模型覆盖并触发云同步
- **WHEN** 另一设备拉取该书籍
- **THEN** `taskModelOverrides` SHALL 随书籍数据一并到达

### Requirement: 模型解析优先级（getModelForTask）

系统 SHALL 提供 `getModelForTask(task, book?)` 解析逻辑：当 `book.taskModelOverrides[task]` 存在且指向**已启用**的模型时返回该模型；否则回退到全局默认（`getDefaultModelForTask(task)`，即 settings.taskDefaultModels → 模型 isDefault 兜底）。覆盖指向已删除或已禁用的模型时系统 MUST 静默回退全局默认，MUST NOT 报错或中断任务，MUST NOT 自动清理该覆盖字段。

#### Scenario: 覆盖命中已启用模型

- **GIVEN** 某书籍 `taskModelOverrides.translation` 指向一个已启用的模型
- **WHEN** 系统为该书籍解析翻译任务模型
- **THEN** 系统 SHALL 返回该覆盖模型

#### Scenario: 覆盖模型已被禁用或删除

- **GIVEN** 某书籍 `taskModelOverrides.proofreading` 指向的模型已被禁用或删除
- **WHEN** 系统为该书籍解析校对·润色任务模型
- **THEN** 系统 SHALL 静默返回全局默认模型
- **AND THEN** `taskModelOverrides.proofreading` 字段 SHALL 保持原值不被清理

#### Scenario: 覆盖为 null 或未传 book

- **WHEN** `taskModelOverrides[task]` 为 `null`，或调用时未提供 book
- **THEN** 系统 SHALL 返回全局默认模型

#### Scenario: 全局默认也缺失

- **GIVEN** 某任务无本书覆盖且无全局默认模型
- **WHEN** 系统解析该任务模型
- **THEN** 系统 SHALL 返回 `undefined`，调用方按现有「未找到可用模型」toast 路径处理

### Requirement: 覆盖生效范围（5 个消费点）

书籍模型覆盖 SHALL 在以下场景生效：整章翻译、整章校对、段落润色/校对、AI 工具 `add_translation` 的兜底模型解析、手机阅读器顶栏模型名显示。术语翻译（termsTranslation）、助手（assistant）与解释任务 MUST NOT 受本书覆盖影响。

#### Scenario: 整章翻译使用本书覆盖模型

- **GIVEN** 某书籍设置了 `taskModelOverrides.translation`
- **WHEN** 用户对该书任一章节发起整章翻译
- **THEN** 任务 SHALL 使用覆盖模型执行

#### Scenario: 段落润色使用本书覆盖模型

- **GIVEN** 某书籍设置了 `taskModelOverrides.proofreading`
- **WHEN** 用户对该书某段落发起润色或校对
- **THEN** 任务 SHALL 使用覆盖模型执行

#### Scenario: 手机阅读器显示覆盖模型名

- **GIVEN** 某书籍设置了 `taskModelOverrides.translation`
- **WHEN** 用户在手机端打开该书阅读器
- **THEN** 顶栏模型名 SHALL 显示覆盖模型的名称而非全局默认

#### Scenario: 术语翻译不受覆盖影响

- **GIVEN** 某书籍设置了任务模型覆盖
- **WHEN** 用户对该书发起术语翻译
- **THEN** 任务 SHALL 仍使用全局 termsTranslation 默认模型

### Requirement: 模型覆盖下拉 UI

翻译设置表单的「模型覆盖」分组 SHALL 提供两个下拉（翻译模型、校对·润色模型）。每个下拉的选项 SHALL 为「跟随全局默认（当前：<全局默认模型名>）」加上全部已启用模型。当覆盖指向失效模型时下拉 SHALL 显示失效占位态且不自动改写数据，用户重选后才写入。

#### Scenario: 选择跟随全局默认

- **GIVEN** 某书籍已有翻译模型覆盖
- **WHEN** 用户在下拉中选择「跟随全局默认」并保存
- **THEN** `taskModelOverrides.translation` SHALL 被清除（置 null 或删除），后续任务回退全局默认

#### Scenario: 覆盖模型失效时的显示

- **GIVEN** 某书籍覆盖指向的模型已被删除
- **WHEN** 用户打开翻译设置面板
- **THEN** 对应下拉 SHALL 显示失效占位态（而非静默显示为跟随全局）
- **AND THEN** 用户不保存时数据 SHALL 保持原值
