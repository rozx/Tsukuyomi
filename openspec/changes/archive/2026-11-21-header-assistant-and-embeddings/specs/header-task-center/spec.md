## ADDED Requirements

### Requirement: 后台向量化区

本地嵌入开启时，任务中心 SHALL 在「其他 AI 活动」区上方显示「后台 · 向量化」区，承载嵌入队列的进度与常用操作（具体行为见 `chapter-embedding-search` 的「Batch embeddings popup UI」）；该区 MUST NOT 计入章节任务队列的数量、并发名额或排队顺序。

#### Scenario: 区头内容

- **WHEN** 本地嵌入开启且用户打开任务中心
- **THEN** 后台区区头 MUST 显示待处理总数与暂停 / 继续按钮，并可折叠；折叠状态 MUST 在关闭并重新打开任务中心后保持

#### Scenario: 低频操作收进菜单

- **WHEN** 用户在书籍页展开后台区
- **THEN** 「补齐缺失」MUST 直接显示，「重建本书章节向量」「测试查询」「嵌入设置」MUST 位于「⋯」菜单中

#### Scenario: 三端一致

- **WHEN** 用户在桌面 popup、固定悬浮面板或手机底部抽屉中打开任务中心
- **THEN** 后台区 MUST 以相同的内容与操作出现

#### Scenario: 只在可见时刷新统计

- **WHEN** 任务中心未打开，或后台区处于折叠状态
- **THEN** 系统 MUST NOT 为后台区重新计算本书的章节与记忆嵌入统计

### Requirement: 向量化活动在 chip 上的表现

嵌入队列正在处理或有待处理项（且既未被用户暂停、也未被云同步挂起）时，任务中心 chip SHALL 将其视为后台活动：没有章节任务运行或排队时显示活动指示；MUST NOT 计入章节任务的运行数、排队数或进度条。

#### Scenario: 只有向量化在运行

- **WHEN** 没有章节任务，嵌入队列正在处理
- **THEN** chip MUST 显示活动指示（如脉冲圆点），MUST NOT 显示进度条

#### Scenario: 章节任务与向量化同时进行

- **WHEN** 有 2 个运行中的章节任务，嵌入队列也在处理
- **THEN** chip 显示的运行数与进度条 MUST 只反映章节任务

#### Scenario: 向量化暂停

- **WHEN** 嵌入队列已被用户暂停或被云同步挂起，且没有其他活动
- **THEN** chip MUST 显示为空闲状态

#### Scenario: 任务中心从未打开过

- **WHEN** 应用启动后用户从未打开任务中心，而嵌入队列开始处理
- **THEN** chip MUST 显示活动指示
