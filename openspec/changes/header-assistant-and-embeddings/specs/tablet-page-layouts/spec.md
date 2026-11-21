## ADDED Requirements

### Requirement: 平板左侧面板开关位于顶部信息条

平板书库页的书籍列表开关与书籍详情页的卷 / 章节目录开关 SHALL 显示在平板顶部实用信息条的最左侧（由页面渲染到顶部信息条提供的挂载点），页面 MUST NOT 再渲染右侧竖向图标栏。开关状态与横竖屏默认值仍由页面自己的 composable 持有；竖屏打开时列表 / 目录为叠层（点外侧关闭），横屏打开时参与布局。

#### Scenario: 开合书籍列表

- **WHEN** 用户在平板书库页点击顶部信息条最左侧的开关
- **THEN** 书籍列表 MUST 打开或收起，按钮 MUST 反映当前状态：打开时标题为「收起书籍列表」、图标为 `pi-angle-double-left`、`aria-pressed` 为 true；收起时标题为「展开书籍列表」、图标为 `pi-bars`

#### Scenario: 开合目录

- **WHEN** 用户在平板书籍详情页点击顶部信息条最左侧的开关
- **THEN** 卷 / 章节目录 MUST 打开或收起，按钮标题 MUST 在「收起目录」与「展开目录」之间切换，并同样反映 `aria-pressed` 与图标

#### Scenario: 竖屏叠层仍可点外侧关闭

- **WHEN** 平板竖屏下列表或目录以叠层打开，用户点击叠层外侧
- **THEN** 叠层 MUST 关闭，顶部信息条的开关 MUST 同步变为收起状态

#### Scenario: 其他页面不显示开关

- **WHEN** 用户从书库页或书籍详情页导航到首页、设置等其他页面，或窗口切换到桌面 / 手机断点
- **THEN** 顶部信息条 MUST NOT 保留该开关，挂载点 MUST NOT 占用宽度

#### Scenario: 页面右侧没有竖栏

- **WHEN** 平板书库页或书籍详情页渲染
- **THEN** 页面 MUST NOT 渲染右侧竖向图标栏，内容区 MUST 延伸到窗口右边缘；助手入口在顶部信息条（见 `tablet-shell-chrome`），向量化在任务中心（见 `header-task-center`）
