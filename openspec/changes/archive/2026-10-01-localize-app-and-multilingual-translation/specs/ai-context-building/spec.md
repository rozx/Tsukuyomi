## MODIFIED Requirements

### Requirement: Memory context formatting in prompts

Selected memories SHALL be injected as a single section localized to the execution UI language (`【相关记忆】` in zh-CN) listing each memory's ID and summary.

#### Scenario: Formatting selected memories

- **GIVEN** memories were selected for a chunk
- **WHEN** the memory section is rendered
- **THEN** it is the localized section heading followed by one line per memory in the form `  - [<id>] <summary>`, in score order
- **AND** memory content is not inlined; the AI can fetch it with `get_memory`

#### Scenario: Scoring fails

- **GIVEN** relevance scoring throws an error
- **WHEN** the chunk context is built
- **THEN** the system falls back to the most recently accessed memories (up to 15) in the same format

## ADDED Requirements

### Requirement: 目标语言上下文与共享原文数据

自动上下文、前章/本章标题、前后段落及查询工具返回的译文 SHALL 仅取执行目标语言；术语、角色与别名译名缺失时为空。用于记忆评分的实体译名也 SHALL 采用同一语言选择。用户特殊指令、角色描述、说话风格及剧情记忆 SHALL 保持原内容并继续参与检索，不能因原语言不同被排除或自动改写。

#### Scenario: 首次英文翻译

- **GIVEN** 书籍只有简中译文/译名以及中文剧情记忆
- **WHEN** 为英文任务生成上下文及其记忆预览
- **THEN** 上下文 SHALL 包含原文、空的英文译名及相关共享记忆，不包含简中译文作为默认参考
- **AND** 预览与同目标语言的实际注入 SHALL 使用相同选择
