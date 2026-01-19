## ADDED Requirements

### Requirement: 全局配置缓存（GlobalConfig）
系统 MUST 提供一个全局配置缓存/访问层（GlobalConfig），使应用在运行时可在任何模块中访问 settings/config，而不需要在运行过程中反复读取 IndexedDB。

#### Scenario: 初始化后读取不再触发数据库访问
- **GIVEN** 应用已完成启动流程并初始化 GlobalConfig
- **WHEN** 任意模块读取应用设置（app settings）或同步配置（sync configs）
- **THEN** 系统 MUST 从内存快照返回配置
- **AND** 系统 MUST NOT 因该读取操作而触发新的 IndexedDB 读取

#### Scenario: 初始化后读取书籍级配置不再触发数据库访问
- **GIVEN** 应用已完成启动流程并初始化 GlobalConfig
- **WHEN** 任意模块读取某本书籍的书籍级配置（例如 `skipAskUser`）
- **THEN** 系统 MUST 从内存快照返回配置
- **AND** 系统 MUST NOT 因该读取操作而触发新的 IndexedDB 读取

### Requirement: 与 store 一致性
当 settings/books 等 store 的配置发生变更时，GlobalConfig MUST 反映最新值，且同一进程/同一窗口内读取结果不得落后于 store。

#### Scenario: 更新 settings 后立即可读
- **GIVEN** GlobalConfig 已初始化
- **WHEN** 用户修改应用设置并触发 settings store 更新
- **THEN** 随后的 GlobalConfig 读取 MUST 返回更新后的值

#### Scenario: 更新书籍设置后立即可读
- **GIVEN** GlobalConfig 已初始化
- **WHEN** 用户修改某书籍的书籍级设置并触发 books store 更新
- **THEN** 随后的 GlobalConfig 读取 MUST 返回更新后的值

### Requirement: 可在非组件上下文使用
GlobalConfig MUST 提供可在非组件/非 store 直接使用的访问 API（例如同步获取快照与可选的初始化函数），以支持工具层与纯服务模块读取配置。

#### Scenario: AI tools 读取配置
- **GIVEN** AI 工具 handler 在非组件上下文执行
- **WHEN** AI 工具需要读取 settings/config（例如书籍级 `skipAskUser`）
- **THEN** 工具 MUST 能通过 GlobalConfig 读取所需配置

