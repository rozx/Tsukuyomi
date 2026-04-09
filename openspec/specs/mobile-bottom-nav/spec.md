# mobile-bottom-nav Specification

## Purpose
TBD - created by archiving change mobile-bottom-nav. Update Purpose after archive.
## Requirements
### Requirement: 移动端底部导航栏

在手机和平板设备（屏幕宽度 ≤1279px）上，工作区切换导航栏（目录/内容/设置/进度）SHALL 显示在内容区域的底部，而非顶部。

#### Scenario: 内容模式下底部导航可见
- **WHEN** 用户在手机端打开书籍详情页（内容模式）
- **THEN** 工作区切换栏显示在屏幕底部，章节工具栏紧贴 AppHeader 下方

#### Scenario: 目录模式下底部导航可见
- **WHEN** 用户切换到目录模式
- **THEN** 目录侧栏填满底部导航上方的全部空间，底部导航始终可见

#### Scenario: 设置模式下底部导航可见
- **WHEN** 用户切换到设置模式
- **THEN** 设置面板填满底部导航上方空间，底部导航始终可见

#### Scenario: 底部导航激活状态正确反映
- **WHEN** 当前工作区模式为「内容」
- **THEN** 「内容」按钮显示激活样式，其余按钮显示非激活样式

### Requirement: 手机端隐藏版权页脚

在手机设备（deviceType === 'phone'）上，全局页脚（AppFooter，含版权信息）SHALL 不渲染，以节省屏幕空间。

#### Scenario: 手机端无页脚
- **WHEN** 用户在手机设备上访问任意页面
- **THEN** 页面底部不显示版权信息条

#### Scenario: 非手机设备保留页脚
- **WHEN** 用户在平板或桌面设备上访问
- **THEN** 页脚正常显示

