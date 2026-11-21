## Why

导入工作台在三端各走各的：手机把对话和来源、草稿、方案并列成分区，页面上同时出现两个「月詠」，用户也看不出下一步该做什么；桌面和平板仍是「来源 / 卷章草稿 / 导入方案」三个标签，加上运行条上的继续、暂停按钮，流程顺序只能靠用户自己摸索；平板竖屏把对话塞成工作区的第一个标签。现行 spec 还要求导入对话「不能被收起」，与手机抽屉、平板竖屏滑入面板的新做法冲突，需要同步。

## What Changes

- 三端已打开的任务统一按「来源 → 整理 → 导入」三步引导：
  - 顶部显示三步进度（已完成、当前该做、正在查看），每一步可点选查看；
  - 底部是正在查看这一步唯一的主按钮：「让月詠开始整理」/「继续整理」/「暂停整理」/「生成导入方案」；
  - 「导入」这一步沿用导入方案自带的生成与确认导入，不再显示底部主按钮。
- 移除工作区的「来源 / 卷章草稿 / 导入方案」标签，以及运行条上的继续、暂停按钮。运行条只保留任务名、状态、章节进度和需要注意的提示。
- 打开任务时按进度落到对应的一步：
  - 没有来源 → 来源；
  - 方案未生成 → 整理；
  - 方案已生成 → 导入。

  点「让月詠开始整理」后切到「整理」，生成方案后切到「导入」。

- 月詠对话按设备放置：
  - 桌面停靠在右栏，导入路由下保持展开；平板横屏常驻停靠。
  - 平板竖屏和手机不再停靠。任务顶部显示月詠预览：运行状态、正在输出的最后一行，或最近一条回复的开头。
  - 点预览打开对话：平板竖屏从右侧滑入，手机为底部抽屉。两者都可以关闭，离开导入路由时自动关闭；未发送的输入按任务保留。
- **BREAKING**（spec 层面）：放宽「导入工作台 MUST NOT 提供隐藏该对话的操作」。平板竖屏和手机的对话可以关闭，随时可从月詠预览重新打开。
- 平板和手机的导入页分为「任务列表」与「任务」两层，任务内提供返回任务列表的操作。手机底部栏没有导入入口，改从首页「快速操作」和书库「+」菜单进入 AI 导入。
- 来源和整理两步把常用内容放在前面：
  - 已有来源时，来源列表排在前，「添加来源」收成按钮；
  - 「整理」这一步卷章结构在前，「基本信息」可折叠，折叠时显示书名与作者摘要。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ai-import-workspace`:
  - 修改「独立导入入口与设备适配」：对话按设备放置与月詠预览、任务列表与任务两层、手机入口。「对话默认可见」场景收窄为桌面与平板横屏，平板竖屏与手机另立「竖屏与手机从月詠预览打开对话」场景。
  - 新增「「来源 → 整理 → 导入」三步引导」：三步进度、打开任务时落到的步骤、每步唯一的主按钮。

## Impact

- **组件**
  - 新增：`ImportStepBar`、`ImportStepFooter`、`ImportRunNotices`、`ImportAssistantPreview`、`ImportChatSheet`、`ImportMobileTask`。
  - 改写：`ImportTaskWorkspace`（删除标签，改为三步）。
  - 精简：`ImportRunBar`。
  - 调整：`ImportSourcePanel`（`list-first`）、`ImportDraftPanel`（`structure-first`）、`ImportTaskList`（`navigable`）。
- **composables**
  - 新增：`import-steps`、`useImportFlow`、`useImportTaskName`、`import-assistant-preview`。
  - 修改：`useImportPage`（`landingSection`、`closeTask`、`leave`）、`useImportChatPanel`（按任务保留输入）。
- **布局**：`MainLayoutTablet` 在竖屏把导入对话放进右侧滑入面板；`MainLayoutMobile` 把导入对话放进底部抽屉。
- **文案与文档**：`importUi.flow.*`、`importUi.chat.preview*` 等新文案，删除旧标签文案；帮助文档 `import-guide` 三语同步。
- **与 `header-assistant-and-embeddings` 的交集**：平板顶部栏的「月詠」按钮在导入路由下按横竖屏区分。横屏对话常驻停靠，按钮保持激活态、点击无效；竖屏开关右侧滑入的导入对话。该 change 的 design、spec、tasks 已同步。
