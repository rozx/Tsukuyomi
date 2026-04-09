## ADDED Requirements

### Requirement: Date fallback comparison

当本地章节的 `lastUpdated` 为空时，`shouldUpdateChapter` SHALL 回退对比远程 `lastUpdated` 与本地 `createdAt`（导入日期），以判断远程是否有更新。

#### Scenario: Remote has lastUpdated, local has lastUpdated

- **WHEN** 远程章节有 `lastUpdated` 且本地章节也有 `lastUpdated`
- **THEN** 系统 SHALL 比较两者的 `lastUpdated`，远程更新则返回 true

#### Scenario: Remote has lastUpdated, local missing lastUpdated

- **WHEN** 远程章节有 `lastUpdated` 但本地章节的 `lastUpdated` 为空
- **THEN** 系统 SHALL 比较远程 `lastUpdated` 与本地 `createdAt`，远程更新则返回 true

#### Scenario: Remote missing lastUpdated

- **WHEN** 远程章节没有 `lastUpdated`（宽松策略）
- **THEN** 系统 SHALL 返回 false，不标记该章节为有更新

### Requirement: Content change detection

系统 SHALL 提供 `hasContentChanged` 方法，在远程章节内容实际加载后，对比远程文本与本地 `originalContent` 来检测内容是否发生变化。

#### Scenario: Remote content differs from local originalContent

- **WHEN** 远程章节内容加载完成，且远程文本（去除首尾空白后）与本地 `originalContent`（去除首尾空白后）不同
- **THEN** 系统 SHALL 返回 true，表示内容有变化

#### Scenario: Remote content matches local originalContent

- **WHEN** 远程章节内容加载完成，且远程文本与本地 `originalContent` 相同
- **THEN** 系统 SHALL 返回 false

#### Scenario: Local chapter has no originalContent

- **WHEN** 本地章节的 `originalContent` 为空（如手动创建的章节）
- **THEN** 系统 SHALL 返回 true（保守认为有变化）

### Requirement: Dynamic update status in scraper dialog

NovelScraperDialog 在加载远程章节内容后，SHALL 利用 `hasContentChanged` 动态更新已导入章节的状态标记。

#### Scenario: Content loaded and changed

- **WHEN** 在爬虫对话框中，已导入章节的远程内容加载完成，且 `hasContentChanged` 返回 true
- **THEN** 该章节的导入状态标记 SHALL 更新为"已导入（有更新）"，并自动勾选

#### Scenario: Content loaded but unchanged

- **WHEN** 在爬虫对话框中，已导入章节的远程内容加载完成，且 `hasContentChanged` 返回 false
- **THEN** 该章节的导入状态标记 SHALL 保持为"已导入"，不自动勾选
