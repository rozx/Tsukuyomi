## ADDED Requirements

### Requirement: 桌面书库页分层头部

`BooksPageDesktop` MUST 呈现桌面工作台式头部，包含 `Library` eyebrow、主标题、一行摘要、汇总指标，以及复用 `injectBooksPage()` 现有搜索、排序、添加入口的工具条。

#### Scenario: 书库头部展示汇总与工具条

- **WHEN** 用户在桌面端进入书库页
- **THEN** 页面 MUST 渲染基于现有书籍集合的汇总信息，并保留搜索、排序和添加书籍入口的一跳可达性

#### Scenario: 搜索状态在桌面头部中保持可见

- **WHEN** 用户在桌面书库页输入搜索条件
- **THEN** 页面 MUST 在同一头部工具条中反映当前搜索状态并允许直接清除，而不是跳转到独立筛选面板

### Requirement: 桌面封面优先书架卡片

`BooksPageDesktop` MUST 以封面优先的桌面书架卡片展示书籍，强调书名、作者和紧凑元数据，并将收藏、编辑、删除等操作降为次级但保持直接可达。

#### Scenario: 点击卡片主区域进入书籍详情

- **WHEN** 用户点击桌面书架卡片的封面或标题主区域
- **THEN** 系统 MUST 进入该书的详情页，并保持现有 `navigateToBookDetails` 路由行为

#### Scenario: 卡片次级操作保持一跳可达

- **WHEN** 用户在桌面书架卡片上执行收藏、编辑或删除
- **THEN** 系统 MUST 直接调用现有对应行为，而无需先进入书籍详情页

### Requirement: 桌面书库保持高密度浏览能力

`BooksPageDesktop` MUST 保持桌面端的多列分页浏览能力，并 MUST NOT 退化为 tablet 的 master-detail 预览或 mobile 的单列卡片流。

#### Scenario: 桌面宽度下保持多列分页

- **WHEN** 用户在桌面宽度浏览书库
- **THEN** 页面 MUST 以多列网格展示书籍并保留分页控制，支持批量扫描而非单本预览优先

#### Scenario: 空结果与空书库仍保留桌面工作台壳层

- **WHEN** 搜索无结果或书库为空
- **THEN** 页面 MUST 在同一桌面工作台画布中展示空状态，而不是切换为移动端式全屏提示页
