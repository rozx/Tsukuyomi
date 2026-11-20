## Purpose

定义顶部系统条上的任务中心：合并原「AI 思考」入口，用一个 chip 显示章节任务队列的整体状态，点开后在 popup 中查看、展开和操作所有任务，并可固定成悬浮面板或收起成迷你进度条。

## ADDED Requirements

### Requirement: 任务中心入口替换 AI 思考入口

桌面、平板和手机的顶部系统条 SHALL 在原「AI 思考」chip 的位置显示唯一的任务中心 chip；系统 MUST NOT 同时显示独立的「AI 思考」入口。

#### Scenario: 三种设备都只有一个 AI 任务入口

- **WHEN** 应用在桌面、平板或手机断点下渲染顶部系统条
- **THEN** 系统条 MUST 显示任务中心 chip，且 MUST NOT 显示单独的「AI 思考」chip

### Requirement: chip 状态

任务中心 chip SHALL 按队列与其他 AI 活动的状态显示不同形态。

#### Scenario: 全部空闲

- **WHEN** 没有排队、运行中的章节任务，也没有运行中的其他 AI 活动，且没有未查看的批次结果
- **THEN** chip MUST 显示为不带数字和进度条的安静图标

#### Scenario: 只有章节任务运行

- **WHEN** 有运行中的章节任务且没有排队项
- **THEN** chip MUST 显示运行数和整体进度条

#### Scenario: 有运行和排队

- **WHEN** 有运行中的章节任务且有排队项
- **THEN** chip MUST 显示运行数、排队数，以及区分已完成 / 运行中 / 未开始的分段进度条

#### Scenario: 只有其他 AI 活动

- **WHEN** 没有章节任务在运行或排队，但有运行中的助手、单段任务或术语翻译
- **THEN** chip MUST 显示活动指示（如脉冲圆点），MUST NOT 显示进度条

#### Scenario: 批次结束后保留结果

- **WHEN** 一批章节任务全部结束
- **THEN** chip MUST 显示完成数与失败数，直到用户打开任务中心或清除已完成项

#### Scenario: 队列暂停

- **WHEN** 队列处于暂停状态且有排队项
- **THEN** chip MUST 显示暂停标识和排队数

### Requirement: 新任务提示不打断当前操作

新的章节任务入队或开始运行时，系统 SHALL 只让 chip 播放短暂的提示动效，MUST NOT 自动打开任务中心 popup，MUST NOT 改变右侧面板的打开状态或内容。

#### Scenario: 手动启动翻译

- **WHEN** 用户在阅读页启动整章翻译
- **THEN** chip MUST 播放提示动效，任务中心 popup 和右侧面板 MUST 保持原状

### Requirement: popup 分区

点击 chip SHALL 打开任务中心 popup。popup 上半区为章节任务队列，按「进行中」「排队中」「已完成」分组；下半区为可折叠的「其他 AI 活动」。

#### Scenario: 打开 popup

- **WHEN** 用户点击任务中心 chip
- **THEN** popup MUST 显示进行中、排队中、已完成三组章节任务及各组数量，标题区 MUST 显示当前运行数与并发上限（如「并发 2/2」）

#### Scenario: 行内显示书籍与章节

- **WHEN** popup 渲染任一章节任务行
- **THEN** 该行 MUST 显示任务类型、书名与章节标题；进行中的行 MUST 显示进度条与段落进度

#### Scenario: 无任何任务

- **WHEN** 队列为空且没有其他 AI 活动
- **THEN** popup MUST 显示空状态提示

### Requirement: 行内展开任务详情

用户 SHALL 能在 popup 中展开任一章节任务行查看详情；同一时间最多展开一行。

#### Scenario: 展开运行中的任务

- **WHEN** 用户展开一个运行中的任务行
- **THEN** 该行 MUST 显示模型名称、已用时间、分块进度、待办列表，以及按时间顺序排列的思考内容、工具调用和输出内容，流式内容区 MUST 在限定高度内滚动

#### Scenario: 展开另一行

- **WHEN** 已有展开行时用户展开另一行
- **THEN** 原展开行 MUST 收起，新行 MUST 展开

#### Scenario: 展开已结束且日志已清理的任务

- **WHEN** 用户展开一个已结束的任务行，而其详细日志已因历史上限被清理
- **THEN** 该行 MUST 显示任务结果摘要，并说明详细日志已清理

#### Scenario: 在非执行者标签页展开运行中的任务

- **WHEN** 队列在另一个标签页中执行，用户在当前标签页展开一个运行中的任务行
- **THEN** 该行 MUST 显示任务进度，并提示详细过程在另一个标签页中，MUST NOT 显示过时的思考或输出内容

#### Scenario: 打开对应章节

