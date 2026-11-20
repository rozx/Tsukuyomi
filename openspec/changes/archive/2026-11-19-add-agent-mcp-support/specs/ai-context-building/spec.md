# Spec Delta

## ADDED Requirements

### Requirement: 写法接近的术语与角色作为「可能相关」提示
系统 SHALL 在为翻译、润色与校对构建上下文时，除了原文中确切出现的术语与角色之外，找出原文写法与术语名、角色全名或别名非常接近但不完全相同的条目（例如原文的错字或同音异写），并 MUST 将它们与确切命中的条目分开，作为「可能相关」单独列出，同时标明原文中的实际写法，由模型自行确认是否为同一个词。

#### Scenario: 原文把术语写错一个字
- **WHEN** 某术语名为四个字以上，原文中没有该术语的确切写法，但有一处与它只差一个字
- **THEN** 上下文在「可能相关的术语」中列出该术语及其译名，并标明原文里的写法；它不出现在确切命中的术语列表中

#### Scenario: 名称较长时容许更多差异
- **WHEN** 术语名或角色名在七个字以上，原文中有一处与它相差一两个字，或多一个字、少一个字
- **THEN** 该条目同样作为「可能相关」列出

#### Scenario: 原文中已有确切写法
- **WHEN** 原文中出现了某术语或角色的确切写法（含别名、姓或名单独出现、带分隔符的全名与注音写法等精确匹配能认出的情形）
- **THEN** 该条目只作为确切命中出现，不重复列为「可能相关」

#### Scenario: 片段跨过标点
- **WHEN** 原文中与名称接近的那一段里夹着名称本身没有的标点或空白
- **THEN** 系统不把它当作近似写法

#### Scenario: 名称太短不做近似匹配
- **WHEN** 术语名或角色名不足四个字
- **THEN** 系统不为它做近似匹配

#### Scenario: 那一处其实是另一个已知名称
- **WHEN** 原文中与某名称接近的那一段，本身是书中另一个术语或角色的确切名称
- **THEN** 系统不把它当作前一个名称的近似写法

#### Scenario: 差异只在标点或空白上
- **WHEN** 原文片段与名称的差异落在标点或空白上
- **THEN** 系统不把它当作近似写法

#### Scenario: 同一个名字换了一种敬称
- **WHEN** 角色的别名是「名字加敬称」，原文中出现的是同一个名字配另一种敬称，且没有该别名的确切写法
- **THEN** 该角色作为「可能相关」列出并标明原文里的写法；名字很短且前面紧挨着汉字时不算

#### Scenario: 敬称相同但名字不同
- **WHEN** 原文中某个称呼与角色别名只是敬称相同、名字不同
- **THEN** 系统不把它当作该角色的近似写法

#### Scenario: 名称后面跟着助词
- **WHEN** 原文片段与名称只差一个字，且名称里那个位置是汉字或片假名、原文里是平假名
- **THEN** 系统不把它当作近似写法

#### Scenario: 没有近似写法
- **WHEN** 原文中不存在与任何术语或角色名接近的写法
- **THEN** 上下文中不出现「可能相关」一节

## MODIFIED Requirements

### Requirement: Chapter summary is not injected automatically

The system SHALL NOT inject chapter summaries into AI task prompts. The previous-chapter summary and the current-chapter summary context blocks are removed. Previous-chapter context is limited to verbatim continuity material: the previous chapter's title, the translated titles of the most recent chapters, and the last few translated paragraphs of the previous chapter.

#### Scenario: Previous chapter context minimized to title only

- **GIVEN** a translation chunk is being built for chapter N
- **WHEN** the previous chapter (N-1) exists but has no translated paragraphs, and no earlier chapter has a translated title
- **THEN** the prompt MAY include only the previous chapter's title for continuity awareness
- **AND** the prompt MUST NOT include any summary text for the previous chapter

#### Scenario: Previous chapter continuity material

- **GIVEN** a translation chunk is being built for chapter N
- **WHEN** the previous chapter (N-1) has translated paragraphs, or earlier chapters have translated titles
- **THEN** the prompt MAY additionally include the source and translated titles of the most recent chapters that already have a translated title, and the last few translated paragraphs of the previous chapter (source text and translation), so that tone, punctuation habits, fixed closing phrases and title format carry over
- **AND** paragraphs that are empty, contain only symbols, or have no translation MUST NOT be used as continuity material
- **AND** the prompt MUST NOT include any summary text for the previous chapter

#### Scenario: Single-paragraph default context excludes chapter summary

- **GIVEN** a single-paragraph polish or proofread task is being prepared
- **WHEN** the default context is assembled
- **THEN** the context MUST NOT include a chapter-summary section
- **AND** the existing terminology / character / surrounding-paragraphs sections are unaffected
