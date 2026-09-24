# desktop-release-packaging Specification

## Purpose

定义桌面版分发包、更新源和正式发布的一致性要求，使 Windows 免安装用户及 macOS、Linux 用户能够获得匹配的平台产物，同时允许没有付费 Apple 开发者证书的维护者构建 macOS 包。

## Requirements

### Requirement: 三平台产物和版本一致

系统 MUST 生成 Windows 便携 ZIP、macOS 应用 ZIP、Linux AppImage 及对应更新包和清单。产物 MUST 标识平台架构，清单版本、应用发布版本和 tag MUST 一致。

#### Scenario: Windows 免安装分发

- **WHEN** 用户解压 Windows 便携包
- **THEN** 用户无需安装即可启动应用，包中包含后续更新所需组件

#### Scenario: 不同平台或架构

- **WHEN** 同一 release 包含多个构建目标
- **THEN** 产物及 feed 不得互相覆盖，客户端只能选择兼容目标

### Requirement: macOS 构建无需付费证书

默认 macOS 构建 MUST 不导入 Developer ID 证书或执行 Apple 公证，MUST 生成可检验的 ad-hoc 签名应用。发布说明 MUST 告知 Gatekeeper 手动放行方式及自动更新验证状态。

#### Scenario: CI 没有有效 Apple secrets

- **WHEN** CI 在未提供有效 Apple Developer 证书的情况下构建
- **THEN** 构建不得进入证书 keychain 导入流程，并输出 macOS 便携产物

### Requirement: 发布仅暴露完整更新

系统 MUST 在所有目标构建成功、清单引用文件及校验和验证成功后才公开正式 release。失败构建 MUST NOT 替换现有可用正式版本；已公开的版本不得覆盖。

#### Scenario: 一个矩阵任务失败

- **WHEN** 任意目标构建或校验失败
- **THEN** 新 release 不得公开为 latest

#### Scenario: 成功发布

- **WHEN** 全部目标产物通过验证
- **THEN** 安装包、更新包和 feed 以生成时的文件名一起发布