- **WHEN** 用户在展开行中选择打开章节
- **THEN** 系统 MUST 导航到该书籍详情页并选中该章节

### Requirement: 任务中心中的队列操作

popup SHALL 提供 chapter-task-queue 定义的全部用户操作入口。

#### Scenario: 行级操作

- **WHEN** popup 显示运行中、排队中、失败或已取消的行
- **THEN** 运行中的行 MUST 提供停止，排队中的行 MUST 提供移出并支持拖动排序，失败或已取消的行 MUST 提供重试

#### Scenario: 分组与队列级操作

- **WHEN** popup 显示排队中或已完成分组
- **THEN** 排队中分组 MUST 提供全部移除，已完成分组 MUST 提供清除；标题区 MUST 提供暂停 / 继续队列和全部停止

### Requirement: 未读活动提示

当某个未展开的任务有新的思考或输出内容时，系统 SHALL 在该任务行显示提示圆点；用户展开该行后 MUST 清除提示。

#### Scenario: 非展开任务有新活动

- **WHEN** 用户展开任务 A，任务 B 收到新的思考或输出内容
- **THEN** 任务 B 的行 MUST 显示提示圆点

#### Scenario: 展开后清除提示

- **WHEN** 用户展开带提示圆点的任务行
- **THEN** 该行的提示圆点 MUST 消失

### Requirement: 其他 AI 活动区

popup 下半区 SHALL 列出 AI 助手、单段落任务和术语翻译等非队列 AI 任务；这些任务 MUST NOT 计入队列数量、并发名额或 chip 进度条。

#### Scenario: 查看和停止其他 AI 活动

- **WHEN** 有运行中的助手对话或单段润色
- **THEN** 其他 AI 活动区 MUST 列出它们的类型、简要描述和状态，并 MUST 为运行中的项提供停止操作

#### Scenario: 清理其他 AI 活动记录

- **WHEN** 用户在其他 AI 活动区选择清除已完成或清除全部
- **THEN** 系统 MUST 删除对应的历史记录，运行中的任务 MUST NOT 被删除

#### Scenario: 折叠状态保持

- **WHEN** 用户折叠其他 AI 活动区后关闭并重新打开 popup
- **THEN** 该区 MUST 保持折叠

### Requirement: 固定成悬浮面板

在桌面和平板上，用户 SHALL 能把 popup 固定成悬浮面板；固定后的面板点击外部不关闭、可拖动位置，并在页面导航和断点切换后保持。

#### Scenario: 固定后操作阅读区

- **WHEN** 用户固定任务中心后点击阅读区或滚动章节
- **THEN** 悬浮面板 MUST 保持显示，阅读区 MUST 正常响应操作

#### Scenario: 拖动面板

- **WHEN** 用户拖动固定面板的标题区
- **THEN** 面板 MUST 移动到新位置并保持在视口内，该位置 MUST 在刷新后恢复

#### Scenario: 导航后保持

- **WHEN** 面板已固定时用户导航到其他页面
- **THEN** 面板 MUST 继续显示且展开状态不变

#### Scenario: 取消固定

- **WHEN** 用户取消固定
- **THEN** 面板 MUST 关闭，chip 回到普通 popup 行为

### Requirement: 收起成迷你进度条

固定后的面板 SHALL 可以收起成只显示运行任务摘要和整体进度的迷你条，并可一键展开。

#### Scenario: 收起

- **WHEN** 用户收起固定面板
- **THEN** 面板 MUST 缩成一条显示运行中任务名称、百分比和整体进度条的迷你条

#### Scenario: 展开

- **WHEN** 用户点击迷你条
- **THEN** 系统 MUST 恢复为收起前的固定面板

### Requirement: 手机底部抽屉

在手机断点下，点击任务中心 chip SHALL 打开底部抽屉显示相同的分组与操作；手机端 MUST NOT 提供固定或收起；点击任务行 MUST 打开该任务的全屏详情。

#### Scenario: 手机打开任务中心

- **WHEN** 用户在手机上点击任务中心 chip
- **THEN** 系统 MUST 以底部抽屉显示进行中、排队中、已完成和其他 AI 活动

#### Scenario: 手机查看任务详情

- **WHEN** 用户在底部抽屉中点击某个任务行
- **THEN** 系统 MUST 打开该任务的全屏详情，显示状态栏、待办和流式内容，并提供停止或重试操作

#### Scenario: 从阅读页进入

- **WHEN** 用户点击手机阅读页的进度按钮
- **THEN** 系统 MUST 打开任务中心底部抽屉

#### Scenario: 断点切换到手机时已固定

- **WHEN** 桌面上已固定面板，窗口缩到手机断点
- **THEN** 悬浮面板 MUST 隐藏，固定状态 MUST 保留，回到桌面断点时 MUST 重新显示
