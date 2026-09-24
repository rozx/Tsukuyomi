# Spec Delta

## Purpose

定义 AI 模型上下文窗口与输出上限的来源与优先级：优先使用随应用打包的模型目录，目录未命中时保留手动配置，用户手动填写的值始终最优先，使上下文预算不再依赖模型对自身上限的自述。

## ADDED Requirements

### Requirement: Bundled model limits catalog

The application SHALL ship an offline catalog mapping model identifiers to their context window and maximum output tokens, generated from a public model database at build time. The catalog MUST be usable without network access and MUST NOT be loaded until limits are first needed.

#### Scenario: Known model found offline

- **WHEN** limits are requested for `deepseek-v4-flash` with no network connection
- **THEN** the catalog SHALL return its context window and output limit

#### Scenario: Separate input cap preferred

- **WHEN** a catalog entry lists both a total context window and a smaller input limit
- **THEN** the effective input limit SHALL be the smaller input limit

#### Scenario: Unknown or zero entries ignored

- **WHEN** a model is absent from the catalog, or its entry lists a context window of 0
- **THEN** the catalog lookup SHALL report no result

### Requirement: Catalog lookup matching

The lookup SHALL match the configured model name tolerant of common naming variations, preferring the entry from the provider that matches the model's endpoint.

#### Scenario: Provider-scoped match preferred

- **WHEN** the same model id appears under several providers in the catalog and the model's base URL identifies one of them (e.g. `api.deepseek.com` → DeepSeek, `api.moonshot.*` → Moonshot, Gemini provider → Google, `openrouter.ai` → OpenRouter)
- **THEN** that provider's entry SHALL be used

#### Scenario: Cross-provider fallback is conservative

- **WHEN** no provider-scoped entry exists but the model id appears under other providers with different limits
- **THEN** the smallest context window and smallest output limit among those entries SHALL be used

#### Scenario: Name normalization

- **WHEN** the configured model name differs from a catalog id only by letter case, a `models/` prefix, or a `<vendor>/` prefix
- **THEN** it SHALL match that catalog entry

### Requirement: Limit source precedence

Each AI model configuration SHALL record where its limits came from (`catalog`, `probe`, or `manual`), and the limits used at runtime SHALL follow a fixed precedence.

#### Scenario: Manual values always win

- **WHEN** the user edits the context window or output limit fields and saves the model
- **THEN** the source SHALL be recorded as `manual`
- **AND** those values SHALL be used at runtime even if the catalog has different values

#### Scenario: Catalog wins over probed or legacy values

- **WHEN** a model's source is `probe`, or it has no recorded source (configurations saved before this change), and the catalog has an entry for it
- **THEN** the catalog values SHALL be used at runtime
- **AND** the stored configuration SHALL NOT be rewritten without the user saving the model

#### Scenario: Stored values used when catalog has no entry

- **WHEN** a model is not in the catalog and has stored limits
- **THEN** the stored limits SHALL be used, regardless of source

#### Scenario: Unknown window

- **WHEN** no source yields a positive context window (unknown or configured as unlimited)
- **THEN** the effective context window SHALL be reported as unknown

### Requirement: Auto-detect limits in model settings

The model settings limits action SHALL only consult the bundled models.dev catalog and SHALL NOT ask the configured model for its own limits.

#### Scenario: Catalog hit

- **WHEN** the user triggers auto-detect for a model present in the catalog
- **THEN** the form SHALL be filled with the catalog values, the source SHALL become `catalog`, and no model request SHALL be sent for limits
- **AND** the result message SHALL state that the values come from the model catalog

#### Scenario: Catalog miss preserves the form

- **WHEN** the user triggers auto-detect for a model absent from the catalog
- **THEN** no model request SHALL be sent and the existing form values and limit source SHALL remain unchanged
- **AND** the result message SHALL state that models.dev has no matching entry and the user can enter limits manually

### Requirement: Limit source is synchronized and backward compatible

The limit source SHALL be stored with the model configuration and synchronized like other model fields, without breaking older data or older clients.

#### Scenario: Older client receives new field

- **WHEN** a model configuration with a limit source is synchronized to a client that predates this change
- **THEN** that client SHALL load the model normally, ignoring the unknown field

#### Scenario: Newer client receives old data

- **WHEN** a model configuration without a limit source is loaded
- **THEN** it SHALL be treated as having no recorded source

### Requirement: Independent model availability test

Model settings SHALL provide a separate availability action using the current unsaved endpoint, credentials, headers, proxy selection and thinking level. The test SHALL send a bounded short generation request, time out after 30 seconds, and report success or the provider error without modifying or saving model configuration.

#### Scenario: Availability is independent of catalog coverage

- **WHEN** a model absent from models.dev is tested
- **THEN** a successful actual generation SHALL report availability without filling limits or marking the source as probe

#### Scenario: Stale test results are discarded

- **WHEN** the form changes or closes before a test completes
- **THEN** the request SHALL be cancelled and its late response SHALL NOT be displayed as the result of the current configuration

### Requirement: Model thinking level

Model settings SHALL persist an optional thinking level and pass it to all model generation tasks, including summaries and availability tests, using the SDK's provider mapping. Missing values SHALL retain provider defaults. Changing the level SHALL invalidate the previous context usage anchor.

#### Scenario: Thinking level survives save and reload

- **WHEN** a model is added or edited with a selected thinking level
- **THEN** the stored and synchronized configuration SHALL retain that selection and subsequent requests SHALL use it

#### Scenario: Legacy model keeps provider default

- **WHEN** a model without thinkingLevel is loaded
- **THEN** generation SHALL omit a reasoning override

#### Scenario: Catalog aliases preserve request identity

- **WHEN** a configured id ends with a recognized thinking level in parentheses
- **THEN** directory lookup MAY match the base id, while generation SHALL use the original id unchanged

### Requirement: Model identifier editing preserves focus

The editable model identifier control SHALL keep keyboard text input in the identifier field while suggestions open. It SHALL retain explicit filtering and keyboard selection without interrupting IME composition.

#### Scenario: Continuous typing with suggestions

- **WHEN** the user types consecutive characters in the identifier field
- **THEN** every character SHALL continue editing that field, without automatically moving focus to the popup filter, even if no suggestions exist

#### Scenario: Explicit filtering and keyboard navigation

- **WHEN** the user focuses the filter or selects a suggestion with navigation keys and Enter
- **THEN** filtering and selection SHALL remain available
