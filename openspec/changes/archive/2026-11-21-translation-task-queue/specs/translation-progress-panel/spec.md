## MODIFIED Requirements

### Requirement: 未读活动通知

当用户正在查看任务 A 的详情，而任务 B 有新的思考/输出更新时，系统 SHALL 在任务中心列表中为任务 B 显示通知指示。

#### Scenario: 非当前任务有新活动

- **WHEN** 非当前打开详情的任务收到新的 thinkingMessage 或 outputContent 更新
- **THEN** 任务中心列表中该任务的行 MUST 显示橙色通知圆点

#### Scenario: 切换到有通知的任务

- **WHEN** 用户打开有未读通知的任务的详情
- **THEN** 系统 MUST 清除该任务的通知指示

## REMOVED Requirements

### Requirement: 单任务聚焦视图

**Reason**: 任务详情改在任务中心中查看：列表同时可见多个任务的概要，点击任务行打开该任务的详情视图。

**Migration**: 由 `header-task-center` 的「popup 分区」与「任务详情视图」取代；任务状态栏、待办区、统一流式内容区与内联工具调用显示的要求保持不变，作用于详情视图。

### Requirement: 下拉任务切换器

**Reason**: 任务列表本身即可切换，下拉选择器多余。

**Migration**: 在任务中心直接点击任务行打开详情；「仅本章」过滤不再提供，列表行显示书名与章节标题用于区分。

### Requirement: 底部操作栏

**Reason**: 停止、清除等操作移到任务行与分组标题上，不再需要面板底部固定操作栏。

**Migration**: 由 `header-task-center` 的「任务中心中的队列操作」取代。

### Requirement: 组件拆分

**Reason**: `TranslationProgress` 容器组件随右侧进度页签一起删除，组件组织改由任务中心的设备变体结构定义。

**Migration**: 任务中心遵循 `device-variant-dispatch` 的 dispatcher + 三变体规则；状态栏、待办、流式内容等子组件在详情视图中复用。
