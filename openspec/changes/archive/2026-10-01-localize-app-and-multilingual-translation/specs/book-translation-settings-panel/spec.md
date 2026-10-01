## MODIFIED Requirements

### Requirement: 书籍翻译设置面板内容与保存语义

书籍翻译设置面板 SHALL 包含现有 5 个书籍级开关（过滤行首空格、显示时规范化符号、显示时规范化标题、跳过 AI 追问、原文校验）、翻译任务分块大小，目标语言选择（简中、繁中、英文），以及「模型覆盖」分组（翻译模型、校对·润色模型两个下拉）。面板 MUST 采用显式保存语义（保存/取消按钮），保存 SHALL 通过 `booksStore.updateBook` 落库并给出成功 toast。

#### Scenario: 修改开关并保存

- **GIVEN** 用户在翻译设置面板中切换了「显示时规范化符号」开关
- **WHEN** 用户点击「保存」
- **THEN** `Novel.normalizeSymbolsOnDisplay` SHALL 被更新并持久化
- **AND THEN** 系统 SHALL 显示保存成功 toast

#### Scenario: 取消放弃修改

- **GIVEN** 用户在翻译设置面板中修改了任意设置但未保存
- **WHEN** 用户点击「取消」或离开面板
- **THEN** 书籍设置 SHALL 保持修改前的值

#### Scenario: 修改目标语言

- **GIVEN** 书籍当前目标为英文且已有英文版本
- **WHEN** 用户保存繁中目标语言
- **THEN** 阅读器 SHALL 选择繁中译文，缺失段落显示原文且计为待翻译，缺失术语/角色/别名译名为空
- **AND** 已有英文成果 SHALL 保留，运行中英文任务继续写英文槽，新任务使用繁中

#### Scenario: 手机目标语言设置

- **WHEN** 用户在手机的书籍级共享表单更改并保存目标语言
- **THEN** SHALL 与桌面/平板具有相同保存、取消及语言选择行为
